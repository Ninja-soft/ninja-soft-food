import type { createAdminClient } from "@/lib/supabase/admin";
import { daysUntil } from "@/lib/utils/format";
import { GLOBAL_LOW_STOCK_THRESHOLD } from "@/modules/stock/schemas";
import { DASHBOARD_EXPIRING_DAYS } from "@/modules/dashboard/api";

// =============================================================================
// lib/crons/stock.ts — alertas de stock por tenant para el job nocturno.
//
// El dashboard calcula las mismas alertas en el cliente (modules/dashboard/api:
// getStockAlerts), pero apoyado en RLS + tenant context. El cron corre con
// service_role sin sesión, así que replica EL MISMO criterio y umbrales acá pero
// scopeando explícitamente por tenant_id. No se inventan umbrales nuevos:
//   - stock bajo: total del ingrediente < low_stock_threshold (o global),
//   - por vencer: lote más próximo a vencer en <= DASHBOARD_EXPIRING_DAYS (14 d).
// =============================================================================

type AdminClient = ReturnType<typeof createAdminClient>;

export interface TenantStockAlert {
  ingredientId: string;
  name: string;
  unit: string;
  total: number;
  threshold: number;
  nextExpiry: string | null;
  expiryDays: number | null;
}

export interface TenantStockAlerts {
  low: TenantStockAlert[];
  expiring: TenantStockAlert[];
}

interface EntryRow {
  ingredient_id: string;
  remaining_quantity: number;
  unit: string;
  expiry_date: string | null;
  ingredient: {
    name: string | null;
    low_stock_threshold: number | null;
  } | null;
}

/**
 * Alertas de stock de un tenant (bajo umbral + lotes por vencer), agregando por
 * ingrediente sobre los lotes con stock disponible. Mismo criterio que el
 * dashboard. Lectura con admin client, filtrada por tenant_id explícito.
 */
export async function computeTenantStockAlerts(
  admin: AdminClient,
  tenantId: string
): Promise<TenantStockAlerts> {
  const { data, error } = await admin
    .from("stock_entries")
    .select(
      `ingredient_id, remaining_quantity, unit, expiry_date,
       ingredient:ingredients(name, low_stock_threshold)`
    )
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .gt("remaining_quantity", 0);
  if (error) throw error;

  const rows = (data ?? []) as unknown as EntryRow[];

  const map = new Map<string, TenantStockAlert>();
  for (const e of rows) {
    const key = e.ingredient_id;
    const row =
      map.get(key) ??
      ({
        ingredientId: key,
        name: e.ingredient?.name ?? "(sin nombre)",
        unit: e.unit,
        total: 0,
        threshold:
          e.ingredient?.low_stock_threshold ?? GLOBAL_LOW_STOCK_THRESHOLD,
        nextExpiry: null,
        expiryDays: null,
      } satisfies TenantStockAlert);
    row.total += e.remaining_quantity;
    if (e.expiry_date && (!row.nextExpiry || e.expiry_date < row.nextExpiry)) {
      row.nextExpiry = e.expiry_date;
    }
    map.set(key, row);
  }

  const low: TenantStockAlert[] = [];
  const expiring: TenantStockAlert[] = [];
  for (const row of map.values()) {
    row.expiryDays = daysUntil(row.nextExpiry);
    if (row.total < row.threshold) low.push(row);
    if (row.expiryDays !== null && row.expiryDays <= DASHBOARD_EXPIRING_DAYS) {
      expiring.push(row);
    }
  }

  low.sort((a, b) => a.total - b.total);
  expiring.sort((a, b) => (a.expiryDays ?? 0) - (b.expiryDays ?? 0));

  return { low, expiring };
}
