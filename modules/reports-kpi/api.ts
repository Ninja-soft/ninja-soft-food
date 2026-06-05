import { createClient } from "@/lib/supabase/client";

// Reportes + KPIs de costos (Fase 3).
//
// Patrón heredado del dashboard (modules/dashboard/api.ts): las agregaciones se
// hacen en JS sobre conjuntos acotados por rango de fechas. El volumen por tenant
// en esta fase es chico y RLS ya scopea por tenant. La optimización futura
// (docs/06) es mover estos cálculos a views / funciones SQL al estilo
// `sales_report_*` del POS y consumirlas vía RPC, sin tocar la firma de estos
// helpers ni los hooks.
//
// La lógica de agregación vive en funciones PURAS exportadas (reciben filas,
// devuelven agregados) para poder testearla sin Supabase
// (tests/unit/reports-kpi.test.ts). Los fetchers async solo arman la query,
// delegan el cálculo y devuelven el resultado.

// ── Rango ─────────────────────────────────────────────────────────────────────

export type ReportRange = {
  /** ISO date (YYYY-MM-DD) inclusivo. */
  from: string;
  /** ISO date (YYYY-MM-DD) inclusivo. */
  to: string;
};

const DAY_MS = 86_400_000;

function parseDay(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/** Cantidad de días (inclusivos) que abarca el rango. */
export function rangeDays(range: ReportRange): number {
  const diff = parseDay(range.to).getTime() - parseDay(range.from).getTime();
  return Math.floor(diff / DAY_MS) + 1;
}

/**
 * Granularidad del bucketing de producción: día para rangos cortos (<= 31 días),
 * semana para rangos más largos (evita ejes con cientos de barras). Mismo criterio
 * de UX que el reporte por día del POS, extendido a semanas para rangos amplios.
 */
export type Bucketing = "day" | "week";

export function bucketingFor(range: ReportRange): Bucketing {
  return rangeDays(range) <= 31 ? "day" : "week";
}

/** Lunes (inicio de semana ISO) del día dado, como ISO date. */
function weekStartIso(d: Date): string {
  const copy = new Date(d.getTime());
  const dow = (copy.getDay() + 6) % 7; // 0 = lunes
  copy.setDate(copy.getDate() - dow);
  return isoDay(copy);
}

const MONTH_SHORT = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
];

