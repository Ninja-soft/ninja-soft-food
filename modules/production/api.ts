import { createClient } from "@/lib/supabase/client";
import { getTenantId } from "@/lib/utils/tenant";
import type { ProductionInput, ProductionInputRow } from "./schemas";

export type Production = {
  id: string;
  code: string;
  status: "draft" | "completed" | "voided";
  production_date: string;
  packaging_date: string | null;
  quantity_kg: number | null;
  product_lot_number: string | null;
  product_expiry_date: string | null;
  photo_url: string | null;
  notes: string | null;
  created_at: string;
  recipe_id: string;
  recipe: { title: string; image_url: string | null } | null;
  trace: { slug: string }[] | null;
};

export type CompleteProductionResult = {
  production_id: string;
  code: string;
  product_lot: string;
  expiry_date: string;
  trace_slug: string;
};

export async function listProductions(search: string): Promise<Production[]> {
  const supabase = createClient();
  let query = supabase
    .from("productions")
    .select(
      `id, code, status, production_date, packaging_date, quantity_kg,
       product_lot_number, product_expiry_date, photo_url, notes, created_at,
       recipe_id,
       recipe:recipes(title, image_url),
       trace:public_traces(slug)`,
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(200);
  if (search.trim()) {
    const q = search.trim();
    query = query.or(`code.ilike.%${q}%,product_lot_number.ilike.%${q}%`);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as Production[];
}

/**
 * Completar producción: transacción única en Postgres (RPC).
 *
 * La foto del producto NO entra en la RPC (congelada, migración 0005) ni en el
 * snapshot inmutable de public_traces.payload (regla dura 5). Se persiste como
 * dato vivo y complementario: tras completar, se actualiza productions.photo_url
 * en un UPDATE aparte. Si el UPDATE de la foto falla, la producción ya quedó
 * completada y trazable; la foto es best-effort y no debe abortar el flujo.
 */
export async function completeProduction(
  input: ProductionInput,
  inputs: ProductionInputRow[],
  photoUrl?: string | null,
): Promise<CompleteProductionResult> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("complete_production", {
    p_recipe_id: input.recipe_id,
    p_quantity_kg: input.quantity_kg,
    p_production_date: input.production_date,
    p_inputs: inputs,
    p_product_lot_number: input.product_lot_number ?? undefined,
    p_notes: input.notes ?? undefined,
  });
  if (error) {
    if (error.message.includes("insufficient_stock"))
      throw new Error(
        "Stock insuficiente en alguno de los lotes seleccionados",
      );
    throw error;
  }
  const result = data as unknown as CompleteProductionResult;

  if (photoUrl) {
    await supabase
      .from("productions")
      .update({ photo_url: photoUrl })
      .eq("id", result.production_id);
  }

  return result;
}

/** Sube la foto del producto al bucket público `recipes`, bajo la carpeta del
 *  tenant (subcarpeta productions/). Mismo bucket que las imágenes de receta:
 *  ambas son imagen de producto. La policy de storage exige que la primera
 *  carpeta del path sea el tenant_id. */
export async function uploadProductionPhoto(file: Blob): Promise<string> {
  const supabase = createClient();
  const tenantId = await getTenantId();
  const path = `${tenantId}/productions/${crypto.randomUUID()}.webp`;
  const { error } = await supabase.storage
    .from("recipes")
    .upload(path, file, { contentType: "image/webp", upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from("recipes").getPublicUrl(path);
  return data.publicUrl;
}
