import { describe, expect, it } from "vitest";
import {
  aggregateCostReport,
  aggregateDispatchReport,
  aggregateProductionReport,
  bucketingFor,
  rangeDays,
  type CostProductionRow,
  type DispatchRow,
  type ProductionRow,
  type ReportRange,
} from "@/modules/reports-kpi/api";

// Tests de la lógica PURA de agregación de reportes (sin Supabase).

// ── Rango / bucketing ─────────────────────────────────────────────────────────

describe("rangeDays / bucketingFor", () => {
  it("cuenta días inclusivos", () => {
    expect(rangeDays({ from: "2026-01-01", to: "2026-01-01" })).toBe(1);
    expect(rangeDays({ from: "2026-01-01", to: "2026-01-07" })).toBe(7);
    expect(rangeDays({ from: "2026-01-01", to: "2026-01-31" })).toBe(31);
  });

  it("usa día para rangos cortos y semana para largos", () => {
    expect(bucketingFor({ from: "2026-01-01", to: "2026-01-31" })).toBe("day");
    expect(bucketingFor({ from: "2026-01-01", to: "2026-02-01" })).toBe("week");
    expect(bucketingFor({ from: "2026-01-01", to: "2026-03-31" })).toBe("week");
  });
});

// ── Producción ────────────────────────────────────────────────────────────────

describe("aggregateProductionReport (bucketing por día)", () => {
  const range: ReportRange = { from: "2026-01-01", to: "2026-01-03" };
  const rows: ProductionRow[] = [
    { production_date: "2026-01-01", quantity_kg: 10 },
    { production_date: "2026-01-01", quantity_kg: 5 },
    { production_date: "2026-01-03", quantity_kg: 20 },
  ];

  it("siembra un bucket por cada día del rango (eje continuo)", () => {
    const r = aggregateProductionReport(rows, range, "day");
    expect(r.buckets).toHaveLength(3);
    expect(r.buckets.map((b) => b.key)).toEqual([
      "2026-01-01",
      "2026-01-02",
      "2026-01-03",
    ]);
  });

  it("agrupa kg y cantidad por día", () => {
    const r = aggregateProductionReport(rows, range, "day");
    expect(r.buckets[0]).toMatchObject({ kg: 15, count: 2 });
    expect(r.buckets[1]).toMatchObject({ kg: 0, count: 0 });
    expect(r.buckets[2]).toMatchObject({ kg: 20, count: 1 });
  });

  it("calcula totales y promedio sobre buckets con producción", () => {
    const r = aggregateProductionReport(rows, range, "day");
    expect(r.totalKg).toBe(35);
    expect(r.totalCount).toBe(3);
    // 35 kg repartidos en 2 días con producción.
    expect(r.avgKgPerBucket).toBe(17.5);
  });

  it("ignora filas fuera del rango y kg nulos", () => {
    const r = aggregateProductionReport(
      [
        { production_date: "2025-12-31", quantity_kg: 999 },
        { production_date: "2026-01-02", quantity_kg: null },
      ],
      range,
      "day",
    );
    expect(r.totalKg).toBe(0);
    expect(r.totalCount).toBe(1); // la del 02 cuenta como producción, kg 0
    expect(r.avgKgPerBucket).toBe(0);
  });

  it("devuelve avg null cuando no hubo producción", () => {
    const r = aggregateProductionReport([], range, "day");
    expect(r.totalCount).toBe(0);
    expect(r.avgKgPerBucket).toBeNull();
  });
});

describe("aggregateProductionReport (bucketing por semana)", () => {
  // Enero 2026: 2026-01-01 es jueves. Semana ISO empieza lunes.
  const range: ReportRange = { from: "2026-01-01", to: "2026-01-14" };
  const rows: ProductionRow[] = [
    { production_date: "2026-01-01", quantity_kg: 10 }, // semana del 29/12
    { production_date: "2026-01-05", quantity_kg: 7 }, // semana del 05/01
    { production_date: "2026-01-12", quantity_kg: 3 }, // semana del 12/01
  ];

  it("agrupa por lunes de cada semana", () => {
    const r = aggregateProductionReport(rows, range, "week");
    const byKey = Object.fromEntries(r.buckets.map((b) => [b.key, b.kg]));
    expect(byKey["2025-12-29"]).toBe(10);
    expect(byKey["2026-01-05"]).toBe(7);
    expect(byKey["2026-01-12"]).toBe(3);
    expect(r.totalKg).toBe(20);
  });
});

// ── Costos ────────────────────────────────────────────────────────────────────

