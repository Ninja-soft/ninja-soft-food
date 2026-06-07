import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  mapPreapprovalStatus,
  verifyMpSignature,
  mercadopago,
} from "@/lib/billing/mercadopago";
import { getBillingProvider, DEFAULT_PROVIDER } from "@/lib/billing";
import {
  parsePlanLimits,
  limitFor,
  hasFeature,
  type PlanLimits,
} from "@/lib/billing/limits";
import { resolvePlanPrice } from "@/lib/billing/pricing";

const SECRET = "test_webhook_secret_123";

/** Construye un header x-signature válido para un manifest dado (algoritmo MP). */
function signManifest(dataId: string, requestId: string, ts: string): string {
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  const v1 = createHmac("sha256", SECRET).update(manifest).digest("hex");
  return `ts=${ts},v1=${v1}`;
}

describe("verifyMpSignature", () => {
  const dataId = "123456789";
  const requestId = "req-abc-001";
  const ts = "1700000000";
  // Reloj inyectado coherente con el ts firmado (ventana anti-replay de 15 min).
  const NOW = 1700000000 * 1000 + 60_000;

  it("acepta una firma válida", () => {
    const header = signManifest(dataId, requestId, ts);
    expect(
      verifyMpSignature({
        signatureHeader: header,
        requestId,
        dataId,
        secret: SECRET,
        nowMs: NOW,
      }),
    ).toBe(true);
  });

  it("rechaza si el secret no coincide", () => {
    const header = signManifest(dataId, requestId, ts);
    expect(
      verifyMpSignature({
        signatureHeader: header,
        requestId,
        dataId,
        secret: "otro_secret",
        nowMs: NOW,
      }),
    ).toBe(false);
  });

  it("rechaza si data.id fue manipulado", () => {
    const header = signManifest(dataId, requestId, ts);
    expect(
      verifyMpSignature({
        signatureHeader: header,
        requestId,
        dataId: "999999999",
        secret: SECRET,
        nowMs: NOW,
      }),
    ).toBe(false);
  });

  it("rechaza header ausente o malformado", () => {
    expect(
      verifyMpSignature({
        signatureHeader: null,
        requestId,
        dataId,
        secret: SECRET,
        nowMs: NOW,
      }),
    ).toBe(false);
    expect(
      verifyMpSignature({
        signatureHeader: "ts=1700000000",
        requestId,
        dataId,
        secret: SECRET,
        nowMs: NOW,
      }),
    ).toBe(false);
  });

  it("rechaza si falta el secret", () => {
    const header = signManifest(dataId, requestId, ts);
    expect(
      verifyMpSignature({
        signatureHeader: header,
        requestId,
        dataId,
        secret: "",
        nowMs: NOW,
      }),
    ).toBe(false);
  });

  it("normaliza data.id alfanumérico a minúsculas (como MP)", () => {
    const mixed = "ABCdef123";
    const header = signManifest(mixed, requestId, ts);
    expect(
      verifyMpSignature({
        signatureHeader: header,
        requestId,
        dataId: mixed.toUpperCase(),
        secret: SECRET,
        nowMs: NOW,
      }),
    ).toBe(true);
  });

  it("rechaza un ts fuera de la ventana anti-replay (15 min)", () => {
    const header = signManifest(dataId, requestId, ts);
    const sixteenMinLater = 1700000000 * 1000 + 16 * 60_000;
    expect(
      verifyMpSignature({
        signatureHeader: header,
        requestId,
        dataId,
        secret: SECRET,
        nowMs: sixteenMinLater,
      }),
    ).toBe(false);
  });

  it("acepta ts en milisegundos (tolerancia de unidad)", () => {
    const tsMs = String(1700000000 * 1000);
    const header = signManifest(dataId, requestId, tsMs);
    expect(
      verifyMpSignature({
        signatureHeader: header,
        requestId,
        dataId,
        secret: SECRET,
        nowMs: NOW,
      }),
    ).toBe(true);
  });
});

describe("mapPreapprovalStatus — MP → tenant_status canónico", () => {
  it("mapea los estados del contrato", () => {
    expect(mapPreapprovalStatus("authorized")).toBe("active");
    expect(mapPreapprovalStatus("paused")).toBe("past_due");
    expect(mapPreapprovalStatus("cancelled")).toBe("cancelled");
    expect(mapPreapprovalStatus("pending")).toBe("trial");
  });

  it("devuelve null para estados desconocidos", () => {
    expect(mapPreapprovalStatus("weird_state")).toBeNull();
    expect(mapPreapprovalStatus("")).toBeNull();
  });
});

describe("getBillingProvider — factory", () => {
  it("devuelve Mercado Pago por defecto", () => {
    expect(DEFAULT_PROVIDER).toBe("mercadopago");
    expect(getBillingProvider().key).toBe("mercadopago");
    expect(getBillingProvider("mercadopago")).toBe(mercadopago);
  });

  it("lanza para pasarelas no soportadas en esta fase", () => {
    expect(() => getBillingProvider("stripe")).toThrow();
    expect(() => getBillingProvider("paypal")).toThrow();
  });
});

