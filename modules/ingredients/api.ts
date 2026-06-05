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
  low_stock_threshold: number | null;
  default_shelf_days: number | null;
  family: { name: string } | null;
};

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
    .select(
      "id, name, family_id, unit, is_perishable, image_url, description, low_stock_threshold, default_shelf_days, family:ingredient_families(name)",
    )
    .is("deleted_at", null)
    .order("name");

  if (params.familyId) query = query.eq("family_id", params.familyId);
  if (params.search?.trim())
    query = query.ilike("name", `%${params.search.trim()}%`);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as Ingredient[];
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
