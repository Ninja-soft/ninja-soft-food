import { createClient } from "@/lib/supabase/client";
import { getTenantId } from "@/lib/utils/tenant";
import type { FamilyInput, IngredientInput } from "./schemas";

// Tipos de fila (los genéricos del cliente tipado cubren el resto)
export type Family = {
  id: string;
  name: string;
  image_url: string | null;
  sort: number;
};

export type Ingredient = {
  id: string;
  name: string;
  family_id: string | null;
  unit: string;
  is_perishable: boolean;
  image_url: string | null;
  description: string | null;
  barcode: string | null;
  low_stock_threshold: number | null;
  default_shelf_days: number | null;
  family: { name: string } | null;
};

const INGREDIENT_SELECT =
  "id, name, family_id, unit, is_perishable, image_url, description, barcode, low_stock_threshold, default_shelf_days, family:ingredient_families(name)";

export type MeasureUnit = { id: string; name: string; abbr: string };

// ── Familias ─────────────────────────────────────────────────────────────────

export async function listFamilies(): Promise<Family[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("ingredient_families")
    .select("id, name, image_url, sort")
    .is("deleted_at", null)
    .order("sort")
    .order("name");
  if (error) throw error;
  return (data ?? []) as Family[];
}

export async function createFamily(input: FamilyInput): Promise<void> {
  const supabase = createClient();
  const tenant_id = await getTenantId();
  const { error } = await supabase
    .from("ingredient_families")
    .insert({ ...input, tenant_id });
  if (error) throw error;
}

export async function updateFamily(
  id: string,
  input: FamilyInput,
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("ingredient_families")
    .update(input)
    .eq("id", id);
  if (error) throw error;
}

export async function deleteFamily(id: string): Promise<void> {
  const supabase = createClient();
  // Soft delete; los ingredientes quedan sin familia (family_id intacto pero
  // la familia no se lista). Reasignación: editar el ingrediente.
  const { error } = await supabase
    .from("ingredient_families")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

// ── Ingredientes ─────────────────────────────────────────────────────────────

export async function listIngredients(params: {
  search?: string;
  familyId?: string | null;
}): Promise<Ingredient[]> {
  const supabase = createClient();
  let query = supabase
    .from("ingredients")
    .select(INGREDIENT_SELECT)
    .is("deleted_at", null)
    .order("name");

  if (params.familyId) query = query.eq("family_id", params.familyId);
  // El input de búsqueda matchea por nombre (substring) o por código de barras
  // exacto: así un código escaneado/pegado encuentra su ingrediente. PostgREST
  // necesita escapar comas dentro del valor del `or` para no romper el parseo.
  const search = params.search?.trim();
  if (search) {
    const term = search.replace(/[%,]/g, " ");
    query = query.or(`name.ilike.%${term}%,barcode.eq.${term}`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as Ingredient[];
}

/**
 * Busca un ingrediente por código de barras exacto dentro del tenant (RLS).
 * Devuelve el primero vivo que coincida o null. El barcode NO es unique por
 * diseño (datos sucios), así que el "primero" basta para preseleccionar.
 */
export async function findIngredientByBarcode(
  barcode: string,
): Promise<Ingredient | null> {
  const code = barcode.trim();
  if (!code) return null;
  const supabase = createClient();
  const { data, error } = await supabase
    .from("ingredients")
    .select(INGREDIENT_SELECT)
    .is("deleted_at", null)
    .eq("barcode", code)
    .order("name")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as unknown as Ingredient | null;
}

export async function createIngredient(
  input: IngredientInput & { image_url?: string | null },
): Promise<void> {
  const supabase = createClient();
  const tenant_id = await getTenantId();
  const { error } = await supabase
    .from("ingredients")
    .insert({ ...input, tenant_id });
  if (error) throw error;
}

export async function updateIngredient(
  id: string,
  input: Partial<IngredientInput> & { image_url?: string | null },
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("ingredients")
    .update(input)
    .eq("id", id);
  if (error) throw error;
}

export async function deleteIngredient(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("ingredients")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

// ── Unidades ─────────────────────────────────────────────────────────────────

export async function listUnits(): Promise<MeasureUnit[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("measure_units")
    .select("id, name, abbr")
    .order("name");
  if (error) throw error;
  return (data ?? []) as MeasureUnit[];
}

// ── Imágenes ─────────────────────────────────────────────────────────────────

/** Sube imagen al bucket público `ingredients` bajo la carpeta del tenant. */
export async function uploadIngredientImage(file: File): Promise<string> {
  const supabase = createClient();
  const tenantId = await getTenantId();
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${tenantId}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage
    .from("ingredients")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;

  const { data } = supabase.storage.from("ingredients").getPublicUrl(path);
  return data.publicUrl;
}
