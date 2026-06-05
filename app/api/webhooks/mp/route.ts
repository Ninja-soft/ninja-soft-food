import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBillingProvider } from "@/lib/billing";
import { sendSystemEmail } from "@/lib/emails/enqueue";
import type { Database } from "@/types/database";

// =============================================================================
// app/api/webhooks/mp/route.ts — webhook de Mercado Pago (suscripciones).
//
// Fuente de verdad del cobro (regla dura 7). Patrón calcado del POS
// (mp_billing_webhook): no confía en el body → re-fetch del recurso real en MP.
// Agregado: validación de firma x-signature (401 si inválida) e idempotencia
// estricta vía payment_events.provider_event_id (unique en migración 0001).
//
// Flujo: verificar firma → INSERT idempotente en payment_events → 200 rápido →
// re-fetch del recurso → update subscriptions → marcar processed_at.
// Responde 200 siempre que la firma sea válida (aunque el evento no aplique)
// para que MP no reintente en loop. 401 solo si la firma es inválida.
// =============================================================================

export const runtime = "nodejs"; // crypto HMAC + service role: nunca edge/cliente.

type SubscriptionUpdate = Database["public"]["Tables"]["subscriptions"]["Update"];

function ok() {
  return NextResponse.json({ ok: true }, { status: 200 });
}

export async function POST(req: Request) {
  const provider = getBillingProvider("mercadopago");
  const url = new URL(req.url);

  // Body: thin payload. Puede venir vacío o no-JSON.
  let body: Record<string, unknown> | null = null;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    body = null;
  }

  // 1) Firma. MP firma id (= data.id del query string) + x-request-id + ts con
  // el webhook secret. Para el manifest usamos data.id del query (lo que MP
  // firma); el body se usa después para identificar el recurso.
  const signatureDataId =
    url.searchParams.get("data.id") || url.searchParams.get("id");
  const signatureOk = provider.verifySignature({
    signatureHeader: req.headers.get("x-signature"),
    requestId: req.headers.get("x-request-id"),
    dataId: signatureDataId,
  });
  if (!signatureOk) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  // 2) Normalizar el evento.
  const event = provider.parseWebhook({ searchParams: url.searchParams, body });
  if (!event || !event.resourceId) return ok();

  const admin = createAdminClient();

  // 3) Idempotencia: INSERT en payment_events. Si ya existe (unique provider +
  // provider_event_id), el evento ya se procesó → 200 y salir.
  const { data: inserted, error: insertError } = await admin
    .from("payment_events")
    .insert({
      provider: "mercadopago",
      provider_event_id: event.eventId,
      payload: (body ?? {}) as Database["public"]["Tables"]["payment_events"]["Insert"]["payload"],
    })
    .select("id")
    .maybeSingle();

  if (insertError) {
    // 23505 = unique_violation → ya procesado (idempotente). Cualquier otro
    // error: respondemos 200 igual para no gatillar reintentos infinitos; el
    // job de reconciliación corregirá el estado.
    return ok();
  }
  const eventRowId = inserted?.id ?? null;

  try {
    // Solo procesamos suscripciones (preapproval). Los pagos individuales
    // (subscription_authorized_payment / payments) extienden el período vía el
    // estado del preapproval en la reconciliación; acá registramos el evento.
    if (event.resource !== "subscription") {
      await markProcessed(admin, eventRowId);
      return ok();
    }

    // 4) Re-fetch del recurso real (NO confiar en el body).
    const info = await provider.getSubscription(event.resourceId);

    // Match por external_reference (= tenant_id) o por provider_subscription_id.
    const matchTenant = info.externalReference;
    let query = admin
      .from("subscriptions")
      .select("id, tenant_id, billing_cycle")
      .eq("provider", "mercadopago");
    query = matchTenant
      ? query.eq("tenant_id", matchTenant)
      : query.eq("provider_subscription_id", info.providerSubscriptionId);
    const { data: sub } = await query.maybeSingle();

    if (!sub) {
      // Aún no hay subscription con provider mercadopago (puede ser una creada
      // como manual durante el trial). Buscamos por tenant sin filtrar provider.
      if (matchTenant) {
        const { data: trialSub } = await admin
          .from("subscriptions")
          .select("id, tenant_id, billing_cycle")
          .eq("tenant_id", matchTenant)
          .maybeSingle();
        if (trialSub) {
          await applySubscriptionUpdate(admin, trialSub, info);
        }
      }
      await markProcessed(admin, eventRowId);
      return ok();
    }

    await applySubscriptionUpdate(admin, sub, info);
    await markProcessed(admin, eventRowId);
    return ok();
  } catch {
    // No marcamos processed_at: la reconciliación reintentará. 200 igual.
    return ok();
  }
}

async function applySubscriptionUpdate(
  admin: ReturnType<typeof createAdminClient>,
  sub: { id: string; tenant_id: string; billing_cycle: string },
  info: Awaited<ReturnType<ReturnType<typeof getBillingProvider>["getSubscription"]>>,
) {
  const patch: SubscriptionUpdate = {
    provider: "mercadopago",
    provider_subscription_id: info.providerSubscriptionId,
    status: info.status,
  };

  if (info.status === "active") {
    const months = info.frequencyMonths ?? (sub.billing_cycle === "yearly" ? 12 : 1);
    const start = new Date();
    const end = new Date(start);
    end.setMonth(end.getMonth() + months);
    patch.current_period_start = start.toISOString();
    patch.current_period_end = end.toISOString();
    patch.cancel_at_period_end = false;
    patch.billing_cycle = months >= 12 ? "yearly" : "monthly";
  }

  await admin.from("subscriptions").update(patch).eq("id", sub.id);

  // Sincronizamos el estado canónico también en tenants.status (consistencia
  // con el ciclo de vida del POS).
  await admin.from("tenants").update({ status: info.status }).eq("id", sub.tenant_id);

  // Aviso de pago al owner cuando el cobro deja de estar al día. Best-effort:
  // un email caído NO afecta el procesamiento del webhook (regla dura).
  if (info.status === "past_due" || info.status === "cancelled") {
    await notifyOwnerPaymentFailed(admin, sub.tenant_id);
  }
}

/** Encola payment_failed al owner del tenant (best-effort, no lanza). */
async function notifyOwnerPaymentFailed(
  admin: ReturnType<typeof createAdminClient>,
  tenantId: string,
) {
  try {
    const { data: owner } = await admin
      .from("tenant_users")
      .select("user_id, users(email)")
      .eq("tenant_id", tenantId)
      .eq("role", "owner")
      .maybeSingle();
    const userRel = (owner as { users?: { email?: string } | { email?: string }[] } | null)
      ?.users;
    const ownerRow = Array.isArray(userRel) ? userRel[0] : userRel;
    const email = ownerRow?.email;
    if (!email) return;

    const { data: tenant } = await admin
      .from("tenants")
      .select("name")
      .eq("id", tenantId)
      .maybeSingle();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

    await sendSystemEmail({
      tenantId,
      templateKey: "payment_failed",
      to: email,
      variables: {
        negocio: tenant?.name ?? "tu cuenta",
        plan: "",
        monto: "",
        link: `${appUrl}/configuracion`,
      },
    });
  } catch (e) {
    console.warn("[emails] no se pudo avisar el pago al owner:", e);
  }
}

async function markProcessed(
  admin: ReturnType<typeof createAdminClient>,
  eventRowId: string | null,
) {
  if (!eventRowId) return;
  await admin
    .from("payment_events")
    .update({ processed_at: new Date().toISOString() })
    .eq("id", eventRowId);
}
