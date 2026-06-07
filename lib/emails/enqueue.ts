import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildSendEmailPayload,
  type BuildPayloadArgs,
  type SendEmailAttachment,
} from "./templates";

// =============================================================================
// lib/emails/enqueue — helper server-only para disparar un email del sistema.
//
// Invoca la Edge Function `send_email` (Deno + SMTPClient) con el admin client
// (service_role): el envio necesita leer system_email_smtp y escribir el log en
// system_emails, ambas sin politicas para authenticated. Calcado del patron del
// POS (functions.invoke contra send_email) adaptado al esquema de Food.
//
// REGLA DURA: un email caido NUNCA tira una operacion de negocio. Toda falla se
// captura, se loguea con console.warn y la funcion devuelve { ok:false } sin
// lanzar. El llamador puede ignorar el resultado por completo.
// =============================================================================

export interface SendSystemEmailArgs {
  /** Tenant para resolver el template (override en email_templates). Opcional. */
  tenantId?: string | null;
  /** Key del template del catalogo (lib/emails/templates). */
  templateKey?: string | null;
  /** Destinatario. */
  to: string;
  /** Variables {{var}} para interpolar en subject/html. */
  variables?: Record<string, string | number | null | undefined>;
  /** Override directo de subject (si no se usa template). */
  subject?: string | null;
  /** Override directo de html (si no se usa template). */
  html?: string | null;
  /** Adjuntos base64 (planillas, remitos, etc.). Limite ~5MB en la Edge Function. */
  attachments?: SendEmailAttachment[] | null;
  /** Reply-To (identidad de remitente del tenant). */
  replyTo?: string | null;
  /** Nombre del remitente (display name del From). */
  fromName?: string | null;
}

export interface SendSystemEmailResult {
  ok: boolean;
  error?: string;
}

/**
 * Encola/envia un email del sistema. Best-effort: nunca lanza. Devuelve
 * { ok:true } si la Edge Function respondio sin error, { ok:false, error } en
 * cualquier otro caso (incluido SMTP no configurado en local).
 */
export async function sendSystemEmail(
  args: SendSystemEmailArgs,
): Promise<SendSystemEmailResult> {
  const to = args.to?.trim().toLowerCase();
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    console.warn("[emails] destinatario invalido, se omite el envio:", args.to);
    return { ok: false, error: "invalid_to" };
  }

  const payload = buildSendEmailPayload({
    to,
    tenantId: args.tenantId ?? null,
    templateKey: args.templateKey ?? null,
    subject: args.subject ?? null,
    html: args.html ?? null,
    variables: args.variables,
    attachments: args.attachments ?? null,
    replyTo: args.replyTo ?? null,
    fromName: args.fromName ?? null,
  } satisfies BuildPayloadArgs);

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.functions.invoke("send_email", {
      body: payload,
    });
    if (error) {
      console.warn("[emails] send_email fallo:", error.message);
      return { ok: false, error: error.message };
    }
    const result = data as { ok?: boolean; error?: string } | null;
    if (result && result.ok === false) {
      console.warn("[emails] send_email rechazo:", result.error);
      return { ok: false, error: result.error ?? "send_rejected" };
    }
    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.warn("[emails] excepcion al invocar send_email:", message);
    return { ok: false, error: message };
  }
}

/**
 * Dispara varios emails en paralelo (best-effort). Devuelve cuantos salieron OK.
 * Util para notificar a una lista de operarios sin abortar si uno falla.
 */
export async function sendSystemEmails(
  list: SendSystemEmailArgs[],
): Promise<{ sent: number; total: number }> {
  const results = await Promise.all(list.map((a) => sendSystemEmail(a)));
  return { sent: results.filter((r) => r.ok).length, total: results.length };
}
