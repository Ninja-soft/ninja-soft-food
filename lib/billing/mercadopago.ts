import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  BillingProvider,
  CreateSubscriptionInput,
  CreateSubscriptionResult,
  NormalizedEvent,
  ParseWebhookArgs,
  SubscriptionInfo,
  VerifySignatureArgs,
  CanonicalStatus,
} from "./types";

// =============================================================================
// lib/billing/mercadopago.ts — pasarela Mercado Pago (suscripciones preapproval).
//
// SERVER-ONLY: usa el access token de la cuenta cobradora de NinjaSoft. NUNCA
// importar desde el cliente. (Sin `import "server-only"` a propósito: los tests
// unit de vitest importan este módulo y ese package lanza fuera de react-server.
// La garantía real: solo lo importan route handlers de app/api y node:crypto no
// bundlea a cliente. Por la misma razón, las credenciales efectivas se cargan
// con `import()` dinámico de platform-config — que sí es server-only — para no
// arrastrar `server-only` al grafo estático de este módulo.)
// Patrón calcado del POS (supabase/functions/mp_subscription_checkout +
// mp_billing_webhook): fetch directo a la API de MP (sin SDK), thin-payload →
// re-fetch del recurso, el webhook nunca confía en el body.
//
// Credenciales (access token + webhook secret): se resuelven con prioridad DB
// cifrada (internal_settings, cargadas por staff en /internal) y FALLBACK a las
// env MERCADOPAGO_ACCESS_TOKEN / MERCADOPAGO_WEBHOOK_SECRET. Por eso token() y
// verifySignature son async (los callers ya esperaban estas operaciones).
//
// Agregado respecto del POS: validación de firma x-signature (HMAC-SHA256), que
// el POS no implementa pero la regla dura 7 de Ninja Food exige. Algoritmo de
// MP: manifest "id:<data.id>;request-id:<x-request-id>;ts:<ts>;" firmado con el
// secret de la app; el header x-signature trae "ts=<ts>,v1=<hmac hex>".
// =============================================================================

const MP_API = "https://api.mercadopago.com";

// preapproval.status (MP) → subscriptions.status (canónico tenant_status).
// Mapeos del contrato: authorized→active, paused→paused* , cancelled→cancelled.
// (*) tenant_status no tiene "paused": una suscripción pausada por falta de pago
// equivale a past_due en nuestro ciclo de vida (doc 05 §3). pending = trial.
const PREAPPROVAL_STATUS: Record<string, CanonicalStatus> = {
  authorized: "active",
  paused: "past_due",
  cancelled: "cancelled",
  pending: "trial",
};

export function mapPreapprovalStatus(raw: string): CanonicalStatus | null {
  return PREAPPROVAL_STATUS[raw] ?? null;
}

/**
 * Access token EFECTIVO de la cuenta cobradora: DB cifrada (internal_settings)
 * con fallback a env. Async porque puede leer la DB (cacheado 60s). Import
 * dinámico de platform-config (server-only) para no romper la importabilidad en
 * tests de vitest del resto de este módulo.
 */
async function token(): Promise<string> {
  const { getEffectiveMpCredentials } = await import("./platform-config");
  const { accessToken } = await getEffectiveMpCredentials();
  if (!accessToken) throw new Error("Falta MERCADOPAGO_ACCESS_TOKEN");
  return accessToken;
}

async function authHeaders(): Promise<HeadersInit> {
  return {
    Authorization: `Bearer ${await token()}`,
    "Content-Type": "application/json",
  };
}

/**
 * Verifica la firma x-signature de un webhook de Mercado Pago.
 * Implementación pura (exportada para test): no lee env directamente.
 */
/** Ventana máxima de antigüedad del `ts` firmado (anti-replay). */
const SIGNATURE_MAX_AGE_MS = 15 * 60 * 1000;

export function verifyMpSignature(args: {
  signatureHeader: string | null;
  requestId: string | null;
  dataId: string | null;
  secret: string;
  /** Inyectable para tests; default reloj real. */
  nowMs?: number;
}): boolean {
  const { signatureHeader, requestId, dataId, secret } = args;
  if (!signatureHeader || !secret) return false;

  // x-signature: "ts=1700000000,v1=abcdef..."
  const parts = signatureHeader.split(",");
  let ts: string | null = null;
  let v1: string | null = null;
  for (const part of parts) {
    const [k, v] = part.split("=").map((s) => s?.trim());
    if (k === "ts") ts = v ?? null;
    else if (k === "v1") v1 = v ?? null;
  }
  if (!ts || !v1) return false;

  // Anti-replay: el ts firmado no puede ser más viejo que la ventana (MP lo
  // manda en segundos; toleramos ms por si cambia). La idempotencia por
  // provider_event_id ya mitiga reenvíos, esto cierra la ventana del todo.
  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum)) return false;
  const tsMs = tsNum > 1e12 ? tsNum : tsNum * 1000;
  const now = args.nowMs ?? Date.now();
  if (Math.abs(now - tsMs) > SIGNATURE_MAX_AGE_MS) return false;

  // Manifest según docs MP. data.id en minúsculas si es alfanumérico.
  const idPart = dataId ? `id:${dataId.toLowerCase()};` : "";
  const reqPart = requestId ? `request-id:${requestId};` : "";
  const manifest = `${idPart}${reqPart}ts:${ts};`;

  const expected = createHmac("sha256", secret).update(manifest).digest("hex");

  // Comparación en tiempo constante.
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(v1, "hex");
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}