describe("aggregateCostReport", () => {
  const rows: CostProductionRow[] = [
    {
      id: "p1",
      recipe_id: "r1",
      quantity_kg: 10,
      recipe: { title: "Salsa", commercial_name: null },
      inputs: [
        { taken_qty: 2, stock_entry: { unit_cost: 100 } }, // 200
        { taken_qty: 3, stock_entry: { unit_cost: 50 } }, // 150
        { taken_qty: 5, stock_entry: null }, // desconocido
      ],
    },
    {
      id: "p2",
      recipe_id: "r1",
      quantity_kg: 10,
      recipe: { title: "Salsa", commercial_name: null },
      inputs: [
        { taken_qty: 1, stock_entry: { unit_cost: null } }, // desconocido
      ],
    },
    {
      id: "p3",
      recipe_id: "r2",
      quantity_kg: 4,
      recipe: { title: "Pasta", commercial_name: "Pasta Premium" },
      inputs: [{ taken_qty: 8, stock_entry: { unit_cost: 10 } }], // 80
    },
  ];

  it("acumula costo solo de inputs con unit_cost y agrupa por receta", () => {
    const r = aggregateCostReport(rows);
    const salsa = r.rows.find((x) => x.recipeId === "r1")!;
    expect(salsa.kg).toBe(20);
    expect(salsa.productions).toBe(2);
    expect(salsa.totalCost).toBe(350); // 200 + 150
    expect(salsa.inputsTotal).toBe(4);
    expect(salsa.inputsCovered).toBe(2);
    expect(salsa.coveragePct).toBe(50);
    expect(salsa.costPerKg).toBe(17.5); // 350 / 20
  });

  it("usa commercial_name si existe, sino title", () => {
    const r = aggregateCostReport(rows);
    expect(r.rows.find((x) => x.recipeId === "r1")!.recipeName).toBe("Salsa");
    expect(r.rows.find((x) => x.recipeId === "r2")!.recipeName).toBe(
      "Pasta Premium",
    );
  });

  it("ordena por costo total descendente", () => {
    const r = aggregateCostReport(rows);
    expect(r.rows.map((x) => x.recipeId)).toEqual(["r1", "r2"]); // 350 > 80
  });

  it("calcula totales y cobertura global", () => {
    const r = aggregateCostReport(rows);
    expect(r.totalCost).toBe(430); // 350 + 80
    expect(r.totalKg).toBe(24); // 20 + 4
    expect(r.inputsTotal).toBe(5);
    expect(r.uncoveredInputs).toBe(2);
    expect(r.coveragePct).toBe(60); // 3 de 5
    expect(r.costPerKg).toBeCloseTo(430 / 24, 6);
  });

  it("devuelve nulls cuando no hay kg ni inputs", () => {
    const r = aggregateCostReport([
      {
        id: "x",
        recipe_id: "r9",
        quantity_kg: 0,
        recipe: { title: "Vacía", commercial_name: null },
        inputs: [],
      },
    ]);
    const row = r.rows[0];
    expect(row.costPerKg).toBeNull();
    expect(row.coveragePct).toBeNull();
    expect(r.costPerKg).toBeNull();
    expect(r.coveragePct).toBeNull();
  });
});

// ── Despachos ─────────────────────────────────────────────────────────────────

describe("aggregateDispatchReport", () => {
  const rows: DispatchRow[] = [
    {
      customer: { name: "Cliente A" },
      items: [{ quantity_kg: 10 }, { quantity_kg: 5 }],
    },
    { customer: { name: "Cliente B" }, items: [{ quantity_kg: 30 }] },
    { customer: { name: "Cliente A" }, items: [{ quantity_kg: 2 }] },
    { customer: null, items: [{ quantity_kg: null }] },
  ];

  it("suma kg por cliente y cuenta despachos", () => {
    const r = aggregateDispatchReport(rows);
    const a = r.rows.find((x) => x.customerName === "Cliente A")!;
    expect(a.kg).toBe(17); // 15 + 2
    expect(a.dispatches).toBe(2);
  });

  it("ordena top clientes por kg descendente", () => {
    const r = aggregateDispatchReport(rows);
    expect(r.rows[0].customerName).toBe("Cliente B"); // 30 kg
    expect(r.rows[1].customerName).toBe("Cliente A"); // 17 kg
  });

  it("maneja cliente nulo y kg nulos", () => {
    const r = aggregateDispatchReport(rows);
    const unknown = r.rows.find((x) => x.customerName === "(cliente eliminado)")!;
    expect(unknown.kg).toBe(0);
    expect(unknown.dispatches).toBe(1);
  });

  it("calcula totales globales", () => {
    const r = aggregateDispatchReport(rows);
    expect(r.totalKg).toBe(47); // 30 + 17 + 0
    expect(r.totalDispatches).toBe(4);
  });
});
