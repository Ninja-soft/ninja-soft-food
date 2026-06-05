import { createClient } from "@/lib/supabase/client";
import { getTenantId } from "@/lib/utils/tenant";
import type { AnalysisType, AnalysisInput, LaboratoryInput } from "./schemas";

// ── Tipos ────────────────────────────────────────────────────────────────────

export type AnalysisAttachment = {
  id: string;
  analysis_id: string;
  name: string;
  url: string; // path dentro del bucket privado `attachments`
  mime: string | null;
  size: number | null;
};

export type Analysis = {
  id: string;
  type: AnalysisType;
  analysis_date: string;
  conformity: number;
  sample_code: string | null;
  laboratory_id: string | null;
  member_id: string | null;
  observations_html: string | null;
  created_at: string;
  laboratory: { name: string } | null;
  member: { full_name: string | null } | null;
  attachments: AnalysisAttachment[];
};

export type Laboratory = {
  id: string;
  name: string;
  contact: { phone: string | null; email: string | null };
};

// Forma del jsonb `contact` tal cual viene de la DB (puede ser null/parcial).
type RawContact = { phone?: string | null; email?: string | null } | null;

function normalizeContact(raw: unknown): Laboratory["contact"] {
  const c = (raw ?? {}) as RawContact;
  return { phone: c?.phone ?? null, email: c?.email ?? null };
}

const ATTACHMENT_SELECT = "id, analysis_id, name, url, mime, size";

const ANALYSIS_SELECT = `
  id, type, analysis_date, conformity, sample_code, laboratory_id, member_id,
  observations_html, created_at,
  laboratory:laboratories(name),
  member:members(full_name),
  attachments:analysis_attachments(${ATTACHMENT_SELECT})
`;

// ── Análisis de laboratorio ──────────────────────────────────────────────────

export async function listAnalyses(params: {
  type?: AnalysisType | null;
  from?: string | null;
  to?: string | null;
  search?: string;
}): Promise<Analysis[]> {
  const supabase = createClient();
  let query = supabase
    .from("analyses")
    .select(ANALYSIS_SELECT)
    .is("deleted_at", null)
    .order("analysis_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200);

  if (params.type) query = query.eq("type", params.type);
  if (params.from) query = query.gte("analysis_date", params.from);
  if (params.to) query = query.lte("analysis_date", params.to);

  const q = params.search?.trim();
  if (q) {
    // Búsqueda por código de muestra u observaciones (ilike, escapando comas).
    const safe = q.replace(/[%,]/g, " ");
    query = query.or(
      `sample_code.ilike.%${safe}%,observations_html.ilike.%${safe}%`
    );
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as Analysis[];
}

export async function createAnalysis(input: AnalysisInput): Promise<Analysis> {
  const supabase = createClient();
  const tenant_id = await getTenantId();
  const { data, error } = await supabase
    .from("analyses")
    .insert({ ...input, tenant_id })
    .select(ANALYSIS_SELECT)
    .single();
  if (error) throw error;
  return data as unknown as Analysis;
}

export async function updateAnalysis(
  id: string,
  input: AnalysisInput
): Promise<Analysis> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("analyses")
    .update(input)
    .eq("id", id)
    .select(ANALYSIS_SELECT)
    .single();
  if (error) throw error;
  return data as unknown as Analysis;
}

export async function softDeleteAnalysis(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("analyses")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

// ── Laboratorios (catálogo del tenant) ───────────────────────────────────────

const LAB_SELECT = "id, name, contact";

export async function listLaboratories(): Promise<Laboratory[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("laboratories")
    .select(LAB_SELECT)
    .is("deleted_at", null)
    .order("name");
  if (error) throw error;
  return (data ?? []).map((l) => ({
    id: l.id,
    name: l.name,
    contact: normalizeContact(l.contact),
  }));
}

export async function createLaboratory(
  input: LaboratoryInput
): Promise<Laboratory> {
  const supabase = createClient();
  const tenant_id = await getTenantId();
  const { data, error } = await supabase
    .from("laboratories")
    .insert({ name: input.name, contact: input.contact, tenant_id })
    .select(LAB_SELECT)
    .single();
  if (error) throw error;
  return { id: data.id, name: data.name, contact: normalizeContact(data.contact) };
}

export async function updateLaboratory(
  id: string,
  input: LaboratoryInput
): Promise<Laboratory> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("laboratories")
    .update({ name: input.name, contact: input.contact })
    .eq("id", id)
    .select(LAB_SELECT)
    .single();
  if (error) throw error;
  return { id: data.id, name: data.name, contact: normalizeContact(data.contact) };
}

export async function softDeleteLaboratory(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("laboratories")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

// ── Adjuntos (bucket privado `attachments`, namespaced por tenant) ────────────
// Path: {tenant_id}/analyses/{analysis_id}/{uuid}.{ext} — la primera carpeta es
// SIEMPRE el tenant_id (regla de RLS de storage, migración 0003).

export async function uploadAnalysisAttachment(params: {
  analysisId: string;
  file: File;
}): Promise<AnalysisAttachment> {
  const supabase = createClient();
  const tenantId = await getTenantId();
  const ext = params.file.name.split(".").pop()?.toLowerCase() || "bin";
  const path = `${tenantId}/analyses/${params.analysisId}/${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from("attachments")
    .upload(path, params.file, { contentType: params.file.type });
  if (upErr) throw upErr;

  const { data, error } = await supabase
    .from("analysis_attachments")
    .insert({
      analysis_id: params.analysisId,
      name: params.file.name,
      url: path,
      mime: params.file.type || null,
      size: params.file.size,
    })
    .select(ATTACHMENT_SELECT)
    .single();
  if (error) {
    // Si falla el registro, no dejamos el objeto huérfano en storage.
    await supabase.storage.from("attachments").remove([path]);
    throw error;
  }
  return data as AnalysisAttachment;
}

export async function deleteAnalysisAttachment(
  attachment: Pick<AnalysisAttachment, "id" | "url">
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("analysis_attachments")
    .delete()
    .eq("id", attachment.id);
  if (error) throw error;
  // Borrado del objeto en storage (best-effort; el registro ya no existe).
  await supabase.storage.from("attachments").remove([attachment.url]);
}

/** Signed URL de lectura (bucket privado) para descargar/ver un adjunto. */
export async function getAttachmentUrl(path: string): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from("attachments")
    .createSignedUrl(path, 60 * 10);
  if (error) throw error;
  return data.signedUrl;
}
