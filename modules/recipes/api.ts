import { createClient } from "@/lib/supabase/client";
import { getTenantId } from "@/lib/utils/tenant";
import type {
  RecipeGroupInput,
  RecipeIngredientInput,
  RecipeInput,
} from "./schemas";

export type RecipeGroup = {
  id: string;
  name: string;
  image_url: string | null;
  sort: number;
};

export type RecipeIngredientRow = {
  id: string;
  ingredient_id: string;
  quantity: number;
  unit: string;
  is_substitute: boolean;
  source_ingredient_id: string | null;
  ingredient: { name: string; unit: string } | null;
};

/** Una versión guardada de rótulo print-ready (recipes.label_versions jsonb). */
export type LabelVersion = {
  version: number;
  /** Path en el bucket público `recipes`: <tenant>/labels/<recipeId>/v<N>.pdf */
  path: string;
  created_at: string;
  created_by: string | null;
};

export type Recipe = {
  id: string;
  title: string;
  commercial_name: string | null;
  group_id: string | null;
  category: string;
  product_type: string;
  description: string | null;
  shelf_life_days: number;
  aging_days: number;
  packaging_delay_type: "none" | "aging" | "freeze";
  rnpa_number: string | null;
  rnpa_expiry: string | null;
  rnpa_exempt: boolean;
  rnpa_exempt_reason: string | null;
  image_url: string | null;
  front_labels: string[];
  /** Rotulado frontal resuelto por país: {system, values}. Reemplaza front_labels. */
  regulatory_labels: { system: string; values: string[] } | null;
  /** Alérgenos declarados (ids de COMMON_ALLERGENS). text[], default []. */
  allergens: string[] | null;
  /** Historial append-only de rótulos print-ready guardados (Fase 7). */
  label_versions: LabelVersion[];
  nutrition: {
    calories?: number | null;
    proteins?: number | null;
    fats?: number | null;
    carbs?: number | null;
    sodium?: number | null;
    // Ampliados (Fase 7) para cálculo de sellos frontales. jsonb, sin migración.
    saturated_fats?: number | null;
    trans_fats?: number | null;
    sugars?: number | null;
    fiber?: number | null;
    salt?: number | null;
  };
  group: { name: string } | null;
  recipe_ingredients: RecipeIngredientRow[];
};

const RECIPE_SELECT = `
  id, title, commercial_name, group_id, category, product_type, description,
  shelf_life_days, aging_days, packaging_delay_type,
  rnpa_number, rnpa_expiry, rnpa_exempt, rnpa_exempt_reason,
  image_url, front_labels, regulatory_labels, allergens, label_versions, nutrition,
  group:recipe_groups(name),
  recipe_ingredients(id, ingredient_id, quantity, unit, is_substitute,
    source_ingredient_id,
    ingredient:ingredients!recipe_ingredients_ingredient_id_fkey(name, unit))
`;

// ── Grupos ───────────────────────────────────────────────────────────────────

export async function listGroups(): Promise<RecipeGroup[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("recipe_groups")
    .select("id, name, image_url, sort")
    .is("deleted_at", null)
    .order("sort")
    .order("name");
  if (error) throw error;
  return (data ?? []) as RecipeGroup[];
}

export async function createGroup(input: RecipeGroupInput): Promise<void> {
  const supabase = createClient();
  const tenant_id = await getTenantId();
  const { error } = await supabase
    .from("recipe_groups")
    .insert({ ...input, tenant_id });
  if (error) throw error;
}

export async function updateGroup(
  id: string,
  input: RecipeGroupInput,
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("recipe_groups")
    .update(input)
    .eq("id", id);
  if (error) throw error;
}

export async function deleteGroup(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("recipe_groups")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

// ── Recetas ──────────────────────────────────────────────────────────────────

export async function listRecipes(params: {
  search?: string;
  groupId?: string | null;
}): Promise<Recipe[]> {
  const supabase = createClient();
  let query = supabase
    .from("recipes")
    .select(RECIPE_SELECT)
    .is("deleted_at", null)
    .order("title");
  if (params.groupId) query = query.eq("group_id", params.groupId);
  if (params.search?.trim())
    query = query.or(
      `title.ilike.%${params.search.trim()}%,commercial_name.ilike.%${params.search.trim()}%`,
    );
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as Recipe[];
}

/** Una receta por id, con su fórmula completa (para la ficha técnica PDF). */
export async function getRecipe(id: string): Promise<Recipe> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("recipes")
    .select(RECIPE_SELECT)
    .eq("id", id)
    .is("deleted_at", null)
    .single();
  if (error) throw error;
  return data as unknown as Recipe;
}

export async function createRecipe(
  input: RecipeInput & { image_url?: string | null },
  ingredients: RecipeIngredientInput[],
): Promise<void> {
  const supabase = createClient();
  const tenant_id = await getTenantId();
  const { data, error } = await supabase
    .from("recipes")
    .insert({ ...input, tenant_id })
    .select("id")
    .single();
  if (error) throw error;

  if (ingredients.length > 0) {
    const { error: riError } = await supabase.from("recipe_ingredients").insert(
      ingredients.map((ri) => ({ ...ri, recipe_id: data.id })),
    );
    if (riError) throw riError;
  }
}

export async function updateRecipe(
  id: string,
  input: Partial<RecipeInput> & { image_url?: string | null },
  ingredients: RecipeIngredientInput[],
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("recipes").update(input).eq("id", id);
  if (error) throw error;

  // Reemplazo completo de la fórmula (sin versionado en MVP; auditoría v1)
  const { error: delError } = await supabase
    .from("recipe_ingredients")
    .delete()
    .eq("recipe_id", id);
  if (delError) throw delError;

  if (ingredients.length > 0) {
    const { error: riError } = await supabase.from("recipe_ingredients").insert(
      ingredients.map((ri) => ({ ...ri, recipe_id: id })),
    );
    if (riError) throw riError;
  }
}

/**
 * Audita best-effort un cambio de rotulado/nutrición de receta (Fase 7). Llama
 * al route server (service_role: audit_logs no es INSERT-able por authenticated).
 * NUNCA lanza: la receta ya se guardó, el audit no debe romper el flujo.
 */
export async function auditRecipeLabeling(input: {
  recipeId: string;
  before: { nutrition: unknown; regulatory_labels: unknown };
  after: { nutrition: unknown; regulatory_labels: unknown };
  aiGenerated?: boolean;
}): Promise<void> {
  try {
    await fetch("/api/recipes/audit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
  } catch {
    // best-effort
  }
}

export async function deleteRecipe(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("recipes")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

// ── Imagen ───────────────────────────────────────────────────────────────────

export async function uploadRecipeImage(file: File): Promise<string> {
  const supabase = createClient();
  const tenantId = await getTenantId();
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${tenantId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from("recipes")
    .upload(path, file, { contentType: file.type });
  if (error) throw error;
  const { data } = supabase.storage.from("recipes").getPublicUrl(path);
  return data.publicUrl;
}