function dayLabel(iso: string): string {
  const d = parseDay(iso);
  return `${d.getDate()}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function weekLabel(iso: string): string {
  const d = parseDay(iso);
  return `${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`;
}

// ── Reporte de producción ─────────────────────────────────────────────────────

export type ProductionRow = {
  production_date: string;
  quantity_kg: number | null;
};

export type ProductionBucket = {
  /** Clave del bucket: ISO date del día o del lunes de la semana. */
  key: string;
  /** Etiqueta para el eje. */
  label: string;
  kg: number;
  count: number;
};

export type ProductionReport = {
  bucketing: Bucketing;
  buckets: ProductionBucket[];
  totalKg: number;
  totalCount: number;
  /** Promedio de kg por bucket con producción (null si no hubo). */
  avgKgPerBucket: number | null;
};

/**
 * PURA: agrupa producciones por día o semana dentro del rango y calcula totales.
 * Genera todos los buckets del rango (incluso vacíos) para un eje continuo.
 */
export function aggregateProductionReport(
  rows: ProductionRow[],
  range: ReportRange,
  bucketing: Bucketing = bucketingFor(range),
): ProductionReport {
  const buckets = new Map<string, ProductionBucket>();

  // Sembrar buckets vacíos para todo el rango (eje continuo).
  const from = parseDay(range.from);
  const to = parseDay(range.to);
  for (let t = from.getTime(); t <= to.getTime(); t += DAY_MS) {
    const d = new Date(t);
    const key = bucketing === "day" ? isoDay(d) : weekStartIso(d);
    if (buckets.has(key)) continue;
    buckets.set(key, {
      key,
      label: bucketing === "day" ? dayLabel(key) : weekLabel(key),
      kg: 0,
      count: 0,
    });
  }

  for (const row of rows) {
    if (!row.production_date) continue;
    if (row.production_date < range.from || row.production_date > range.to)
      continue;
    const d = parseDay(row.production_date);
    const key = bucketing === "day" ? isoDay(d) : weekStartIso(d);
    const bucket = buckets.get(key);
    if (!bucket) continue;
    bucket.kg += row.quantity_kg ?? 0;
    bucket.count += 1;
  }

  const ordered = [...buckets.values()].sort((a, b) =>
    a.key < b.key ? -1 : a.key > b.key ? 1 : 0,
  );
  const totalKg = ordered.reduce((a, b) => a + b.kg, 0);
  const totalCount = ordered.reduce((a, b) => a + b.count, 0);
  const withData = ordered.filter((b) => b.count > 0).length;

  return {
    bucketing,
    buckets: ordered,
    totalKg,
    totalCount,
    avgKgPerBucket: withData > 0 ? totalKg / withData : null,
  };
}

export async function getProductionReport(
  range: ReportRange,
): Promise<ProductionReport> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("productions")
    .select("production_date, quantity_kg")
    .is("deleted_at", null)
    .eq("status", "completed")
    .gte("production_date", range.from)
    .lte("production_date", range.to)
    .order("production_date", { ascending: true });
  if (error) throw error;
  return aggregateProductionReport((data ?? []) as ProductionRow[], range);
}

// ── Reporte de costos por receta ──────────────────────────────────────────────

/**
 * Fila de producción con su receta e inputs (con unit_cost del lote consumido).
 * Costo de un input = taken_qty × unit_cost del stock_entry. Inputs sin
 * stock_entry o sin unit_cost cuentan como "costo desconocido" (cobertura).
 */
export type CostProductionRow = {
  id: string;
  recipe_id: string;
  quantity_kg: number | null;
  recipe: { title: string; commercial_name: string | null } | null;
  inputs: Array<{
    taken_qty: number | null;
    stock_entry: { unit_cost: number | null } | null;
  }> | null;
};

export type RecipeCostRow = {
  recipeId: string;
  recipeName: string;
  kg: number;
  productions: number;
  /** Costo total de insumos con costo conocido. */
  totalCost: number;
  /** Costo por kg producido (null si no hay kg). */
  costPerKg: number | null;
  /** Cantidad de inputs totales. */
  inputsTotal: number;
  /** Inputs con unit_cost conocido. */
  inputsCovered: number;
  /** % de cobertura de costos (0-100, null si no hubo inputs). */
  coveragePct: number | null;
};

export type CostReport = {
  rows: RecipeCostRow[];
  totalCost: number;
  totalKg: number;
  /** Costo por kg global (null si no hay kg). */
  costPerKg: number | null;
  /** Total de inputs sin unit_cost cargado en todo el rango. */
  uncoveredInputs: number;
  inputsTotal: number;
  /** % de cobertura global (null si no hubo inputs). */
  coveragePct: number | null;
};

/**
 * PURA: agrega el costo de insumos por receta. Ordena por costo total desc.
 * Un input aporta a totalCost solo si tiene stock_entry con unit_cost; siempre
 * cuenta para inputsTotal (la cobertura mide cuántos tenían costo cargado).
 */
export function aggregateCostReport(rows: CostProductionRow[]): CostReport {
  const byRecipe = new Map<string, RecipeCostRow>();

  for (const prod of rows) {
    const recipeName =
      prod.recipe?.commercial_name || prod.recipe?.title || "(receta eliminada)";
    const row =
      byRecipe.get(prod.recipe_id) ??
      ({
        recipeId: prod.recipe_id,
        recipeName,
        kg: 0,
        productions: 0,
        totalCost: 0,
        costPerKg: null,
        inputsTotal: 0,
        inputsCovered: 0,
        coveragePct: null,
      } satisfies RecipeCostRow);

    row.kg += prod.quantity_kg ?? 0;
    row.productions += 1;

    for (const input of prod.inputs ?? []) {
      row.inputsTotal += 1;
      const unitCost = input.stock_entry?.unit_cost;
      if (unitCost !== null && unitCost !== undefined) {
        row.inputsCovered += 1;
        row.totalCost += (input.taken_qty ?? 0) * unitCost;
      }
    }

    byRecipe.set(prod.recipe_id, row);
  }

  const rowsOut = [...byRecipe.values()];
  for (const row of rowsOut) {
    row.costPerKg = row.kg > 0 ? row.totalCost / row.kg : null;
    row.coveragePct =
      row.inputsTotal > 0 ? (row.inputsCovered / row.inputsTotal) * 100 : null;
  }
  rowsOut.sort((a, b) => b.totalCost - a.totalCost);

  const totalCost = rowsOut.reduce((a, r) => a + r.totalCost, 0);
  const totalKg = rowsOut.reduce((a, r) => a + r.kg, 0);
  const inputsTotal = rowsOut.reduce((a, r) => a + r.inputsTotal, 0);
  const inputsCovered = rowsOut.reduce((a, r) => a + r.inputsCovered, 0);

  return {
    rows: rowsOut,
    totalCost,
    totalKg,
    costPerKg: totalKg > 0 ? totalCost / totalKg : null,
    uncoveredInputs: inputsTotal - inputsCovered,
    inputsTotal,
    coveragePct: inputsTotal > 0 ? (inputsCovered / inputsTotal) * 100 : null,
  };
}

export async function getCostReport(range: ReportRange): Promise<CostReport> {
  const supabase = createClient();
  // Producciones del rango con sus inputs + el unit_cost del lote consumido,
  // en una sola query con relaciones (production_inputs → stock_entries).
  const { data, error } = await supabase
    .from("productions")
    .select(
      `id, recipe_id, quantity_kg,
       recipe:recipes(title, commercial_name),
       inputs:production_inputs(
         taken_qty,
         stock_entry:stock_entries(unit_cost)
       )`,
    )
    .is("deleted_at", null)
    .eq("status", "completed")
    .gte("production_date", range.from)
    .lte("production_date", range.to);
  if (error) throw error;
  return aggregateCostReport((data ?? []) as unknown as CostProductionRow[]);
}

// ── Reporte de despachos por cliente ──────────────────────────────────────────

export type DispatchRow = {
  customer: { name: string } | null;
  items: Array<{ quantity_kg: number | null }> | null;
};

export type CustomerDispatchRow = {
  customerName: string;
  kg: number;
  dispatches: number;
};

export type DispatchReport = {
  rows: CustomerDispatchRow[];
  totalKg: number;
  totalDispatches: number;
};

/**
 * PURA: agrega kg despachados por cliente. Ordena por kg desc (top clientes).
 * Suma kg de los ítems de cada despacho. No incluye anulados (se filtran en la query).
 */
export function aggregateDispatchReport(rows: DispatchRow[]): DispatchReport {
  const byCustomer = new Map<string, CustomerDispatchRow>();

  for (const dispatch of rows) {
    const name = dispatch.customer?.name ?? "(cliente eliminado)";
    const row =
      byCustomer.get(name) ??
      ({ customerName: name, kg: 0, dispatches: 0 } satisfies CustomerDispatchRow);
    row.kg += (dispatch.items ?? []).reduce((a, it) => a + (it.quantity_kg ?? 0), 0);
    row.dispatches += 1;
    byCustomer.set(name, row);
  }

  const rowsOut = [...byCustomer.values()].sort((a, b) => b.kg - a.kg);

  return {
    rows: rowsOut,
    totalKg: rowsOut.reduce((a, r) => a + r.kg, 0),
    totalDispatches: rowsOut.reduce((a, r) => a + r.dispatches, 0),
  };
}

export async function getDispatchReport(
  range: ReportRange,
): Promise<DispatchReport> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("dispatches")
    .select(
      `id,
       customer:customers(name),
       items:dispatch_items(quantity_kg)`,
    )
    .is("deleted_at", null)
    .neq("status", "voided")
    .gte("dispatch_date", range.from)
    .lte("dispatch_date", range.to);
  if (error) throw error;
  return aggregateDispatchReport((data ?? []) as unknown as DispatchRow[]);
}
