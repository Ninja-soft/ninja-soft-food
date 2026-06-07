import { createClient } from "@/lib/supabase/client";
import { getTenantId } from "@/lib/utils/tenant";
import type { LabelVersion, Recipe } from "./api";

// =============================================================================
// modules/recipes/labels — guardado y VERSIONADO de los rótulos print-ready.
//
// SIN tabla nueva: el PDF se sube al bucket público `recipes` (0003_storage) en
// <tenant>/labels/<recipeId>/v<N>.pdf y la versión se registra en el array
// jsonb APPEND-ONLY recipes.label_versions (migración 0022). El PDF en Storage
// es el artefacto inmutable; este módulo solo mantiene el índice.
//
// nextLabelVersion / appendLabelVersion son PUROS y testeados: el versionado es
// estrictamente incremental (max(version)+1), nunca pisa una versión anterior.
// =============================================================================

/** Próximo número de versión: max(version) existente + 1 (empieza en 1). */
export function nextLabelVersion(existing: LabelVersion[] | null | undefined): number {
  const versions = existing ?? [];
  if (versions.length === 0) return 1;
  return Math.max(...versions.map((v) => v.version)) + 1;
}

/** Path en el bucket `recipes` para una versión de rótulo. */
export function labelVersionPath(
  tenantId: string,
  recipeId: string,
  version: number,
): string {
  return `${tenantId}/labels/${recipeId}/v${version}.pdf`;
}

/**
 * Devuelve el array de versiones con la nueva agregada al final (append-only).
 * PURO: no toca DB. Conserva el orden y nunca reemplaza versiones previas.
 */
export function appendLabelVersion(
  existing: LabelVersion[] | null | undefined,
  entry: LabelVersion,
): LabelVersion[] {
  return [...(existing ?? []), entry];
}

export type SaveLabelVersionResult = {
  version: LabelVersion;
  versions: LabelVersion[];
};

/**
 * Sube el PDF del rótulo como una nueva versión y registra el índice en
 * recipes.label_versions. Calcula el N a partir de lo ya guardado en la receta
 * (no del estado del cliente) para evitar colisiones, sube al bucket y persiste
 * el array ampliado. Devuelve la versión creada y el array resultante.
 */
export async function saveLabelVersion(
  recipe: Recipe,
  pdf: Blob,
): Promise<SaveLabelVersionResult> {
  const supabase = createClient();
  const tenantId = await getTenantId();

  // Releer el array actual desde DB (fuente de verdad del contador).
  const { data: current, error: readErr } = await supabase
    .from("recipes")
    .select("label_versions")
    .eq("id", recipe.id)
    .single();
  if (readErr) throw readErr;

  const existing = ((current?.label_versions as LabelVersion[] | null) ??
    []) as LabelVersion[];
  const version = nextLabelVersion(existing);
  const path = labelVersionPath(tenantId, recipe.id, version);

  const { error: upErr } = await supabase.storage
    .from("recipes")
    .upload(path, pdf, { contentType: "application/pdf", upsert: true });
  if (upErr) throw upErr;

  const { data: userData } = await supabase.auth.getUser();
  const entry: LabelVersion = {
    version,
    path,
    created_at: new Date().toISOString(),
    created_by: userData.user?.id ?? null,
  };
  const versions = appendLabelVersion(existing, entry);

  const { error: updErr } = await supabase
    .from("recipes")
    .update({ label_versions: versions })
    .eq("id", recipe.id);
  if (updErr) throw updErr;

  return { version: entry, versions };
}

/** URL pública de descarga de una versión de rótulo (bucket público `recipes`). */
export function labelVersionUrl(path: string): string {
  const supabase = createClient();
  return supabase.storage.from("recipes").getPublicUrl(path).data.publicUrl;
}
