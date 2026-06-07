import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import {
  DOT,
  buildEmailLayout,
} from "@/lib/emails/templates";
import {
  RATE_LIMIT_PER_HOUR,
  RATE_LIMIT_WINDOW_MS,
  checkRateLimit,
} from "./schemas";

// =============================================================================
// modules/outbound-email/server — helpers SERVER-ONLY del envio manual.
//
// El route handler /api/emails/send los usa para: (1) resolver la identidad de
// remitente del tenant (nombre, reply-to, firma) sin exponer el SMTP propio;
// (2) armar el cuerpo HTML con el layout de marca y la firma del tenant;
// (3) chequear el rate limit leyendo system_emails con el admin client.
// =============================================================================

type Admin = SupabaseClient<Database>;

export interface TenantEmailIdentity {
  /** Nombre del negocio (tenants.name) — fallback de header y from_name. */
  negocio: string;
  /** Logo del tenant para el header del email. */
  logoUrl: string | null;
  /** Nombre que firma los envios (email_from_name o el negocio). */
  fromName: string;
  /** Reply-To configurado por el tenant (o null). */
  replyTo: string | null;
  /** Pie/firma opcional (texto plano). */
  signature: string | null;
}

/** Resuelve la identidad de remitente del tenant desde tenant_branding + tenants. */
export async function resolveTenantEmailIdentity(
  admin: Admin,
  tenantId: string,
): Promise<TenantEmailIdentity> {
  const [{ data: tenant }, { data: branding }] = await Promise.all([
    admin.from("tenants").select("name").eq("id", tenantId).maybeSingle(),
    admin
      .from("tenant_branding")
      .select("logo_url, email_from_name, email_reply_to, email_signature")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
  ]);
  const negocio = (tenant?.name ?? "Ninja Food").trim() || "Ninja Food";
  return {
    negocio,
    logoUrl: branding?.logo_url ?? null,
    fromName: (branding?.email_from_name ?? "").trim() || negocio,
    replyTo: (branding?.email_reply_to ?? "").trim() || null,
    signature: (branding?.email_signature ?? "").trim() || null,
  };
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Quiebra el texto en parrafos preservando saltos de linea (escapado). */
function paragraphs(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((block) => `<p>${esc(block).replace(/\n/g, "<br />")}</p>`)
    .join("");
}

/**
 * Arma el cuerpo HTML del email de un documento, con el layout de marca del
 * tenant y su firma. El mensaje del usuario ya pasó la regla 6 (sin emojis ni
 * em-dash) en el schema. Si el mensaje viene vacio, usa una linea por defecto
 * que nombra el documento adjunto.
 */
export function buildDocumentEmailHtml(args: {
  identity: TenantEmailIdentity;
  message: string;
  documentLabel: string;
  attachmentNames: string[];
}): string {
  const { identity, message, documentLabel, attachmentNames } = args;
  const blocks: string[] = [];

  const body = message.trim();
  if (body) {
    blocks.push(paragraphs(body));
  } else {
    const doc = documentLabel.trim() || "el documento adjunto";
    blocks.push(
      `<p>Hola, te compartimos ${esc(doc)} desde <strong>${esc(identity.negocio)}</strong>.</p>`,
    );
  }

  if (attachmentNames.length > 0) {
    const items = attachmentNames
      .map((n) => `<tr><td class="k">Adjunto</td><td class="v">${esc(n)}</td></tr>`)
      .join("");
    blocks.push(
      `<table class="data" role="presentation"><tbody>${items}</tbody></table>`,
    );
  }

  if (identity.signature) {
    blocks.push(
      `<p class="muted" style="margin-top:24px;">${esc(identity.signature).replace(/\n/g, "<br />")}</p>`,
    );
  } else {
    blocks.push(
      `<p class="muted" style="margin-top:24px;">${esc(identity.negocio)} ${DOT} enviado con Ninja Food</p>`,
    );
  }

  return buildEmailLayout(blocks.join(""), {
    logoUrl: identity.logoUrl,
    negocio: identity.negocio,
  });
}

/**
 * Verifica el rate limit del tenant leyendo los created_at de system_emails de
 * la ultima ventana. Devuelve el resultado de checkRateLimit (puro).
 */
export async function checkTenantRateLimit(
  admin: Admin,
  tenantId: string,
  now: number = Date.now(),
): Promise<ReturnType<typeof checkRateLimit>> {
  const sinceIso = new Date(now - RATE_LIMIT_WINDOW_MS).toISOString();
  const { data } = await admin
    .from("system_emails")
    .select("created_at")
    .eq("tenant_id", tenantId)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: true });
  const timestamps = (data ?? [])
    .map((r) => new Date(r.created_at).getTime())
    .filter((t) => Number.isFinite(t));
  return checkRateLimit(timestamps, now, RATE_LIMIT_PER_HOUR, RATE_LIMIT_WINDOW_MS);
}
