import { createClient } from "@/lib/supabase/client";
import { getTenantId } from "@/lib/utils/tenant";
import type { Json } from "@/types/database";
import type {
  FormField,
  FormKind,
  FormValues,
  Frequency,
  SubmissionStatus,
  TemplateInput,
} from "./schemas";
import { getStarterTemplates } from "./starterTemplates";

// API del Builder de planillas configurables (migración 0009, ya aplicada en
// cloud). El cliente está tipado contra types/database.ts: las tablas
// form_templates / form_submissions y la RPC submit_form son tipos generados.
// Los tipos de dominio (FormTemplate.fields: FormField[]) difieren de las Row
// generadas (fields: Json), así que se castea puntualmente desde Json al mapear
// (patrón del repo). MigrationPendingError se mantiene por robustez.

// ── Tipos de dominio ─────────────────────────────────────────────────────────

export type FormTemplate = {
  id: string;
  name: string;
  kind: FormKind;
  fields: FormField[];
  frequency: Frequency;
  requires_signature: boolean;
  action_on_fail: { instructions?: string | null } | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type FormSubmission = {
  id: string;
  template_id: string;
  submitted_by_member_id: string | null;
  values: FormValues;
  status: SubmissionStatus;
  corrective_action: string | null;
  corrects_submission_id: string | null;
  submitted_at: string;
  member: { full_name: string | null } | null;
};

export type Member = {
  id: string;
  full_name: string;
  email: string | null;
};

export type SubmitFormArgs = {
  templateId: string;
  values: FormValues;
  memberId?: string | null;
  pin?: string | null;
  status?: SubmissionStatus;
  correctiveAction?: string | null;
  correctsSubmissionId?: string | null;
};

export type SubmitFormResult = { submission_id: string; signed: boolean };

/**
 * Robustez defensiva: la migración 0009 (form_templates / form_submissions /
 * submit_form) ya está aplicada en cloud, pero si un entorno quedara sin migrar,
 * los errores de "tabla inexistente" (PostgREST PGRST205 / Postgres 42P01) y de
 * "función inexistente" (PGRST202) se traducen a este flag para que la UI muestre
 * un empty state en vez de romper.
 */
export class MigrationPendingError extends Error {
  constructor() {
    super("migration_pending");
    this.name = "MigrationPendingError";
  }
}

type PgError = { message?: string; code?: string } | null;

function isMigrationPending(error: PgError): boolean {
  if (!error) return false;
  const code = error.code ?? "";
  const msg = error.message ?? "";
  return (
    code === "PGRST205" ||
    code === "42P01" ||
    code === "PGRST202" ||
    msg.includes("form_templates") ||
    msg.includes("form_submissions") ||
    msg.includes("submit_form")
  );
}

const TEMPLATE_SELECT =
  "id, name, kind, fields, frequency, requires_signature, action_on_fail, is_active, created_at, updated_at";

const SUBMISSION_SELECT =
  "id, template_id, submitted_by_member_id, values, status, corrective_action, corrects_submission_id, submitted_at, member:members(full_name)";

// ── Templates ────────────────────────────────────────────────────────────────

export async function listTemplates(search = ""): Promise<FormTemplate[]> {
  const supabase = createClient();
  let query = supabase
    .from("form_templates")
    .select(TEMPLATE_SELECT)
    .is("deleted_at", null)
    .eq("is_active", true)
    .order("name");
  if (search.trim()) query = query.ilike("name", `%${search.trim()}%`);
  const { data, error } = await query;
  if (error) {
    if (isMigrationPending(error)) throw new MigrationPendingError();
    throw error;
  }
  // Row.fields/frequency/action_on_fail son Json; el dominio los tipa estructurado.
  return (data ?? []) as unknown as FormTemplate[];
}

export async function createTemplate(
  input: TemplateInput
): Promise<FormTemplate> {
  const supabase = createClient();
  const tenant_id = await getTenantId();
  const { data, error } = await supabase
    .from("form_templates")
    .insert({
      tenant_id,
      name: input.name,
      kind: input.kind,
      fields: input.fields as Json,
      frequency: input.frequency as Json,
      requires_signature: input.requires_signature,
      action_on_fail: (input.action_on_fail ?? null) as Json,
    })
    .select(TEMPLATE_SELECT)
    .single();
  if (error) {
    if (isMigrationPending(error)) throw new MigrationPendingError();
    throw error;
  }
  return data as unknown as FormTemplate;
}

export async function updateTemplate(
  id: string,
  input: TemplateInput
): Promise<FormTemplate> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("form_templates")
    .update({
      name: input.name,
      kind: input.kind,
      fields: input.fields as Json,
      frequency: input.frequency as Json,
      requires_signature: input.requires_signature,
      action_on_fail: (input.action_on_fail ?? null) as Json,
    })
    .eq("id", id)
    .select(TEMPLATE_SELECT)
    .single();
  if (error) {
    if (isMigrationPending(error)) throw new MigrationPendingError();
    throw error;
  }
  return data as unknown as FormTemplate;
}

