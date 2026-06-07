import { createClient } from "@/lib/supabase/client";
import { getTenantId } from "@/lib/utils/tenant";
import { nameKey, type ImportModuleId } from "./schemas";
import type {
  CustomerImportData,
  IngredientImportData,
  SupplierImportData,
} from "./schemas";

// API de importación: lectura de claves existentes (duplicados) e inserciones en
// lote. El tenant_id se setea explícito en cada insert (igual que el resto del
// dominio); RLS garantiza el aislamiento. No usamos RPC: son tablas de CRUD
// simple sin lógica transaccional (a diferencia de stock/producción).

// ── Claves existentes (para detección de duplicados por nombre) ───────────────

/** Set de nombres ya existentes (normalizados) en el módulo, para marcar duplicados. */
export async function fetchExistingKeys(
  moduleId: ImportModuleId,
): Promise<Set<string>> {
  const supabase = createClient();
  const table =
    moduleId === "ingredients"
      ? "ingredients"
      : moduleId === "customers"
        ? "customers"
        : "suppliers";

  const { data, error } = await supabase
    .from(table)
    .select("name")
    .is("deleted_at", null);
  if (error) throw error;

  const set = new Set<string>();
  for (const row of (data ?? []) as Array<{ name: string }>) {
    if (row.name) set.add(nameKey(row.name));
  }
  return set;
}

// ── Inserciones en lote ───────────────────────────────────────────────────────

export interface ImportInsertResult {
  inserted: number;
}

/** Inserta ingredientes válidos en lote. */
export async function insertIngredients(
  rows: IngredientImportData[],
): Promise<ImportInsertResult> {
  if (rows.length === 0) return { inserted: 0 };
  const supabase = createClient();
  const tenant_id = await getTenantId();
  const payload = rows.map((r) => ({ ...r, tenant_id }));
  const { error, count } = await supabase
    .from("ingredients")
    .insert(payload, { count: "exact" });
  if (error) throw error;
  return { inserted: count ?? rows.length };
}

/** Inserta clientes válidos en lote. */
export async function insertCustomers(
  rows: CustomerImportData[],
): Promise<ImportInsertResult> {
  if (rows.length === 0) return { inserted: 0 };
  const supabase = createClient();
  const tenant_id = await getTenantId();
  const payload = rows.map((r) => ({ ...r, tenant_id }));
  const { error, count } = await supabase
    .from("customers")
    .insert(payload, { count: "exact" });
  if (error) throw error;
  return { inserted: count ?? rows.length };
}

/** Inserta proveedores válidos en lote. */
export async function insertSuppliers(
  rows: SupplierImportData[],
): Promise<ImportInsertResult> {
  if (rows.length === 0) return { inserted: 0 };
  const supabase = createClient();
  const tenant_id = await getTenantId();
  const payload = rows.map((r) => ({ ...r, tenant_id }));
  const { error, count } = await supabase
    .from("suppliers")
    .insert(payload, { count: "exact" });
  if (error) throw error;
  return { inserted: count ?? rows.length };
}

/** Despacha al insert correcto según el módulo. */
export async function insertRows(
  moduleId: ImportModuleId,
  rows: unknown[],
): Promise<ImportInsertResult> {
  switch (moduleId) {
    case "ingredients":
      return insertIngredients(rows as IngredientImportData[]);
    case "customers":
      return insertCustomers(rows as CustomerImportData[]);
    case "suppliers":
      return insertSuppliers(rows as SupplierImportData[]);
    default:
      return { inserted: 0 };
  }
}
