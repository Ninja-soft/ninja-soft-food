import { createAdminClient } from "@/lib/supabase/admin";
import { getBillingProvider } from "@/lib/billing";
import {
  applySubscriptionUpdate,
  isReconciliationExempt,
  reprocessSubscriptionFromProvider,
  statusDiffers,
} from "@/lib/billing/sync";
import { isoHoursAgo } from "@/lib/crons/decisions";

// =============================================================================
// lib/crons/jobs/reconcile-billing — núcleo del job de reconciliación del cobro.
//
// Red de seguridad del webhook de Mercado Pago (regla dura 7: el cobro es la
// fuente de verdad). El webhook puede perder un evento (caída transitoria, retry
// agotado); este job vuelve a alinear el estado local con MP una vez por día.
//
// Dos pasadas, ambas best-effort (un tenant que falla NO corta el resto):
//   1) Por cada subscription mercadopago con provider_subscription_id y status
//      != cancelled → getSubscription en MP → si el status difiere, aplicar el
//      MISMO patch canónico que el webhook (lib/billing/sync).
//   2) Eventos de payment_events sin processed_at de más de 1 h → re-procesar.
//
// Sin autorización ni respuesta HTTP: lo invocan el route handler
// (/api/cron/reconcile-billing, disparo manual) y /api/cron/daily.
// =============================================================================

export type Summary = { processed: number; errors: string[] };

export async function runReconcileBilling(): Promise<Summary> {
  const admin = createAdminClient();
  const provider = getBillingProvider("mercadopago");
  const now = new Date();
  const summary: Summary = { processed: 0, errors: [] };

  // ── Pasada 1: reconciliar cada subscription activa/past_due/trial contra MP ──
  const { data: subs, error: subsErr } = await admin
    .from("subscriptions")
    .select(
      "id, tenant_id, billing_cycle, status, provider_subscription_id, billing_mode, is_lifetime"
    )
    .eq("provider", "mercadopago")
    .not("provider_subscription_id", "is", null)
    .neq("status", "cancelled");

  if (subsErr) {
    summary.errors.push(`subs_query: ${subsErr.message}`);
  }

  for (const sub of subs ?? []) {
    const providerSubId = sub.provider_subscription_id;
    if (!providerSubId) continue;
    // Cortesía / pago manual / vitalicio: las administra el staff, no MP. El job
    // diario jamás las toca (no las marca past_due ni recalcula el período).
    if (isReconciliationExempt(sub)) continue;
    try {
      const info = await provider.getSubscription(providerSubId);
      if (statusDiffers(sub.status, info.status)) {
        await applySubscriptionUpdate(admin, sub, info, now);
        summary.processed += 1;
        console.log(
          `[reconcile] tenant=${sub.tenant_id} ${sub.status} -> ${info.status}`
        );
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      summary.errors.push(`sub:${sub.id}: ${message}`);
    }
  }

  // ── Pasada 2: re-procesar eventos huérfanos (sin processed_at, > 1 h) ────────
  const oneHourAgo = isoHoursAgo(1, now);
  const { data: events, error: eventsErr } = await admin
    .from("payment_events")
    .select("id, payload")
    .eq("provider", "mercadopago")
    .is("processed_at", null)
    .lt("created_at", oneHourAgo)
    .order("created_at", { ascending: true })
    .limit(200);

  if (eventsErr) {
    summary.errors.push(`events_query: ${eventsErr.message}`);
  }

  for (const ev of events ?? []) {
    try {
      const event = provider.parseWebhook({
        searchParams: new URLSearchParams(),
        body: (ev.payload ?? {}) as Record<string, unknown>,
      });
      // Solo re-procesamos suscripciones; pagos individuales se reflejan vía el
      // estado del preapproval en la pasada 1.
      if (event?.resource === "subscription" && event.resourceId) {
        await reprocessSubscriptionFromProvider(admin, event.resourceId, now);
      }
      // Marcar procesado igual: el evento ya no debe reintentarse en cada corrida.
      await admin
        .from("payment_events")
        .update({ processed_at: new Date().toISOString() })
        .eq("id", ev.id);
      summary.processed += 1;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      summary.errors.push(`event:${ev.id}: ${message}`);
    }
  }

  console.log(
    `[reconcile-billing] processed=${summary.processed} errors=${summary.errors.length}`
  );
  return summary;
}
