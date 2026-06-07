import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendSystemEmail } from "@/lib/emails/enqueue";
import {
  attachmentSchema,
  attachmentsFit,
  sendEmailSchema,
  totalAttachmentBytes,
  MAX_ATTACHMENTS_BYTES,
  type EmailAttachment,
} from "@/modules/outbound-email/schemas";
import {
  buildDocumentEmailHtml,
  checkTenantRateLimit,
  resolveTenantEmailIdentity,
} from "@/modules/outbound-email/server";
import { z } from "zod";

// =============================================================================
// POST /api/emails/send — envia un documento del tenant (planilla, remito,
// receta, recall, informe) por email a uno o varios destinatarios.
//
// Lo llama modules/outbound-email/api (SendEmailModal). Flujo:
//   1. Sesion del tenant (createClient server): tenant_id sale del JWT
//      (app_metadata.tenant_id). Sin sesion -> 401.
//   2. Revalida el body con el schema (regla 6: sin emojis ni em-dash; max
//      destinatarios; longitudes) y el tamano total de adjuntos (<=5MB).
//   3. Rate limit suave por tenant: max 20 envios/hora (cuenta system_emails).
//   4. Resuelve la identidad de remitente del tenant (nombre, reply-to, firma)
//      y arma el cuerpo HTML con el layout de marca.
//   5. Encola via la Edge Function send_email (service_role) por cada
//      destinatario, con los adjuntos. Cada envio queda en system_emails.
//
// El SMTP real es el de plataforma: el tenant NO configura servidor propio.
// runtime nodejs (service_role en enqueue: nunca edge/cliente).
// =============================================================================

export const runtime = "nodejs";

const bodySchema = sendEmailSchema.extend({
  attachments: z.array(attachmentSchema).max(10).default([]),
});

export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const tenantId = user.app_metadata?.tenant_id;
  if (typeof tenantId !== "string" || !tenantId) {
    return NextResponse.json({ error: "no_tenant" }, { status: 403 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "invalid_input",
        detail: parsed.error.issues[0]?.message ?? "Datos invalidos",
      },
      { status: 400 },
    );
  }
  const input = parsed.data;
  const attachments: EmailAttachment[] = input.attachments;

  // Tamano total de adjuntos (defensa server-side, espejo del cliente y la
  // Edge Function). 413 Payload Too Large.
  if (!attachmentsFit(attachments)) {
    return NextResponse.json(
      {
        error: "attachments_too_large",
        detail: `Los adjuntos pesan ${(totalAttachmentBytes(attachments) / 1024 / 1024).toFixed(1)} MB (maximo ${MAX_ATTACHMENTS_BYTES / 1024 / 1024} MB).`,
      },
      { status: 413 },
    );
  }

  const admin = createAdminClient();

  // Rate limit suave por tenant.
  const rate = await checkTenantRateLimit(admin, tenantId);
  if (!rate.allowed) {
    const mins = Math.ceil(rate.retryAfterMs / 60000);
    return NextResponse.json(
      {
        error: "rate_limited",
        detail: `Alcanzaste el limite de envios por hora. Probá de nuevo en ${mins} minuto${mins === 1 ? "" : "s"}.`,
        retryAfterMs: rate.retryAfterMs,
      },
      { status: 429 },
    );
  }
  // Si el lote excede lo que queda de cuota, lo rechazamos entero (no enviamos a
  // medias para no dejar a algunos clientes notificados y a otros no).
  if (input.to.length > rate.remaining) {
    return NextResponse.json(
      {
        error: "rate_limited",
        detail: `Te quedan ${rate.remaining} envios en esta hora y pediste ${input.to.length}. Reducí los destinatarios o esperá.`,
        retryAfterMs: rate.retryAfterMs,
      },
      { status: 429 },
    );
  }

  // Identidad de remitente del tenant + cuerpo HTML.
  const identity = await resolveTenantEmailIdentity(admin, tenantId);
  const html = buildDocumentEmailHtml({
    identity,
    message: input.message ?? "",
    documentLabel: input.documentLabel ?? "",
    attachmentNames: attachments.map((a) => a.filename),
  });

  // Un envio por destinatario: cada uno queda registrado en system_emails y
  // recibe el documento sin ver a los demas (privacidad entre clientes).
  let sent = 0;
  const errors: string[] = [];
  for (const to of input.to) {
    const res = await sendSystemEmail({
      tenantId,
      to,
      subject: input.subject,
      html,
      attachments,
      replyTo: identity.replyTo,
      fromName: identity.fromName,
    });
    if (res.ok) sent += 1;
    else errors.push(res.error ?? "send_failed");
  }

  if (sent === 0) {
    return NextResponse.json(
      {
        ok: false,
        error: "send_failed",
        detail: errors[0] ?? "No se pudo enviar el email.",
      },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, sent, total: input.to.length });
}
