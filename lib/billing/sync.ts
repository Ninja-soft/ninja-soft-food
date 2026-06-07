import type { createAdminClient } from "@/lib/supabase/admin";
import { getBillingProvider } from "@/lib/billing";
import { sendSystemEmail } from "@/lib/emails/enqueue";
import type { SubscriptionInfo } from "./types";
import {
  buildSubscriptionPatch,
  isReconciliationExempt,
  statusDiffers,
  type SubscriptionRowForSync,
} from "./sync-decisions";

// =============================================================================
// lib/billing/sync.ts — efectos de borde de la sincronización de suscripciones.
//
// El estado canónico del cobro vive en subscriptions.status (regla dura 7). Tanto
// el webhook de Mercado Pago (fuente de verdad en tiempo real) como el job de
// reconciliación diaria (red de seguridad) aplican EXACTAMENTE el mismo patch.
// Para no duplicar esa lógica ni divergir, el patch se decide en una función pura
// compartida (sync-decisions: buildSubscriptionPatch / statusDiffers) y acá viven
// los efectos de borde: escribir subscriptions + tenants y avisar al owner.
//
// SERVER-ONLY: recibe el admin client (service_role) como parámetro; no lo crea
// por su cuenta. Importa enqueue (server-only) → no lo importar desde tests; las
// piezas testeables están en sync-decisions.ts.
// =============================================================================

type AdminClient = ReturnType<typeof createAdminClient>;

// Re-exporta las decisiones puras para que los consumidores tengan un único punto
// de entrada (el webhook y el cron importan desde "@/lib/billing/sync").
export {
  buildSubscriptionPatch,
  isReconciliationExempt,
  statusDiffers,
  type SubscriptionRowForSync,
};

/**
 * Aplica el patch canónico: escribe subscriptions, sincroniza tenants.status y
 * avisa al owner si el cobro dejó de estar al día. Efecto de borde compartido por
 * el webhook y la reconciliación. Best-effort en el aviso (un email caído no
 * aborta la actualización; regla dura de emails).
 */
export async function applySubscriptionUpdate(
  admin: AdminClient,
  sub: SubscriptionRowForSync,
  info: SubscriptionInfo,
  now: Date = new Date()
): Promise<void> {
  // Guard de cortesía / vitalicio (regla dura 7 + 0014): una suscripción comp,
  // manual o lifetime NUNCA se degrada por el estado de la pasarela. El cron ya
  // las filtra, pero acá lo reforzamos por si otro caller (webhook) llega con una.
  if (isReconciliationExempt(sub)) return;

  const patch = buildSubscriptionPatch(sub, info, now);

  await admin.from("subscriptions").update(patch).eq("id", sub.id);

  // Sincronizamos el estado canónico también en tenants.status (consistencia con
  // el ciclo de vida del POS).
  await admin
    .from("tenants")
    .update({ status: info.status })
    .eq("id", sub.tenant_id);

  // Aviso de pago al owner cuando el cobro deja de estar al día. Best-effort.
  if (info.status === "past_due" || info.status === "cancelled") {
    await notifyOwnerPaymentFailed(admin, sub.tenant_id);
  }
}

/** Encola payment_failed al owner del tenant (best-effort, no lanza). */
export async function notifyOwnerPaymentFailed(
  admin: AdminClient,
  tenantId: string
): Promise<void> {
  try {
    const { data: owner } = await admin
      .from("tenant_users")
      .select("user_id, users(email)")
      .eq("tenant_id", tenantId)
      .eq("role", "owner")
      .maybeSingle();
    const userRel = (
      owner as { users?: { email?: string } | { email?: string }[] } | null
    )?.users;
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

/**
 * Re-procesa un único evento de payment_events vía el flujo canónico: re-fetch del
 * recurso en la pasarela y, si corresponde, aplica el patch. Usado por la
 * reconciliación para eventos que quedaron sin processed_at (webhook a medias).
 * Best-effort: devuelve true si lo aplicó, false si no aplicaba.
 */
export async function reprocessSubscriptionFromProvider(
  admin: AdminClient,
  providerSubscriptionId: string,
  now: Date = new Date()
): Promise<boolean> {
  const provider = getBillingProvider("mercadopago");
  const info = await provider.getSubscription(providerSubscriptionId);

  const matchTenant = info.externalReference;
  let query = admin
    .from("subscriptions")
    .select("id, tenant_id, billing_cycle, status, billing_mode, is_lifetime")
    .eq("provider", "mercadopago");
  query = matchTenant
    ? query.eq("tenant_id", matchTenant)
    : query.eq("provider_subscription_id", info.providerSubscriptionId);
  let { data: sub } = await query.maybeSingle();

  if (!sub && matchTenant) {
    // Suscripción creada como manual durante el trial (provider != mercadopago).
    const { data: trialSub } = await admin
      .from("subscriptions")
      .select("id, tenant_id, billing_cycle, status, billing_mode, is_lifetime")
      .eq("tenant_id", matchTenant)
      .maybeSingle();
    sub = trialSub;
  }

  if (!sub) return false;

  await applySubscriptionUpdate(admin, sub, info, now);
  return true;
}
