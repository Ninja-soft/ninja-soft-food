import { createClient } from "@/lib/supabase/client";
import { getPermitLabel } from "@/lib/globalization/permitTypes";
import { daysUntil } from "@/lib/utils/format";
import { listAvailableEntries } from "@/modules/stock/api";
import type { PermitEntityType } from "@/modules/permits/schemas";
import {
  EXPIRING_SOON_DAYS,
  GLOBAL_LOW_STOCK_THRESHOLD,
} from "@/modules/stock/schemas";

// Agregaciones del dashboard del tenant.
//
// MVP: las agregaciones se hacen en el cliente sobre conjuntos acotados (últimos
// meses / próximos vencimientos), porque el volumen por tenant en esta fase es
// chico. La optimización futura (docs/06) es mover estos cálculos a views /
// funciones SQL al estilo `sales_report_*` del POS y consumirlas vía RPC, sin
// tocar la firma de estos helpers ni los hooks.

// ── Producción mensual (kg) ──────────────────────────────────────────────────

export type ProductionMonthPoint = {
  /** Clave YYYY-MM del mes. */
  key: string;
  /** Etiqueta corta "ene", "feb"… para el eje. */
  label: string;
  kg: number;
  count: number;
};

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const MONTH_LABELS = [
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

/**
 * kg producidos por mes en los últimos `months` meses (incluye el actual).
 * Lee `productions` completadas no borradas y agrupa por mes en JS.
 */
export async function getProductionSeries(
  months = 6,
  establishmentId?: string | null,
): Promise<ProductionMonthPoint[]> {
  const supabase = createClient();

  // Ventana: primer día del mes que abre la serie.
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);

  let query = supabase
    .from("productions")
    .select("production_date, quantity_kg")
    .is("deleted_at", null)
    .eq("status", "completed")
    .gte("production_date", from.toISOString().slice(0, 10))
    .order("production_date", { ascending: true });
  if (establishmentId) query = query.eq("establishment_id", establishmentId);
  const { data, error } = await query;
  if (error) throw error;

  // Buckets de los últimos `months` meses, en orden cronológico.
  const buckets = new Map<string, ProductionMonthPoint>();
  for (let i = 0; i < months; i++) {
    const d = new Date(from.getFullYear(), from.getMonth() + i, 1);
    buckets.set(monthKey(d), {
      key: monthKey(d),
      label: MONTH_LABELS[d.getMonth()],
      kg: 0,
      count: 0,
    });
  }

  for (const row of data ?? []) {
    const d = new Date(`${row.production_date}T00:00:00`);
    const point = buckets.get(monthKey(d));
    if (!point) continue;
    point.kg += row.quantity_kg ?? 0;
    point.count += 1;
  }

  return [...buckets.values()];
}

// ── KPIs del mes actual (con delta vs mes anterior) ──────────────────────────

export type MonthKpis = {
  kgThisMonth: number;
  kgLastMonth: number;
  /** Variación porcentual de kg vs mes anterior (null si no hay base). */
  kgDeltaPct: number | null;
  productionsThisMonth: number;
  dispatchesThisMonth: number;
  /** Conformidad promedio de los análisis del mes (0-100), null si no hubo. */
  conformityAvg: number | null;
  analysesThisMonth: number;
};

function monthBounds(offset = 0): { from: string; to: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 1);
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}