export const mercadopago: BillingProvider = {
  key: "mercadopago",

  async createSubscription(
    input: CreateSubscriptionInput,
  ): Promise<CreateSubscriptionResult> {
    const yearly = input.cycle === "yearly";
    const amount = Math.round(input.amount * 100) / 100;
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("invalid_plan_price");
    }

    // currency_id viaja como parámetro (resuelto por el caller desde el operating
    // profile del tenant). NO se lee DB acá: este provider es fetch puro.
    // NOTA: Mercado Pago solo opera la moneda LOCAL del país de la cuenta MP
    // (una cuenta MP de Argentina cobra en ARS, una de México en MXN, etc.).
    // Validar que `input.currency` sea compatible con la cuenta MP es
    // responsabilidad del caller; acá solo lo reenviamos tal cual.
    const currencyId = input.currency.trim().toUpperCase();
    if (!currencyId) throw new Error("missing_currency");

    const res = await fetch(`${MP_API}/preapproval`, {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify({
        reason: `Ninja Food — Plan ${input.planName}`.trim(),
        external_reference: input.tenantId,
        payer_email: input.payerEmail,
        auto_recurring: {
          frequency: yearly ? 12 : 1,
          frequency_type: "months",
          transaction_amount: amount,
          currency_id: currencyId,
        },
        back_url: input.backUrl || undefined,
        notification_url: input.notificationUrl,
        status: "pending",
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`mp_error: ${detail.slice(0, 300)}`);
    }
    const pre = (await res.json()) as { id?: string; init_point?: string };
    if (!pre.id || !pre.init_point) throw new Error("mp_no_preapproval");
    return { providerSubscriptionId: pre.id, initPoint: pre.init_point };
  },

  async getSubscription(id: string): Promise<SubscriptionInfo> {
    const res = await fetch(`${MP_API}/preapproval/${id}`, {
      headers: { Authorization: `Bearer ${await token()}` },
    });
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`mp_fetch_error: ${detail.slice(0, 300)}`);
    }
    const pre = (await res.json()) as {
      id?: string;
      status?: string;
      external_reference?: string;
      auto_recurring?: { frequency?: number };
    };
    const rawStatus = pre.status ?? "";
    return {
      providerSubscriptionId: pre.id ?? id,
      status: mapPreapprovalStatus(rawStatus) ?? "trial",
      rawStatus,
      externalReference: pre.external_reference ?? null,
      frequencyMonths: pre.auto_recurring?.frequency ?? null,
    };
  },

  async cancelSubscription(id: string): Promise<void> {
    const res = await fetch(`${MP_API}/preapproval/${id}`, {
      method: "PUT",
      headers: await authHeaders(),
      body: JSON.stringify({ status: "cancelled" }),
    });
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`mp_cancel_error: ${detail.slice(0, 300)}`);
    }
  },

  async verifySignature(args: VerifySignatureArgs): Promise<boolean> {
    // Secret EFECTIVO: DB cifrada (internal_settings) con fallback a env. Import
    // dinámico de platform-config (server-only) para no romper la importabilidad
    // de este módulo en los tests de vitest.
    const { getEffectiveMpCredentials } = await import("./platform-config");
    const { webhookSecret } = await getEffectiveMpCredentials();
    return verifyMpSignature({
      signatureHeader: args.signatureHeader,
      requestId: args.requestId,
      dataId: args.dataId,
      secret: webhookSecret ?? "",
    });
  },

  parseWebhook(args: ParseWebhookArgs): NormalizedEvent | null {
    const { searchParams, body } = args;
    const type =
      (body?.type as string | undefined) ??
      (body?.topic as string | undefined) ??
      searchParams.get("type") ??
      searchParams.get("topic") ??
      "";
    const dataId =
      ((body?.data as { id?: string } | undefined)?.id ?? null) ||
      searchParams.get("data.id") ||
      searchParams.get("id") ||
      null;
    const eventId =
      (body?.id != null ? String(body.id) : null) ??
      searchParams.get("id") ??
      null;

    let resource: NormalizedEvent["resource"] = "unknown";
    if (type.includes("preapproval")) resource = "subscription";
    else if (type.includes("payment")) resource = "payment";

    if (!dataId && !eventId) return null;

    return {
      // Idempotencia: preferimos un id propio del evento; si no hay, componemos
      // uno estable con type + dataId (MP puede mandar el mismo data.id en
      // varias notificaciones de distinto tipo).
      eventId: eventId ?? `${type || "event"}:${dataId}`,
      resource,
      resourceId: dataId,
    };
  },
};