describe("parseWebhook — normalización + idempotencia", () => {
  it("identifica un evento de suscripción y compone un eventId estable", () => {
    const ev = mercadopago.parseWebhook({
      searchParams: new URLSearchParams(),
      body: { type: "subscription_preapproval", data: { id: "pre_1" } },
    });
    expect(ev).not.toBeNull();
    expect(ev?.resource).toBe("subscription");
    expect(ev?.resourceId).toBe("pre_1");
    // mismo input → mismo eventId (clave de idempotencia en payment_events).
    const ev2 = mercadopago.parseWebhook({
      searchParams: new URLSearchParams(),
      body: { type: "subscription_preapproval", data: { id: "pre_1" } },
    });
    expect(ev2?.eventId).toBe(ev?.eventId);
  });

  it("prefiere el id propio del evento cuando MP lo manda", () => {
    const ev = mercadopago.parseWebhook({
      searchParams: new URLSearchParams(),
      body: { id: 998877, type: "payment", data: { id: "pay_9" } },
    });
    expect(ev?.eventId).toBe("998877");
    expect(ev?.resource).toBe("payment");
    expect(ev?.resourceId).toBe("pay_9");
  });

  it("lee data.id desde el query string si no hay body", () => {
    const ev = mercadopago.parseWebhook({
      searchParams: new URLSearchParams("type=subscription_preapproval&data.id=pre_q"),
      body: null,
    });
    expect(ev?.resource).toBe("subscription");
    expect(ev?.resourceId).toBe("pre_q");
  });

  it("devuelve null si no hay nada accionable", () => {
    expect(
      mercadopago.parseWebhook({ searchParams: new URLSearchParams(), body: null }),
    ).toBeNull();
  });
});

describe("parsePlanLimits — jsonb tipado", () => {
  it("parsea límites y features, null = ilimitado", () => {
    const limits = parsePlanLimits({
      max_establishments: 1,
      max_users: 3,
      max_recipes: null,
      max_productions_per_month: 100,
      configurable_forms: false,
      quality_module: true,
    });
    expect(limits.max_establishments).toBe(1);
    expect(limits.max_users).toBe(3);
    expect(limits.max_recipes).toBeNull();
    expect(limits.max_productions_per_month).toBe(100);
    expect(limits.configurable_forms).toBe(false);
    expect(limits.quality_module).toBe(true);
    // ausentes → defaults seguros.
    expect(limits.api_access).toBe(false);
    expect(limits.white_label).toBe(false);
  });

  it("tolera jsonb nulo / inválido con defaults", () => {
    const a = parsePlanLimits(null);
    expect(a.max_users).toBeNull();
    expect(a.quality_module).toBe(false);
    const b = parsePlanLimits("no-soy-objeto" as unknown as null);
    expect(b.max_recipes).toBeNull();
  });

  it("limitFor y hasFeature leen el campo correcto", () => {
    const limits: PlanLimits = parsePlanLimits({
      max_establishments: 5,
      max_users: null,
      api_access: true,
    });
    expect(limitFor(limits, "establishments")).toBe(5);
    expect(limitFor(limits, "users")).toBeNull();
    expect(hasFeature(limits, "api_access")).toBe(true);
    expect(hasFeature(limits, "white_label")).toBe(false);
  });
});

describe("resolvePlanPrice — moneda + monto del preapproval", () => {
  const prices = {
    monthly_price_ars: 30000,
    yearly_price_ars: 300000,
    monthly_price_usd: 30,
  };

  it("ARS mensual → precio ARS mensual", () => {
    expect(resolvePlanPrice(prices, "monthly", "ARS")).toEqual({
      currency: "ARS",
      amount: 30000,
    });
  });

  it("ARS anual → precio ARS anual", () => {
    expect(resolvePlanPrice(prices, "yearly", "ARS")).toEqual({
      currency: "ARS",
      amount: 300000,
    });
  });

  it("MXN (no-ARS) cae a USD como fallback documentado", () => {
    // MP cobra en la moneda local de la cuenta; el caller valida soporte. Acá
    // verificamos solo la regla de resolución de precio: no-ARS → USD.
    expect(resolvePlanPrice(prices, "monthly", "MXN")).toEqual({
      currency: "USD",
      amount: 30,
    });
  });

  it("no-ARS anual compone USD mensual × 12 (no hay yearly_usd)", () => {
    expect(resolvePlanPrice(prices, "yearly", "MXN")).toEqual({
      currency: "USD",
      amount: 360,
    });
  });

  it("normaliza la moneda case-insensitive", () => {
    expect(resolvePlanPrice(prices, "monthly", "ars")?.currency).toBe("ARS");
  });

  it("devuelve null si el plan no tiene precio cobrable en la moneda", () => {
    // Enterprise "a medida": sin precio ARS.
    const noArs = { ...prices, monthly_price_ars: null, yearly_price_ars: null };
    expect(resolvePlanPrice(noArs, "monthly", "ARS")).toBeNull();
    // Tenant no-ARS de un plan sin precio USD cargado.
    const noUsd = { ...prices, monthly_price_usd: null };
    expect(resolvePlanPrice(noUsd, "monthly", "MXN")).toBeNull();
  });
});

describe("formatters por locale — es-MX vs es-AR", () => {
  // Verifica que el mismo número/fecha se formatea distinto según el locale del
  // tenant (operating profile). es-AR y es-MX difieren en separadores.
  it("número: es-AR usa coma decimal, es-MX usa punto decimal", () => {
    const value = 1234.5;
    const ar = new Intl.NumberFormat("es-AR", {
      maximumFractionDigits: 3,
    }).format(value);
    const mx = new Intl.NumberFormat("es-MX", {
      maximumFractionDigits: 3,
    }).format(value);
    expect(ar).toBe("1.234,5");
    expect(mx).toBe("1,234.5");
    expect(ar).not.toBe(mx);
  });

  it("fecha: es-AR y es-MX usan dd/mm/yyyy pero son locales distintos", () => {
    const d = new Date(Date.UTC(2026, 0, 5));
    const opts: Intl.DateTimeFormatOptions = {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "UTC",
    };
    const ar = new Intl.DateTimeFormat("es-AR", opts).format(d);
    const mx = new Intl.DateTimeFormat("es-MX", opts).format(d);
    expect(ar).toBe("05/01/2026");
    expect(mx).toBe("05/01/2026");
  });
});