export async function getMonthKpis(
  establishmentId?: string | null,
): Promise<MonthKpis> {
  const supabase = createClient();
  const thisMonth = monthBounds(0);
  const lastMonth = monthBounds(-1);

  // Filtro de planta activa sobre las operativas con establishment_id (las
  // analyses son tenant-wide, no se filtran).
  let prodThisQ = supabase
    .from("productions")
    .select("quantity_kg")
    .is("deleted_at", null)
    .eq("status", "completed")
    .gte("production_date", thisMonth.from)
    .lt("production_date", thisMonth.to);
  let prodLastQ = supabase
    .from("productions")
    .select("quantity_kg")
    .is("deleted_at", null)
    .eq("status", "completed")
    .gte("production_date", lastMonth.from)
    .lt("production_date", lastMonth.to);
  let dispatchThisQ = supabase
    .from("dispatches")
    .select("id")
    .is("deleted_at", null)
    .neq("status", "voided")
    .gte("dispatch_date", thisMonth.from)
    .lt("dispatch_date", thisMonth.to);
  if (establishmentId) {
    prodThisQ = prodThisQ.eq("establishment_id", establishmentId);
    prodLastQ = prodLastQ.eq("establishment_id", establishmentId);
    dispatchThisQ = dispatchThisQ.eq("establishment_id", establishmentId);
  }

  const [prodThis, prodLast, dispatchThis, analysisThis] = await Promise.all([
    prodThisQ,
    prodLastQ,
    dispatchThisQ,
    supabase
      .from("analyses")
      .select("conformity")
      .is("deleted_at", null)
      .gte("analysis_date", thisMonth.from)
      .lt("analysis_date", thisMonth.to),
  ]);

  for (const r of [prodThis, prodLast, dispatchThis, analysisThis]) {
    if (r.error) throw r.error;
  }

  const kgThisMonth = (prodThis.data ?? []).reduce(
    (a, r) => a + (r.quantity_kg ?? 0),
    0,
  );
  const kgLastMonth = (prodLast.data ?? []).reduce(
    (a, r) => a + (r.quantity_kg ?? 0),
    0,
  );
  const kgDeltaPct =
    kgLastMonth > 0
      ? ((kgThisMonth - kgLastMonth) / kgLastMonth) * 100
      : kgThisMonth > 0
        ? 100
        : null;

  const analyses = analysisThis.data ?? [];
  const conformityAvg =
    analyses.length > 0
      ? analyses.reduce((a, r) => a + r.conformity, 0) / analyses.length
      : null;

  return {
    kgThisMonth,
    kgLastMonth,
    kgDeltaPct,
    productionsThisMonth: (prodThis.data ?? []).length,
    dispatchesThisMonth: (dispatchThis.data ?? []).length,
    conformityAvg,
    analysesThisMonth: analyses.length,
  };
}

// ── Cards de compliance ──────────────────────────────────────────────────────

export type LatestReport = {
  id: string;
  report_date: string;
  importance: number;
} | null;

export type ExpiringRnpa = {
  id: string;
  title: string;
  commercial_name: string | null;
  rnpa_number: string | null;
  rnpa_expiry: string;
  /** Días hasta el vencimiento (negativo = vencido). */
  days: number;
};

export type VehicleHabilitation = {
  id: string;
  plate: string;
  /** Peor estado entre UTA y URA. */
  status: "ok" | "soon" | "expired" | "missing";
  utaDays: number | null;
  uraDays: number | null;
};

export type ExpiringSupplierRne = {
  id: string;
  name: string;
  rne_number: string | null;
  rne_expiry: string;
  days: number;
};

/** Umbral "por vencer" para RNPA (docs/06: <6m; usamos 90 días como "pronto"). */
export const RNPA_SOON_DAYS = 90;
/** Umbral "por vencer" para habilitaciones de transporte / RNE proveedor. */
export const HABILITATION_SOON_DAYS = 30;

function vehicleStatus(days: number | null): VehicleHabilitation["status"] {
  if (days === null) return "missing";
  if (days < 0) return "expired";
  if (days <= HABILITATION_SOON_DAYS) return "soon";
  return "ok";
}

/** Prioridad para ordenar peor-primero. */
const VEHICLE_STATUS_RANK: Record<VehicleHabilitation["status"], number> = {
  expired: 0,
  soon: 1,
  missing: 2,
  ok: 3,
};

// ── Permisos regulatorios genéricos (regulatory_permits + fallback legacy) ────
//
// Reemplaza la lectura de columnas hardcodeadas (recipes.rnpa_*, vehicles.uta/
// ura_*, establishments.rne_*, suppliers.rne_*) por la tabla genérica
// regulatory_permits, manteniendo FALLBACK a las columnas legacy para datos que
// solo existan ahí. La unión NO duplica: si una entidad tiene un permit en la
// tabla nueva Y una columna vieja con el mismo permit_type, gana la nueva.
//
// La lógica de merge/bucketing vive en funciones PURAS exportadas para poder
// testearla sin Supabase (tests/unit/dashboard-permits.test.ts).

/** Bucket de vencimiento de un permiso. */
export type PermitBucket = "expired" | "30" | "60" | "90" | "ok";

/**
 * Clasifica los días hasta el vencimiento en buckets 30/60/90.
 *  - days < 0       → "expired" (ya vencido)
 *  - 0..30          → "30"
 *  - 31..60         → "60"
 *  - 61..90         → "90"
 *  - > 90 o null    → "ok" (no entra en alertas)
 */
