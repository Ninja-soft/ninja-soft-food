import { createClient } from "@/lib/supabase/client";
import { getTenantId } from "@/lib/utils/tenant";
import {
  attachmentsFit,
  type EmailAttachment,
  type SendEmailInput,
} from "./schemas";

// =============================================================================
// modules/outbound-email/api — cliente del envio manual de documentos por email.
//
// Convierte un Blob (PDF/Excel ya generado por los modules existentes) a un
// adjunto base64 y lo postea a /api/emails/send con la sesion del tenant. El
// route handler revalida tamano + regla 6, aplica el rate limit, resuelve la
// identidad de remitente del tenant y registra en system_emails.
//
// Toda la logica de negocio vive aca, nunca en componentes.
// =============================================================================

export type SendDocumentResult =
  | { ok: true; sent: number }
  | { ok: false; error: string; detail?: string; retryAfterMs?: number };

/** Lee un Blob a base64 (sin el prefijo data:). */
export async function blobToBase64(blob: Blob): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
    reader.readAsDataURL(blob);
  });
  const comma = dataUrl.indexOf(",");
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}

/** Convierte un { blob, filename } en un adjunto listo para el envio. */
export async function blobToAttachment(
  blob: Blob,
  filename: string,
): Promise<EmailAttachment> {
  return {
    filename,
    contentType: blob.type || guessContentType(filename),
    content: await blobToBase64(blob),
  };
}

function guessContentType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return "application/pdf";
  if (ext === "xlsx")
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  return "application/octet-stream";
}

/**
 * Envia un documento (PDF/Excel) por email a los destinatarios dados. El asunto
 * y el mensaje los validó el schema antes de llegar aca. Best-effort en cuanto a
 * UX: no lanza, devuelve un resultado tipado para que el modal muestre el error.
 */
export async function sendDocumentEmail(params: {
  input: SendEmailInput;
  attachments: EmailAttachment[];
}): Promise<SendDocumentResult> {
  const { input, attachments } = params;

  if (!attachmentsFit(attachments)) {
    return {
      ok: false,
      error: "attachments_too_large",
      detail: "Los adjuntos superan el limite de 5 MB.",
    };
  }

  try {
    const res = await fetch("/api/emails/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: input.to,
        subject: input.subject,
        message: input.message ?? "",
        documentLabel: input.documentLabel ?? "",
        attachments,
      }),
    });
    const data = (await res.json().catch(() => null)) as
      | { ok?: boolean; sent?: number; error?: string; detail?: string; retryAfterMs?: number }
      | null;
    if (!res.ok || !data || data.ok === false) {
      return {
        ok: false,
        error: data?.error ?? "send_failed",
        detail: data?.detail,
        retryAfterMs: data?.retryAfterMs,
      };
    }
    return { ok: true, sent: data.sent ?? input.to.length };
  } catch (e) {
    return {
      ok: false,
      error: "network_error",
      detail: e instanceof Error ? e.message : undefined,
    };
  }
}

// ── Sugerencias de destinatarios por contexto ─────────────────────────────────
// El modal arranca con sugerencias segun lo que se envia: el email del cliente
// del despacho, los emails de los operarios notificados de un informe, los
// emails de los clientes afectados de un recall. Estas funciones leen con RLS
// (cliente del tenant): nunca se filtran datos de otro tenant.

/** Emails de los operarios notificados de un informe (los que tienen email). */
export async function suggestReportRecipients(
  notifyMemberIds: string[],
): Promise<string[]> {
  if (notifyMemberIds.length === 0) return [];
  const supabase = createClient();
  const { data } = await supabase
    .from("members")
    .select("email")
    .in("id", notifyMemberIds)
    .is("deleted_at", null);
  return (data ?? [])
    .map((m) => (m.email ?? "").trim().toLowerCase())
    .filter((e) => e.length > 0);
}

/** Email del cliente de un despacho (si tiene cargado). */
export async function suggestCustomerRecipient(
  customerId: string | null | undefined,
): Promise<string[]> {
  if (!customerId) return [];
  const supabase = createClient();
  const { data } = await supabase
    .from("customers")
    .select("email")
    .eq("id", customerId)
    .maybeSingle();
  const email = (data?.email ?? "").trim().toLowerCase();
  return email ? [email] : [];
}

/** tenant_id de la sesion (para chequeos del modal; el route handler lo revalida). */
export async function currentTenantId(): Promise<string> {
  return getTenantId();
}
