import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBillingProvider, parseAddonExternalReference } from "@/lib/billing";
import { applySubscriptionUpdate } from "@/lib/billing/sync";
import { applyAddonUpdate } from "@/lib/billing/addon-sync";
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
  const signatureOk = await provider.verifySignature({
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
      payload: (body ??
        {}) as Database["public"]["Tables"]["payment_events"]["Insert"]["payload"],
    })
    .select("id")
    .maybeSingle();

  if (insertError) {
    // 23505 = unique_violation → evento ya registrado (idempotente): 200.
    if (insertError.code === "23505") return ok();
    // Error transitorio de DB: 500 para que MP REINTENTE el webhook. La
    // reconciliación diaria (app/api/cron/reconcile-billing) es la red de
    // seguridad si igual se pierde.
    return NextResponse.json({ error: "transient" }, { status: 500 });
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

    // 4.bis) ¿Es un preapproval de ADD-ON? El external_reference de un add-on
    // tiene prefijo (addon:<key>:<tenantId>); el de la suscripción principal es
    // el tenantId pelado. Si parsea como add-on, lo procesa el sync de add-ons y
    // NUNCA toca subscriptions (son cobros independientes).
    const addonRef = parseAddonExternalReference(info.externalReference);
    if (addonRef) {
      await applyAddonUpdate(admin, addonRef.addonKey, addonRef.tenantId, info);
      await markProcessed(admin, eventRowId);
      return ok();
    }

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

async function markProcessed(
  admin: ReturnType<typeof createAdminClient>,
  eventRowId: string | null
) {
  if (!eventRowId) return;
  await admin
    .from("payment_events")
    .update({ processed_at: new Date().toISOString() })
    .eq("id", eventRowId);
}