export function bucketPermitDays(days: number | null): PermitBucket {
  if (days === null) return "ok";
  if (days < 0) return "expired";
  if (days <= 30) return "30";
  if (days <= 60) return "60";
  if (days <= 90) return "90";
  return "ok";
}

/**
 * Fila normalizada de permiso, agnóstica de la fuente (tabla nueva o legacy).
 * `source` deja trazar de dónde salió el dato (debug / tests).
 */
export type PermitRow = {
  entityType: PermitEntityType;
  entityId: string;
  permitType: string;
  permitNumber: string | null;
  /** Nombre legible de la entidad (placa, nombre de proveedor, título de receta…). */
  entityLabel: string;
  expiresAt: string | null;
  source: "new" | "legacy";
};

/**
 * Une permisos de regulatory_permits (`newRows`) con los derivados de columnas
 * legacy (`legacyRows`), deduplicando por (entityType, entityId, permitType):
 * si la clave ya existe en la tabla nueva, el legacy se descarta. Devuelve la
 * tabla nueva primero y luego los legacy que no tienen equivalente nuevo.
 */
export function mergePermitRows(
  newRows: PermitRow[],
  legacyRows: PermitRow[],
): PermitRow[] {
  const seen = new Set<string>();
  const keyOf = (r: PermitRow) => `${r.entityType}:${r.entityId}:${r.permitType}`;
  const merged: PermitRow[] = [];
  for (const r of newRows) {
    seen.add(keyOf(r));
    merged.push(r);
  }
  for (const r of legacyRows) {
    if (seen.has(keyOf(r))) continue; // gana la nueva
    merged.push(r);
  }
  return merged;
}

/** Permiso por vencer/vencido, listo para la card. */
export type ExpiringPermit = {
  /** Clave estable para React keys. */
  key: string;
  entityType: PermitEntityType;
  entityLabel: string;
  permitNumber: string | null;
  /** Días hasta el vencimiento (negativo = vencido). */
  days: number;
  bucket: Exclude<PermitBucket, "ok">;
};

/** Grupo de alertas para un permit_type concreto (RNPA, UTA, COFEPRIS…). */
export type PermitGroup = {
  permitType: string;
  /** Label legible vía catálogo (getPermitLabel). */
  label: string;
  /** Permisos por vencer (<=90d) o vencidos, peor-primero. */
  items: ExpiringPermit[];
  expiredCount: number;
  soonCount: number; // <=60d sin contar vencidos
};

/**
 * Agrupa filas de permiso por permit_type, quedándose solo con los que están por
 * vencer (<=90 días) o vencidos. Cada grupo viene ordenado peor-primero y los
 * grupos se ordenan por severidad (más vencidos / más próximos arriba).
 */
export function buildPermitGroups(rows: PermitRow[]): PermitGroup[] {
  const groups = new Map<string, PermitGroup>();
  for (const r of rows) {
    const days = daysUntil(r.expiresAt);
    const bucket = bucketPermitDays(days);
    if (bucket === "ok" || days === null) continue;
    const group =
      groups.get(r.permitType) ??
      ({
        permitType: r.permitType,
        label: getPermitLabel(r.permitType),
        items: [],
        expiredCount: 0,
        soonCount: 0,
      } satisfies PermitGroup);
    group.items.push({
      key: `${r.entityType}:${r.entityId}:${r.permitType}`,
      entityType: r.entityType,
      entityLabel: r.entityLabel,
      permitNumber: r.permitNumber,
      days,
      bucket,
    });
    if (bucket === "expired") group.expiredCount += 1;
    else if (days <= 60) group.soonCount += 1;
    groups.set(r.permitType, group);
  }

  const out = [...groups.values()];
  for (const g of out) g.items.sort((a, b) => a.days - b.days);
  // Severidad de grupo: peor "días" del grupo arriba (vencidos primero).
  out.sort((a, b) => (a.items[0]?.days ?? 0) - (b.items[0]?.days ?? 0));
  return out;
}

export type ComplianceCards = {
  latestReport: LatestReport;
  /** Grupos dinámicos por tipo de permiso (lo que el tenant realmente tiene). */
  permitGroups: PermitGroup[];
  /** true si el tenant no tiene ningún permiso cargado (ni nuevo ni legacy). */
  hasAnyPermit: boolean;
  /** Derivados legacy para las cards específicas que aún los consumen. */
  expiringRnpa: ExpiringRnpa[];
  vehicles: VehicleHabilitation[];
  expiringSupplierRne: ExpiringSupplierRne[];
  /** Conformidad/cantidad de análisis del mes (mismo cálculo que los KPIs). */
  analysesThisMonth: number;
  conformityAvg: number | null;
};