export async function softDeleteTemplate(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("form_templates")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    if (isMigrationPending(error)) throw new MigrationPendingError();
    throw error;
  }
}

// ── Starter pack por rubro (onboarding) ───────────────────────────────────────
// Siembra los templates default del rubro al onboardear el tenant. Son un PUNTO
// DE PARTIDA editable (regla 10): el tenant los ajusta o borra. Idempotente: si
// el tenant ya tiene templates vivos, no hace nada. NUNCA lanza — best-effort.

export type SeedStarterResult = { seeded: number; skipped: boolean };

/** Cuenta de templates vivos del tenant (idempotencia del seed). */
async function countLiveTemplates(): Promise<number> {
  const supabase = createClient();
  const { count, error } = await supabase
    .from("form_templates")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null);
  if (error) {
    if (isMigrationPending(error)) throw new MigrationPendingError();
    throw error;
  }
  return count ?? 0;
}

/**
 * Inserta los templates iniciales del rubro vía createTemplate (RLS) si el
 * tenant todavía no tiene ninguno. Best-effort: nunca lanza.
 * - Migración 0009 pendiente → { seeded: 0, skipped: true }.
 * - Ya hay templates → { seeded: 0, skipped: true }.
 * - Cualquier otro error → log + { seeded: count_parcial, skipped: false }.
 */
export async function seedStarterTemplates(
  rubro: string
): Promise<SeedStarterResult> {
  try {
    const existing = await countLiveTemplates();
    if (existing > 0) return { seeded: 0, skipped: true };

    const templates = getStarterTemplates(rubro);
    let seeded = 0;
    for (const t of templates) {
      try {
        await createTemplate(t);
        seeded += 1;
      } catch (err) {
        if (err instanceof MigrationPendingError) {
          return { seeded, skipped: seeded === 0 };
        }
        // Un template que falla no debe abortar el resto del pack.
        // eslint-disable-next-line no-console
        console.warn(`seedStarterTemplates: fallo "${t.name}"`, err);
      }
    }
    return { seeded, skipped: false };
  } catch (err) {
    if (err instanceof MigrationPendingError) {
      return { seeded: 0, skipped: true };
    }
    // eslint-disable-next-line no-console
    console.warn("seedStarterTemplates: error inesperado", err);
    return { seeded: 0, skipped: false };
  }
}

// ── Submissions (registros) ──────────────────────────────────────────────────

export async function listSubmissions(params: {
  templateId: string;
  from?: string | null;
  to?: string | null;
}): Promise<FormSubmission[]> {
  const supabase = createClient();
  let query = supabase
    .from("form_submissions")
    .select(SUBMISSION_SELECT)
    .eq("template_id", params.templateId)
    .order("submitted_at", { ascending: false })
    .limit(200);

  if (params.from) query = query.gte("submitted_at", params.from);
  if (params.to) query = query.lte("submitted_at", `${params.to}T23:59:59.999`);

  const { data, error } = await query;
  if (error) {
    if (isMigrationPending(error)) throw new MigrationPendingError();
    throw error;
  }
  // Row.values es Json; el dominio lo tipa como FormValues (parse del jsonb).
  return (data ?? []) as unknown as FormSubmission[];
}

