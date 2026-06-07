import { describe, expect, it } from "vitest";
import type { BackwardTrace, ForwardTrace } from "@/modules/trace/api";
import { buildTraceGraph } from "@/modules/trace/graph";

// Tests de la transformación PURA traza → grafo (sin React Flow ni Supabase).
// Cubren: conteo de nodos/aristas, despacho anulado marcado, sin duplicados.

// ── Fixtures ──────────────────────────────────────────────────────────────────

function dispatch(
  over: Partial<ForwardTrace["productions"][number]["dispatches"][number]> = {},
): ForwardTrace["productions"][number]["dispatches"][number] {
  return {
    dispatchId: "d1",
    dispatchItemId: "di1",
    dispatchDate: "2026-01-10",
    quantityKg: 50,
    voided: false,
    deleted: false,
    status: "completed",
    customer: {
      id: "c1",
      name: "Carnicería La Esquina",
      locality: "Quilmes",
      address: "Av. Mitre 100",
      phone: "11-1111",
      email: "c1@mail.com",
    },
    ...over,
  };
}

const forwardFixture: ForwardTrace = {
  origin: {
    stockEntryId: "se1",
    lotNumber: "MP-001",
    ingredientName: "Carne vacuna",
    unit: "kg",
    quantity: 200,
    remainingQuantity: 0,
    expiryDate: "2026-03-01",
    noTraceability: false,
    supplier: {
      id: "sup1",
      name: "Frigorífico Sur",
      rneNumber: "RNE-123",
      rneExpiry: "2027-01-01",
      contact: {},
    },
  },
  productions: [
    {
      productionId: "p1",
      code: "PROD-00001",
      productionDate: "2026-01-05",
      productLotNumber: "PT-LJ-001",
      productExpiryDate: "2026-02-05",
      recipeTitle: "Hamburguesa clásica",
      consumedQty: 80,
      consumedUnit: "kg",
      producedKg: 75,
      isSubstitute: false,
      // Dos despachos al MISMO cliente (debe colapsar a un nodo cliente).
      dispatches: [
        dispatch({ dispatchItemId: "di1" }),
        dispatch({ dispatchItemId: "di2", quantityKg: 25 }),
      ],
    },
    {
      productionId: "p2",
      code: "PROD-00002",
      productionDate: "2026-01-06",
      productLotNumber: "PT-LJ-002",
      productExpiryDate: "2026-02-06",
      recipeTitle: "Medallón premium",
      consumedQty: 40,
      consumedUnit: "kg",
      producedKg: 38,
      isSubstitute: false,
      // Despacho ANULADO a otro cliente.
      dispatches: [
        dispatch({
          dispatchItemId: "di3",
          voided: true,
          status: "voided",
          customer: {
            id: "c2",
            name: "Distribuidora Norte",
            locality: "San Isidro",
            address: null,
            phone: null,
            email: null,
          },
        }),
      ],
    },
  ],
  affectedCustomers: [],
  totalDispatchedKg: 100,
};

const backwardFixture: BackwardTrace = {
  production: {
    productionId: "p1",
    code: "PROD-00001",
    productionDate: "2026-01-05",
    packagingDate: "2026-01-05",
    productLotNumber: "PT-LJ-001",
    productExpiryDate: "2026-02-05",
    quantityKg: 75,
    recipeTitle: "Hamburguesa clásica",
    rnpaNumber: "RNPA-999",
  },
  inputs: [
    {
      inputId: "in1",
      ingredientName: "Carne vacuna",
      unit: "kg",
      takenQty: 80,
      isSubstitute: false,
      noOriginTrace: false,
      lotNumber: "MP-001",
      expiryDate: "2026-03-01",
      supplier: {
        id: "sup1",
        name: "Frigorífico Sur",
        rneNumber: "RNE-123",
        rneExpiry: "2027-01-01",
        contact: {},
      },
    },
    {
      inputId: "in2",
      ingredientName: "Sal fina",
      unit: "kg",
      takenQty: 2,
      isSubstitute: false,
      noOriginTrace: true, // stock infinito
      lotNumber: null,
      expiryDate: null,
      supplier: null,
    },
  ],
  dispatches: [
    dispatch({ dispatchItemId: "di1" }),
    dispatch({
      dispatchItemId: "di3",
      deleted: true,
      status: "completed",
      customer: {
        id: "c2",
        name: "Distribuidora Norte",
        locality: "San Isidro",
        address: null,
        phone: null,
        email: null,
      },
    }),
  ],
  affectedCustomers: [],
  totalDispatchedKg: 125,
};

