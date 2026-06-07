import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireInternal } from "@/modules/internal/server";

// =============================================================================
// modules/internal-emails/server — lectura server-only de la consola de emails.
//
// system_email_smtp y system_email_templates son SOLO service_role (sin policy
// para authenticated): se leen con el admin client en server components, tras
// re-verificar is_internal (defensa en profundidad: el service role bypassa RLS).
// La password del SMTP NUNCA baja al cliente: se devuelve solo `hasPassword`.
// =============================================================================

export interface SmtpConfigView {
  hostname: string;
  port: number;
  username: string;
  /** True si hay password guardada. El valor en claro NUNCA se expone. */
  hasPassword: boolean;
  fromEmail: string;
  fromName: string;
  secure: boolean;
  updatedAt: string | null;
}

/** Config SMTP (id=1) sin la password en claro. Null si no esta configurada. */
export async function getSmtpConfig(): Promise<SmtpConfigView | null> {
  if (!(await requireInternal({ api: true }))) throw new Error("forbidden");
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("system_email_smtp")
    .select("hostname, port, username, password, from_email, from_name, secure, updated_at")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    hostname: data.hostname ?? "",
    port: data.port ?? 587,
    username: data.username ?? "",
    hasPassword: Boolean(data.password),
    fromEmail: data.from_email ?? "",
    fromName: data.from_name ?? "",
    secure: Boolean(data.secure),
    updatedAt: data.updated_at ?? null,
  };
}

export interface TemplateOverride {
  subject: string;
  html: string;
}

/** Overrides globales por key (system_email_templates). Mapa key -> {subject,html}. */
export async function getTemplateOverrides(): Promise<
  Record<string, TemplateOverride>
> {
  if (!(await requireInternal({ api: true }))) throw new Error("forbidden");
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("system_email_templates")
    .select("key, subject, html");
  if (error) throw error;
  const map: Record<string, TemplateOverride> = {};
  for (const row of (data ?? []) as { key: string; subject: string; html: string }[]) {
    map[row.key] = { subject: row.subject, html: row.html };
  }
  return map;
}
