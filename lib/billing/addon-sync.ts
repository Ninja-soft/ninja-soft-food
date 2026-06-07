import type { createAdminClient } from "@/lib/supabase/admin";
import type { SubscriptionInfo } from "./types";
import type { CanonicalStatus } from "./types";

// =============================================================================
// lib/billing/addon-sync.ts — efecto de borde del webhook para add-ons.
//
// Cuando MP confirma un preapproval cuyo external_reference es de add-on
// (addon:<key>:<tenantId>), el webhook re-fetchea el recurso y aplica el estado
// acá. El add-on vive en subscription_addons (source 'purchase'): se crea/activa
// cuando el preapproval pasa a authorized (=> canónico 'active') y se cancela
// cuando el preapproval cae a cancelled.
//
// REGLA DURA 7: el webhook es la fuente de verdad. La fila NO se crea optimista
// en el subscribe; se materializa acá, al confirmar el cobro. Idempotente: el
// unique parcial (tenant, addon) where active garantiza un solo activo y los
// upserts/updates son convergentes (re-procesar el mismo evento no duplica).
//
// SERVER-ONLY de hecho: recibe el admin client como parámetro, no lo crea.
// =============================================================================

type AdminClient = ReturnType<typeof createAdminClient>;

/** ¿El estado canónico del preapproval implica que el add-on está activo? */
function isActiveStatus(status: CanonicalStatus): boolean {
  return status === "active";
}

/** ¿El estado canónico implica que el add-on quedó cancelado? */
function isCancelledStatus(status: CanonicalStatus): boolean {
  return status === "cancelled";
}

export interface ApplyAddonResult {
  action: "activated" | "cancelled" | "noop";
}

/**
 * Aplica el estado de un preapproval de add-on a subscription_addons.
 *
 * @param addonKey  key del add-on (ej. 'ai') parseado del external_reference.
 * @param tenantId  tenant dueño del add-on (parseado del external_reference).
 * @param info      estado YA mapeado a canónico (re-fetch del recurso en MP).
 *
 * - authorized (active): asegura una fila activa source 'purchase' con el
 *   preapproval. Si ya hay una activa, solo actualiza el preapproval_id (idempotente).
 * - cancelled: marca cancelled + deleted_at la fila de ese preapproval.
 * - otro estado (pending/past_due): noop (esperamos la confirmación final).
 */
export async function applyAddonUpdate(
  admin: AdminClient,
  addonKey: string,
  tenantId: string,
  info: SubscriptionInfo,
): Promise<ApplyAddonResult> {
  const preapprovalId = info.providerSubscriptionId;

  if (isActiveStatus(info.status)) {
    // ¿Ya hay un add-on activo para este tenant+key?
    const { data: active } = await admin
      .from("subscription_addons")
      .select("id, provider_subscription_id, source")
      .eq("tenant_id", tenantId)
      .eq("addon_key", addonKey)
      .eq("status", "active")
      .is("deleted_at", null)
      .maybeSingle();

    if (active) {
      // Idempotente: si ya está activo, solo aseguramos el preapproval_id (por si
      // se activó por cortesía y ahora el tenant lo compró, o re-procesamiento).
      if (active.provider_subscription_id !== preapprovalId) {
        await admin
          .from("subscription_addons")
          .update({ provider_subscription_id: preapprovalId })
          .eq("id", active.id);
      }
      return { action: "noop" };
    }

    // Subscription del tenant para enlazar (puede no existir aún).
    const { data: sub } = await admin
      .from("subscriptions")
      .select("id")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    await admin.from("subscription_addons").insert({
      tenant_id: tenantId,
      subscription_id: sub?.id ?? null,
      addon_key: addonKey,
      status: "active",
      source: "purchase",
      provider_subscription_id: preapprovalId,
    });

    await admin.from("audit_logs").insert({
      tenant_id: tenantId,
      actor_user_id: null,
      entity_type: "subscription_addons",
      action: "addon_activated_by_webhook",
      reason: "Mercado Pago · preapproval de add-on autorizado",
      after_data: {
        addon_key: addonKey,
        source: "purchase",
        provider_subscription_id: preapprovalId,
      },
    });

    return { action: "activated" };
  }

  if (isCancelledStatus(info.status)) {
    const { data: row } = await admin
      .from("subscription_addons")
      .select("id, status")
      .eq("tenant_id", tenantId)
      .eq("addon_key", addonKey)
      .eq("provider_subscription_id", preapprovalId)
      .eq("status", "active")
      .is("deleted_at", null)
      .maybeSingle();

    if (!row) return { action: "noop" };

    await admin
      .from("subscription_addons")
      .update({ status: "cancelled", deleted_at: new Date().toISOString() })
      .eq("id", row.id);

    await admin.from("audit_logs").insert({
      tenant_id: tenantId,
      actor_user_id: null,
      entity_type: "subscription_addons",
      entity_id: row.id,
      action: "addon_cancelled_by_webhook",
      reason: "Mercado Pago · preapproval de add-on cancelado",
      before_data: { status: "active" },
      after_data: { status: "cancelled" },
    });

    return { action: "cancelled" };
  }

  // pending / past_due u otros: esperamos confirmación definitiva.
  return { action: "noop" };
}
