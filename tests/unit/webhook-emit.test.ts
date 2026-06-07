import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildDispatchCreatedPayload,
  buildDispatchVoidedPayload,
  buildProductionCompletedPayload,
  buildStockEntryCreatedPayload,
  EMITTABLE_EVENTS,
  isDeliveredStatus,
  isEmittableEvent,
  isRetryable,
  MAX_DELIVERY_ATTEMPTS,
  selectNewResources,
  type DispatchRow,
  type ProductionRow,
  type StockEntryRow,
} from "@/lib/api/webhook-emit";
import {
  buildDeliveryBody,
  signPayload,
  verifySignatureHeader,
} from "@/lib/api/webhooks";

// =============================================================================
// tests/unit/webhook-emit.test.ts — lógica pura del emisor outbox de eventos.
//   - detección de recursos nuevos por cursor (idempotencia)
//   - payload builders por evento (compactos, sin fuga de otros tenants)
//   - catálogo emitible / backoff de reintentos
//   - cuerpo canónico de entrega + firma HMAC (ya testeada en api-v1, re-check)
// =============================================================================

describe("EMITTABLE_EVENTS / isEmittableEvent", () => {
  it("incluye exactamente los 4 eventos de fila del outbox", () => {
    expect([...EMITTABLE_EVENTS]).toEqual([
      "production.completed",
      "dispatch.created",
      "dispatch.voided",
      "stock.entry_created",
    ]);
  });

  it("stock.low NO es emitible por el outbox (es de umbral)", () => {
    expect(isEmittableEvent("stock.low")).toBe(false);
  });

  it("reconoce los emitibles y rechaza desconocidos", () => {
    expect(isEmittableEvent("production.completed")).toBe(true);
    expect(isEmittableEvent("dispatch.voided")).toBe(true);
    expect(isEmittableEvent("nope")).toBe(false);
    expect(isEmittableEvent("")).toBe(false);
  });
});