// ── FORWARD ─────────────────────────────────────────────────────────────────

describe("buildTraceGraph · forward", () => {
  const g = buildTraceGraph({ direction: "forward", data: forwardFixture });

  it("crea un único nodo de origen (proveedor / MP)", () => {
    const suppliers = g.nodes.filter((n) => n.kind === "supplier");
    expect(suppliers).toHaveLength(1);
    expect(suppliers[0].badge).toBe("MP");
    expect(suppliers[0].id).toBe("supplier:se1");
  });

  it("crea un nodo por producción", () => {
    expect(g.nodes.filter((n) => n.kind === "production")).toHaveLength(2);
  });

  it("crea un nodo por despacho", () => {
    expect(g.nodes.filter((n) => n.kind === "dispatch")).toHaveLength(3);
  });

  it("colapsa clientes repetidos en un solo nodo (sin duplicados)", () => {
    const customers = g.nodes.filter((n) => n.kind === "customer");
    // di1 + di2 → c1 (mismo nodo), di3 → c2 ⇒ 2 nodos cliente.
    expect(customers).toHaveLength(2);
    const ids = customers.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("marca el despacho anulado como voided y deja el resto limpio", () => {
    const dispatches = g.nodes.filter((n) => n.kind === "dispatch");
    const voided = dispatches.filter((d) => d.voided);
    expect(voided).toHaveLength(1);
    expect(voided[0].title).toBe("Despacho anulado");
  });

  it("propaga el flag voided a las aristas del despacho anulado", () => {
    const voidedEdges = g.edges.filter((e) => e.voided);
    // di3: producción→despacho y despacho→cliente ⇒ 2 aristas voided.
    expect(voidedEdges).toHaveLength(2);
  });

  it("no genera nodos ni aristas con id duplicado", () => {
    const nodeIds = g.nodes.map((n) => n.id);
    const edgeIds = g.edges.map((e) => e.id);
    expect(new Set(nodeIds).size).toBe(nodeIds.length);
    expect(new Set(edgeIds).size).toBe(edgeIds.length);
  });

  it("toda arista referencia nodos existentes", () => {
    const ids = new Set(g.nodes.map((n) => n.id));
    for (const e of g.edges) {
      expect(ids.has(e.source)).toBe(true);
      expect(ids.has(e.target)).toBe(true);
    }
  });
});

// ── BACKWARD ────────────────────────────────────────────────────────────────

describe("buildTraceGraph · backward", () => {
  const g = buildTraceGraph({ direction: "backward", data: backwardFixture });

  it("crea un único nodo central de producción (PT)", () => {
    expect(g.nodes.filter((n) => n.kind === "production")).toHaveLength(1);
  });

  it("crea un nodo por insumo y marca stock infinito como sin origen", () => {
    const inputs = g.nodes.filter((n) => n.kind === "input");
    expect(inputs).toHaveLength(2);
    expect(inputs.filter((i) => i.noOriginTrace)).toHaveLength(1);
  });

  it("marca el despacho borrado como voided", () => {
    const dispatches = g.nodes.filter((n) => n.kind === "dispatch");
    expect(dispatches).toHaveLength(2);
    const voided = dispatches.filter((d) => d.voided);
    expect(voided).toHaveLength(1);
    expect(voided[0].title).toBe("Despacho borrado");
  });

  it("conecta insumos → producción → despachos → clientes", () => {
    const inToProd = g.edges.filter((e) => e.target === "production:p1");
    expect(inToProd).toHaveLength(2); // dos insumos
    const prodToDisp = g.edges.filter((e) => e.source === "production:p1");
    expect(prodToDisp).toHaveLength(2); // dos despachos
  });

  it("no genera nodos ni aristas con id duplicado", () => {
    const nodeIds = g.nodes.map((n) => n.id);
    const edgeIds = g.edges.map((e) => e.id);
    expect(new Set(nodeIds).size).toBe(nodeIds.length);
    expect(new Set(edgeIds).size).toBe(edgeIds.length);
  });
});