export async function getComplianceCards(): Promise<ComplianceCards> {
  const supabase = createClient();
  const thisMonth = monthBounds(0);

  const [
    reportRes,
    permitRes,
    recipeRes,
    vehicleRes,
    supplierRes,
    establishmentRes,
    analysisRes,
  ] = await Promise.all([
    supabase
      .from("reports")
      .select("id, report_date, importance")
      .is("deleted_at", null)
      .order("report_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1),
    // Tabla genérica: permisos del tenant con vencimiento (RLS scopea por tenant).
    supabase
      .from("regulatory_permits")
      .select("entity_type, entity_id, permit_type, permit_number, expires_at")
      .is("deleted_at", null)
      .not("expires_at", "is", null)
      .limit(1000),
    // Fallback legacy: recetas con RNPA (no exentas).
    supabase
      .from("recipes")
      .select("id, title, commercial_name, rnpa_number, rnpa_expiry")
      .is("deleted_at", null)
      .eq("rnpa_exempt", false)
      .not("rnpa_expiry", "is", null)
      .order("rnpa_expiry", { ascending: true })
      .limit(500),
    // Fallback legacy: vehículos con UTA/URA.
    supabase
      .from("vehicles")
      .select("id, plate, uta_number, uta_expiry, ura_number, ura_expiry")
      .is("deleted_at", null)
      .order("plate"),
    // Fallback legacy: proveedores con RNE.
    supabase
      .from("suppliers")
      .select("id, name, rne_number, rne_expiry")
      .is("deleted_at", null)
      .not("rne_expiry", "is", null)
      .order("rne_expiry", { ascending: true })
      .limit(500),
    // Fallback legacy: establecimientos con RNE.
    supabase
      .from("establishments")
      .select("id, name, rne_number, rne_expiry")
      .is("deleted_at", null)
      .not("rne_expiry", "is", null)
      .order("rne_expiry", { ascending: true })
      .limit(500),
    supabase
      .from("analyses")
      .select("conformity")
      .is("deleted_at", null)
      .gte("analysis_date", thisMonth.from)
      .lt("analysis_date", thisMonth.to),
  ]);

  for (const r of [
    reportRes,
    permitRes,
    recipeRes,
    vehicleRes,
    supplierRes,
    establishmentRes,
    analysisRes,
  ]) {
    if (r.error) throw r.error;
  }

  const latestReport = (reportRes.data ?? [])[0] ?? null;

  // ── Filas de la tabla nueva ──
  const newRows: PermitRow[] = (permitRes.data ?? []).map((p) => ({
    entityType: p.entity_type as PermitEntityType,
    entityId: p.entity_id,
    permitType: p.permit_type,
    permitNumber: p.permit_number,
    // El label fino (placa/nombre/título) lo arma cada fallback; para la tabla
    // nueva mostramos el número, que es el dato disponible sin más joins.
    entityLabel: p.permit_number ?? "—",
    expiresAt: p.expires_at,
    source: "new",
  }));

  // ── Filas legacy (derivadas de columnas viejas) ──
  const legacyRows: PermitRow[] = [];
  for (const r of recipeRes.data ?? []) {
    legacyRows.push({
      entityType: "recipe",
      entityId: r.id,
      permitType: "rnpa",
      permitNumber: r.rnpa_number,
      entityLabel: r.commercial_name || r.title,
      expiresAt: r.rnpa_expiry,
      source: "legacy",
    });
  }
  for (const v of vehicleRes.data ?? []) {
    if (v.uta_expiry) {
      legacyRows.push({
        entityType: "vehicle",
        entityId: v.id,
        permitType: "uta",
        permitNumber: v.uta_number ?? null,
        entityLabel: v.plate,
        expiresAt: v.uta_expiry,
        source: "legacy",
      });
    }
    if (v.ura_expiry) {
      legacyRows.push({
        entityType: "vehicle",
        entityId: v.id,
        permitType: "ura",
        permitNumber: v.ura_number ?? null,
        entityLabel: v.plate,
        expiresAt: v.ura_expiry,
        source: "legacy",
      });
    }
  }
  for (const s of supplierRes.data ?? []) {
    legacyRows.push({
      entityType: "supplier",
      entityId: s.id,
      permitType: "rne",
      permitNumber: s.rne_number,
      entityLabel: s.name,
      expiresAt: s.rne_expiry,
      source: "legacy",
    });
  }
  for (const e of establishmentRes.data ?? []) {
    legacyRows.push({
      entityType: "establishment",
      entityId: e.id,
      permitType: "rne",
      permitNumber: e.rne_number,
      entityLabel: e.name,
      expiresAt: e.rne_expiry,
      source: "legacy",
    });
  }

  // Para la card nueva mejoramos el entityLabel de las filas nuevas con el
  // nombre real de la entidad cuando lo tenemos del fallback (mismo id).
  const labelByEntity = new Map<string, string>();
  for (const r of legacyRows) {
    labelByEntity.set(`${r.entityType}:${r.entityId}`, r.entityLabel);
  }
  for (const r of newRows) {
    const label = labelByEntity.get(`${r.entityType}:${r.entityId}`);
    if (label) r.entityLabel = label;
  }

  const allPermits = mergePermitRows(newRows, legacyRows);
  const permitGroups = buildPermitGroups(allPermits);
  const hasAnyPermit = newRows.length > 0 || legacyRows.length > 0;

  // ── Derivados legacy para las cards específicas existentes ──
  // RNPA: recetas por vencer (<= 90 días) o vencidas.
  const expiringRnpa: ExpiringRnpa[] = [];
  for (const r of recipeRes.data ?? []) {
    if (!r.rnpa_expiry) continue;
    const days = daysUntil(r.rnpa_expiry);
    if (days === null || days > RNPA_SOON_DAYS) continue;
    expiringRnpa.push({
      id: r.id,
      title: r.title,
      commercial_name: r.commercial_name,
      rnpa_number: r.rnpa_number,
      rnpa_expiry: r.rnpa_expiry,
      days,
    });
  }
  expiringRnpa.sort((a, b) => a.days - b.days);

  // Transporte: estado por vehículo, peor-primero.
  const vehicles: VehicleHabilitation[] = (vehicleRes.data ?? []).map((v) => {
    const utaDays = daysUntil(v.uta_expiry);
    const uraDays = daysUntil(v.ura_expiry);
    const utaStatus = vehicleStatus(utaDays);
    const uraStatus = vehicleStatus(uraDays);
    const status =
      VEHICLE_STATUS_RANK[utaStatus] <= VEHICLE_STATUS_RANK[uraStatus]
        ? utaStatus
        : uraStatus;
    return { id: v.id, plate: v.plate, status, utaDays, uraDays };
  });
  vehicles.sort(
    (a, b) => VEHICLE_STATUS_RANK[a.status] - VEHICLE_STATUS_RANK[b.status],
  );

  // RNE de proveedores: por vencer (<= 30 días) o vencido.
  const expiringSupplierRne: ExpiringSupplierRne[] = [];
  for (const s of supplierRes.data ?? []) {
    if (!s.rne_expiry) continue;
    const days = daysUntil(s.rne_expiry);
    if (days === null || days > HABILITATION_SOON_DAYS) continue;
    expiringSupplierRne.push({
      id: s.id,
      name: s.name,
      rne_number: s.rne_number,
      rne_expiry: s.rne_expiry,
      days,
    });
  }
  expiringSupplierRne.sort((a, b) => a.days - b.days);

  const analyses = analysisRes.data ?? [];
  const conformityAvg =
    analyses.length > 0
      ? analyses.reduce((a, r) => a + r.conformity, 0) / analyses.length
      : null;

  return {
    latestReport,
    permitGroups,
    hasAnyPermit,
    expiringRnpa,
    vehicles,
    expiringSupplierRne,
    analysesThisMonth: analyses.length,
    conformityAvg,
  };
}

// ── Alertas de stock ─────────────────────────────────────────────────────────
// Reutiliza listAvailableEntries (modules/stock) + la misma lógica de la página
// de inventario: agregado por ingrediente, stock bajo el umbral y lotes por
// vencer. NO se duplica la query ni los umbrales.

export type StockAlert = {
  ingredientId: string;
  name: string;
  unit: string;
  total: number;
  threshold: number;
  nextExpiry: string | null;
  expiryDays: number | null;
  isLow: boolean;
  isExpiring: boolean;
};

export type StockAlerts = {
  low: StockAlert[];
  expiring: StockAlert[];
  lowCount: number;
  expiringCount: number;
};

/** Días para "vence pronto" en el dashboard (docs/06: lotes ≤14 días). */
export const DASHBOARD_EXPIRING_DAYS = 14;

export async function getStockAlerts(
  establishmentId?: string | null,
): Promise<StockAlerts> {
  const entries = await listAvailableEntries({ establishmentId });

  // Agregado por ingrediente (mismo criterio que inventario/page.tsx).
  const map = new Map<string, StockAlert>();
  for (const e of entries) {
    const key = e.ingredient_id;
    const row =
      map.get(key) ??
      ({
        ingredientId: key,
        name: e.ingredient?.name ?? "(sin nombre)",
        unit: e.unit,
        total: 0,
        threshold: e.ingredient?.low_stock_threshold ?? GLOBAL_LOW_STOCK_THRESHOLD,
        nextExpiry: null,
        expiryDays: null,
        isLow: false,
        isExpiring: false,
      } satisfies StockAlert);
    row.total += e.remaining_quantity;
    if (e.expiry_date && (!row.nextExpiry || e.expiry_date < row.nextExpiry)) {
      row.nextExpiry = e.expiry_date;
    }
    map.set(key, row);
  }

  const low: StockAlert[] = [];
  const expiring: StockAlert[] = [];
  for (const row of map.values()) {
    row.isLow = row.total < row.threshold;
    row.expiryDays = daysUntil(row.nextExpiry);
    row.isExpiring =
      row.expiryDays !== null && row.expiryDays <= DASHBOARD_EXPIRING_DAYS;
    if (row.isLow) low.push(row);
    if (row.isExpiring) expiring.push(row);
  }

  low.sort((a, b) => a.total - b.total);
  expiring.sort((a, b) => (a.expiryDays ?? 0) - (b.expiryDays ?? 0));

  return {
    low,
    expiring,
    lowCount: low.length,
    expiringCount: expiring.length,
  };
}

// ── Actividad reciente ───────────────────────────────────────────────────────

export type RecentProduction = {
  id: string;
  code: string;
  date: string;
  recipeTitle: string;
  kg: number | null;
  traceSlug: string | null;
};

export type RecentDispatch = {
  id: string;
  date: string;
  customerName: string;
  kg: number;
};

export type RecentActivity = {
  productions: RecentProduction[];
  dispatches: RecentDispatch[];
};

export async function getRecentActivity(
  establishmentId?: string | null,
): Promise<RecentActivity> {
  const supabase = createClient();

  let prodQ = supabase
    .from("productions")
    .select(
      `id, code, production_date, quantity_kg,
       recipe:recipes(title),
       trace:public_traces(slug)`,
    )
    .is("deleted_at", null)
    .eq("status", "completed")
    .order("production_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(5);
  let dispatchQ = supabase
    .from("dispatches")
    .select(
      `id, dispatch_date,
       customer:customers(name),
       items:dispatch_items(quantity_kg)`,
    )
    .is("deleted_at", null)
    .neq("status", "voided")
    .order("dispatch_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(5);
  if (establishmentId) {
    prodQ = prodQ.eq("establishment_id", establishmentId);
    dispatchQ = dispatchQ.eq("establishment_id", establishmentId);
  }

  const [prodRes, dispatchRes] = await Promise.all([prodQ, dispatchQ]);

  if (prodRes.error) throw prodRes.error;
  if (dispatchRes.error) throw dispatchRes.error;

  type ProdRow = {
    id: string;
    code: string;
    production_date: string;
    quantity_kg: number | null;
    recipe: { title: string } | null;
    trace: { slug: string }[] | null;
  };
  type DispatchRow = {
    id: string;
    dispatch_date: string;
    customer: { name: string } | null;
    items: { quantity_kg: number }[] | null;
  };

  const productions: RecentProduction[] = (
    (prodRes.data ?? []) as unknown as ProdRow[]
  ).map((p) => ({
    id: p.id,
    code: p.code,
    date: p.production_date,
    recipeTitle: p.recipe?.title ?? "(receta eliminada)",
    kg: p.quantity_kg,
    traceSlug: p.trace?.[0]?.slug ?? null,
  }));

  const dispatches: RecentDispatch[] = (
    (dispatchRes.data ?? []) as unknown as DispatchRow[]
  ).map((d) => ({
    id: d.id,
    date: d.dispatch_date,
    customerName: d.customer?.name ?? "(cliente eliminado)",
    kg: (d.items ?? []).reduce((a, it) => a + (it.quantity_kg ?? 0), 0),
  }));

  return { productions, dispatches };
}