/** Cuenta de registros por template (mostrar el badge sin traer las filas). */
export async function countSubmissions(templateId: string): Promise<number> {
  const supabase = createClient();
  const { count, error } = await supabase
    .from("form_submissions")
    .select("id", { count: "exact", head: true })
    .eq("template_id", templateId);
  if (error) {
    if (isMigrationPending(error)) throw new MigrationPendingError();
    throw error;
  }
  return count ?? 0;
}

/**
 * Registra una planilla vía RPC submit_form (firma con PIN bcrypt en la DB).
 * El PIN NUNCA se persiste ni se loguea client-side: va directo a la RPC.
 */
export async function submitForm(
  args: SubmitFormArgs
): Promise<SubmitFormResult> {
  const supabase = createClient();
  // Los opcionales se omiten (?? undefined) para que aplique el DEFAULT de la RPC
  // (member_id/pin/corrective/corrects → null, status → 'ok'): mismo efecto que
  // pasar null, pero alineado con la firma generada (p_* opcionales: string).
  const { data, error } = await supabase.rpc("submit_form", {
    p_template_id: args.templateId,
    p_values: args.values as Json,
    p_member_id: args.memberId ?? undefined,
    p_pin: args.pin ?? undefined,
    p_status: args.status ?? "ok",
    p_corrective_action: args.correctiveAction ?? undefined,
    p_corrects: args.correctsSubmissionId ?? undefined,
  });
  if (error) {
    if (isMigrationPending(error)) throw new MigrationPendingError();
    if (error.message?.includes("invalid_pin"))
      throw new Error("PIN incorrecto");
    if (error.message?.includes("signature_required"))
      throw new Error("Esta planilla requiere firma");
    if (error.message?.includes("template_not_found"))
      throw new Error("La planilla ya no existe");
    if (error.message?.includes("template_inactive"))
      throw new Error("La planilla está desactivada");
    if (error.message?.includes("member_not_found"))
      throw new Error("Operario no encontrado");
    if (error.message?.includes("corrects_not_found"))
      throw new Error("No se encontró el registro a corregir");
    if (error.message?.includes("invalid_values"))
      throw new Error("Los datos del registro son inválidos");
    throw new Error(error.message ?? "No se pudo registrar la planilla");
  }
  return data as unknown as SubmitFormResult;
}

// ── Operarios (members) — firma de la planilla ────────────────────────────────
// Reutiliza la misma forma que modules/quality/api.ts listMembers; se duplica acá
// para no acoplar el módulo de calidad con el de planillas.

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

// ── Fotos de campos `photo` (bucket privado `attachments`) ────────────────────
// Mismo patrón que modules/quality: la primera carpeta del path es SIEMPRE el
// tenant_id (RLS de storage, migración 0003). Las fotos de planillas viven en
// {tenant}/forms/... y se referencian desde values[key] = { path, name }.
// El path se persiste en el jsonb inmutable; la URL se firma al leer.

/** Sube una foto al bucket privado y devuelve { path, name }. Lanza si falla. */
export async function uploadFormPhoto(file: File): Promise<{
  path: string;
  name: string;
}> {
  const supabase = createClient();
  const tenantId = await getTenantId();
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${tenantId}/forms/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from("attachments")
    .upload(path, file, { contentType: file.type });
  if (error) throw error;
  return { path, name: file.name };
}

/** Borra una foto del bucket (best-effort, p.ej. al descartar el draft). */
export async function removeFormPhoto(path: string): Promise<void> {
  const supabase = createClient();
  await supabase.storage.from("attachments").remove([path]);
}

/** Signed URL de lectura (bucket privado) para mostrar/descargar una foto. */
export async function getFormPhotoUrl(path: string): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from("attachments")
    .createSignedUrl(path, 60 * 10);
  if (error) throw error;
  return data.signedUrl;
}