describe("selectNewResources — corte por cursor (idempotencia)", () => {
  const rows = [
    { id: "a", created_at: "2026-06-01T00:00:00.000Z" },
    { id: "b", created_at: "2026-06-02T00:00:00.000Z" },
    { id: "c", created_at: "2026-06-03T00:00:00.000Z" },
  ];

  it("sin cursor: toma los `limit` más recientes en orden cronológico", () => {
    const out = selectNewResources(rows, null, 2);
    expect(out.map((r) => r.id)).toEqual(["b", "c"]);
  });

  it("sin cursor y limit alto: devuelve todo cronológicamente", () => {
    const out = selectNewResources(rows, null, 50);
    expect(out.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("con cursor: solo lo estrictamente posterior al cursor", () => {
    const out = selectNewResources(rows, "2026-06-01T00:00:00.000Z", 50);
    expect(out.map((r) => r.id)).toEqual(["b", "c"]);
  });

  it("idempotencia: cursor == último ya encolado no reentra nada", () => {
    const out = selectNewResources(rows, "2026-06-03T00:00:00.000Z", 50);
    expect(out).toEqual([]);
  });

  it("cursor en el medio: corta exactamente", () => {
    const out = selectNewResources(rows, "2026-06-02T00:00:00.000Z", 50);
    expect(out.map((r) => r.id)).toEqual(["c"]);
  });

  it("orden de entrada irrelevante: siempre sale cronológico ascendente", () => {
    const shuffled = [rows[2], rows[0], rows[1]];
    const out = selectNewResources(shuffled, null, 50);
    expect(out.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("cursor inválido se trata como sin cursor", () => {
    const out = selectNewResources(rows, "basura", 50);
    expect(out.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("respeta el limit aun con cursor", () => {
    const out = selectNewResources(rows, "2026-06-01T00:00:00.000Z", 1);
    expect(out.map((r) => r.id)).toEqual(["b"]);
  });
});

describe("payload builders — compactos y con resource_created_at correcto", () => {
  const production: ProductionRow = {
    id: "p1",
    tenant_id: "t1",
    code: "PROD-00012",
    status: "completed",
    production_date: "2026-05-30",
    packaging_date: null,
    quantity_kg: 120.5,
    product_lot_number: "L260530-0012",
    product_expiry_date: "2026-07-29",
    recipe_id: "r1",
    created_at: "2026-05-30T10:00:00.000Z",
  };

  it("production.completed: ids + datos clave, cursor = created_at", () => {
    const b = buildProductionCompletedPayload(production);
    expect(b.resource_id).toBe("p1");
    expect(b.resource_created_at).toBe("2026-05-30T10:00:00.000Z");
    expect(b.data).toMatchObject({
      id: "p1",
      tenant_id: "t1",
      code: "PROD-00012",
      quantity_kg: 120.5,
      product_lot_number: "L260530-0012",
      recipe_id: "r1",
    });
  });

  const dispatch: DispatchRow = {
    id: "d1",
    tenant_id: "t1",
    dispatch_date: "2026-06-01",
    status: "delivered",
    customer_id: "c1",
    vehicle_id: "v1",
    created_at: "2026-06-01T08:00:00.000Z",
    updated_at: "2026-06-05T09:30:00.000Z",
  };

  it("dispatch.created: cursor = created_at", () => {
    const b = buildDispatchCreatedPayload(dispatch);
    expect(b.resource_id).toBe("d1");
    expect(b.resource_created_at).toBe("2026-06-01T08:00:00.000Z");
    expect(b.data).toMatchObject({
      id: "d1",
      customer_id: "c1",
      vehicle_id: "v1",
      status: "delivered",
    });
  });

  it("dispatch.voided: cursor = updated_at (momento de anulación)", () => {
    const voided = { ...dispatch, status: "voided" as const };
    const b = buildDispatchVoidedPayload(voided);
    expect(b.resource_created_at).toBe("2026-06-05T09:30:00.000Z");
    expect(b.data).toMatchObject({
      id: "d1",
      status: "voided",
      voided_at: "2026-06-05T09:30:00.000Z",
    });
  });

  const stock: StockEntryRow = {
    id: "s1",
    tenant_id: "t1",
    ingredient_id: "i1",
    lot_number: "MP-7781",
    quantity: 200,
    unit: "kg",
    expiry_date: "2026-06-10",
    is_frozen: false,
    supplier_id: "sup1",
    created_at: "2026-05-01T12:00:00.000Z",
  };

  it("stock.entry_created: lote + cantidad + cursor = created_at", () => {
    const b = buildStockEntryCreatedPayload(stock);
    expect(b.resource_id).toBe("s1");
    expect(b.resource_created_at).toBe("2026-05-01T12:00:00.000Z");
    expect(b.data).toMatchObject({
      id: "s1",
      lot_number: "MP-7781",
      quantity: 200,
      unit: "kg",
      supplier_id: "sup1",
    });
  });

  it("ningún payload incluye claves de otros tenants ni el secret", () => {
    const all = [
      buildProductionCompletedPayload(production).data,
      buildDispatchCreatedPayload(dispatch).data,
      buildStockEntryCreatedPayload(stock).data,
    ];
    for (const data of all) {
      expect(data.tenant_id).toBe("t1");
      expect("secret" in data).toBe(false);
    }
  });
});

describe("backoff de reintentos", () => {
  it("isRetryable hasta MAX_DELIVERY_ATTEMPTS", () => {
    expect(MAX_DELIVERY_ATTEMPTS).toBe(3);
    expect(isRetryable(0)).toBe(true);
    expect(isRetryable(2)).toBe(true);
    expect(isRetryable(3)).toBe(false);
    expect(isRetryable(4)).toBe(false);
  });

  it("isDeliveredStatus solo 2xx", () => {
    expect(isDeliveredStatus(200)).toBe(true);
    expect(isDeliveredStatus(204)).toBe(true);
    expect(isDeliveredStatus(299)).toBe(true);
    expect(isDeliveredStatus(0)).toBe(false);
    expect(isDeliveredStatus(404)).toBe(false);
    expect(isDeliveredStatus(500)).toBe(false);
    expect(isDeliveredStatus(301)).toBe(false);
  });
});

describe("buildDeliveryBody + firma — cuerpo canónico verificable", () => {
  const secret = "whsec_abc123";
  const ts = 1_700_000_000;

  it("buildDeliveryBody arma {event, created_at, data} determinístico", () => {
    const body = buildDeliveryBody("production.completed", { id: "p1" }, ts);
    const parsed = JSON.parse(body) as {
      event: string;
      created_at: string;
      data: { id: string };
    };
    expect(parsed.event).toBe("production.completed");
    expect(parsed.created_at).toBe(new Date(ts * 1000).toISOString());
    expect(parsed.data.id).toBe("p1");
  });

  it("el body es firmable y verificable lado receptor", () => {
    const body = buildDeliveryBody("dispatch.created", { id: "d1" }, ts);
    const header = `ts=${ts},v1=${signPayload(body, secret, ts)}`;
    expect(verifySignatureHeader(header, body, secret)).toBe(true);

    // Verificación cruda independiente (lo que haría el integrador).
    const expected = createHmac("sha256", secret)
      .update(`${ts}.${body}`)
      .digest("hex");
    expect(signPayload(body, secret, ts)).toBe(expected);
  });
});
