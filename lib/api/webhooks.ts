import { createHmac, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

// =============================================================================
// lib/api/webhooks.ts — dispatcher de webhooks salientes firmados (server-only).
//
// Eventos del tenant (outbound_webhooks): 'production.completed',
// 'dispatch.created', 'stock.low'. Cada entrega se firma HMAC-SHA256 sobre
// `${ts}.${body}` con el secret del webhook (outbound_webhooks.secret, en claro
// a propósito: nosotros somos el emisor y necesitamos el material para firmar).
//
// Cabecera de firma (estilo Stripe / MP):
//   X-NinjaFood-Signature: ts=<unix_seconds>,v1=<hex_hmac_sha256(ts.body)>
//
// emitWebhookEvent es best-effort: NUNCA lanza. Si la migración 0010 no está
// aplicada, si no hay webhooks suscritos, o si la entrega falla, registra y
// sigue. El wiring real (llamar a esta función cuando se completa una producción
// / se crea un despacho / baja el stock) va vía database webhook o pg_net en una
// fase posterior: no se puede disparar desde el flujo client-side de completar
// producción. Por ahora la función queda expuesta + testeada (firma verificable).
// regenerated after db:types — outbound_webhooks no está en los tipos aún.
// =============================================================================

export const WEBHOOK_EVENTS = [
  "production.completed",
  "dispatch.created",
  "stock.low",
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

const DELIVERY_TIMEOUT_MS = 5000;

/** Construye la cabecera de firma para un cuerpo dado y un timestamp. */
export function buildSignatureHeader(
  body: string,
  secret: string,
  tsSeconds: number,
): string {
  const signature = signPayload(body, secret, tsSeconds);
  return `ts=${tsSeconds},v1=${signature}`;
}

/** HMAC-SHA256 hex de `${ts}.${body}` con el secret. */
export function signPayload(
  body: string,
  secret: string,
  tsSeconds: number,
): string {
  return createHmac("sha256", secret)
    .update(`${tsSeconds}.${body}`)
    .digest("hex");
}

/**
 * Verifica una cabecera de firma contra el cuerpo y el secret (lado receptor).
 * Comparación en tiempo constante. Devuelve true solo si v1 coincide.
 * (Expuesto para tests y para receptores que usen nuestra librería.)
 */
export function verifySignatureHeader(
  header: string | null | undefined,
  body: string,
  secret: string,
): boolean {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(
    header.split(",").map((kv) => {
      const idx = kv.indexOf("=");
      return idx === -1
        ? [kv.trim(), ""]
        : [kv.slice(0, idx).trim(), kv.slice(idx + 1).trim()];
    }),
  ) as Record<string, string>;

  const ts = Number(parts.ts);
  const provided = parts.v1;
  if (!Number.isFinite(ts) || !provided) return false;

  const expected = signPayload(body, secret, ts);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

type OutboundWebhookRow = {
  id: string;
  url: string;
  secret: string;
};

/**
 * Despacha un evento a todos los webhooks activos del tenant suscritos a él.
 * Best-effort: nunca lanza. Devuelve un resumen (cuántos se intentaron / ok).
 */
export async function emitWebhookEvent(
  tenantId: string,
  event: WebhookEvent,
  payload: unknown,
): Promise<{ attempted: number; delivered: number }> {
  try {
    const admin = createAdminClient();

    // SCOPING: la API no tiene JWT de tenant; filtramos SIEMPRE por tenant_id.
    // regenerated after db:types — outbound_webhooks no está en los tipos.
    const { data, error } = await (
      admin.from as unknown as (table: string) => {
        select: (cols: string) => {
          eq: (col: string, val: string) => {
            is: (col: string, val: null) => {
              eq: (col: string, val: boolean) => {
                contains: (
                  col: string,
                  val: string[],
                ) => Promise<{
                  data: OutboundWebhookRow[] | null;
                  error: unknown;
                }>;
              };
            };
          };
        };
      }
    )("outbound_webhooks")
      .select("id, url, secret")
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .eq("is_active", true)
      .contains("events", [event]);

    if (error || !data || data.length === 0) {
      return { attempted: 0, delivered: 0 };
    }

    const tsSeconds = Math.floor(Date.now() / 1000);
    const body = JSON.stringify({
      event,
      created_at: new Date(tsSeconds * 1000).toISOString(),
      data: payload,
    });

    let delivered = 0;
    await Promise.all(
      data.map(async (hook) => {
        const status = await deliverOne(hook, body, tsSeconds);
        if (status >= 200 && status < 300) delivered += 1;
        await recordDelivery(admin, hook.id, status);
      }),
    );

    return { attempted: data.length, delivered };
  } catch {
    // Best-effort: jamás propagamos hacia el flujo de negocio.
    return { attempted: 0, delivered: 0 };
  }
}

/** POST firmado con timeout. Devuelve el status HTTP (0 si falló la red). */
async function deliverOne(
  hook: OutboundWebhookRow,
  body: string,
  tsSeconds: number,
): Promise<number> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
  try {
    const res = await fetch(hook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-NinjaFood-Signature": buildSignatureHeader(body, hook.secret, tsSeconds),
      },
      body,
      signal: controller.signal,
    });
    return res.status;
  } catch {
    return 0; // timeout / DNS / conexión: lo registramos como fallo (status 0).
  } finally {
    clearTimeout(timer);
  }
}

/** Actualiza last_delivery_at / last_delivery_status del webhook (best-effort). */
async function recordDelivery(
  admin: ReturnType<typeof createAdminClient>,
  webhookId: string,
  status: number,
): Promise<void> {
  try {
    // regenerated after db:types — outbound_webhooks no está en los tipos.
    await (
      admin.from as unknown as (table: string) => {
        update: (vals: Record<string, unknown>) => {
          eq: (col: string, val: string) => Promise<{ error: unknown }>;
        };
      }
    )("outbound_webhooks")
      .update({
        last_delivery_at: new Date().toISOString(),
        last_delivery_status: status,
      })
      .eq("id", webhookId);
  } catch {
    // ignorado: la entrega ya ocurrió, el registro es secundario.
  }
}
