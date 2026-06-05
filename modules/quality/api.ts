import { createClient } from "@/lib/supabase/client";
import { getTenantId } from "@/lib/utils/tenant";
import type {
  AnalysisType,
  AnalysisInput,
  LaboratoryInput,
  ReportInput,
} from "./schemas";

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
// La primera carpeta del path es SIEMPRE el tenant_id (regla de RLS de storage,
// migración 0003). Análisis usan {tenant}/analyses/{id}/... e informes usan
// {tenant}/reports/{id}/... — el helper genérico sube el objeto y deja que cada
// dominio inserte la fila en su tabla de adjuntos.

/** Sube un File al bucket privado y devuelve el path. Lanza si falla. */
async function uploadAttachmentObject(folder: string, file: File): Promise<string> {
  const supabase = createClient();
  const tenantId = await getTenantId();
  const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
  const path = `${tenantId}/${folder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from("attachments")
    .upload(path, file, { contentType: file.type });
  if (error) throw error;
  return path;
}

export async function uploadAnalysisAttachment(params: {
  analysisId: string;
  file: File;
}): Promise<AnalysisAttachment> {
  const supabase = createClient();
  const path = await uploadAttachmentObject(
    `analyses/${params.analysisId}`,
    params.file
  );

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

// ── Informes bromatológicos (reports) ─────────────────────────────────────────
// Los informes NO son form_submissions: son EDITABLES (docs/03 §2/§3 reserva la
// inmutabilidad regulatoria a form_submissions y public_traces.payload, no a
// reports). Por eso exponemos updateReport.

export type ReportAttachment = {
  id: string;
  report_id: string;
  name: string;
  url: string; // path dentro del bucket privado `attachments`
  mime: string | null;
  size: number | null;
};

export type Report = {
  id: string;
  report_date: string;
  content_html: string;
  importance: number;
  member_id: string | null;
  notify_member_ids: string[];
  created_at: string;
  member: { full_name: string | null } | null;
  attachments: ReportAttachment[];
};

export type Member = {
  id: string;
  full_name: string;
  email: string | null;
};

const REPORT_ATTACHMENT_SELECT = "id, report_id, name, url, mime, size";

const REPORT_SELECT = `
  id, report_date, content_html, importance, member_id, notify_member_ids,
  created_at,
  member:members(full_name),
  attachments:report_attachments(${REPORT_ATTACHMENT_SELECT})
`;

export async function listReports(params: {
  from?: string | null;
  to?: string | null;
  search?: string;
}): Promise<Report[]> {
  const supabase = createClient();
  let query = supabase
    .from("reports")
    .select(REPORT_SELECT)
    .is("deleted_at", null)
    .order("report_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200);

  if (params.from) query = query.gte("report_date", params.from);
  if (params.to) query = query.lte("report_date", params.to);

  const q = params.search?.trim();
  if (q) {
    // Búsqueda en el cuerpo del informe (ilike sobre el HTML, escapando comas).
    const safe = q.replace(/[%,]/g, " ");
    query = query.ilike("content_html", `%${safe}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as Report[];
}

export async function createReport(input: ReportInput): Promise<Report> {
  const supabase = createClient();
  const tenant_id = await getTenantId();
  const { data, error } = await supabase
    .from("reports")
    .insert({ ...input, tenant_id })
    .select(REPORT_SELECT)
    .single();
  if (error) throw error;
  return data as unknown as Report;
}

export async function updateReport(
  id: string,
  input: ReportInput
): Promise<Report> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("reports")
    .update(input)
    .eq("id", id)
    .select(REPORT_SELECT)
    .single();
  if (error) throw error;
  return data as unknown as Report;
}

export async function softDeleteReport(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("reports")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function uploadReportAttachment(params: {
  reportId: string;
  file: File;
}): Promise<ReportAttachment> {
  const supabase = createClient();
  const path = await uploadAttachmentObject(
    `reports/${params.reportId}`,
    params.file
  );

  const { data, error } = await supabase
    .from("report_attachments")
    .insert({
      report_id: params.reportId,
      name: params.file.name,
      url: path,
      mime: params.file.type || null,
      size: params.file.size,
    })
    .select(REPORT_ATTACHMENT_SELECT)
    .single();
  if (error) {
    await supabase.storage.from("attachments").remove([path]);
    throw error;
  }
  return data as ReportAttachment;
}

export async function deleteReportAttachment(
  attachment: Pick<ReportAttachment, "id" | "url">
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("report_attachments")
    .delete()
    .eq("id", attachment.id);
  if (error) throw error;
  await supabase.storage.from("attachments").remove([attachment.url]);
}

// ── Operarios (members) — selector de notificados ─────────────────────────────

export async function listMembers(): Promise<Member[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("members")
    .select("id, full_name, email")
    .is("deleted_at", null)
    .order("full_name");
  if (error) throw error;
  return (data ?? []) as Member[];
}
