import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBillingProvider, AI_ADDON_KEY } from "@/lib/billing";

// =============================================================================
// POST /api/billing/addon/cancel — el tenant cancela su add-on Asistente IA.
//
// Si el add-on es comprado (source 'purchase') y tiene un preapproval de MP,
// lo cancela en la pasarela vía lib/billing (best-effort: si falla, igual
// marcamos la intención y el job de reconciliación / un reintento lo resuelve).
// Luego marca subscription_addons cancelled + deleted_at (libera el unique
// parcial). Solo el owner cancela. Audita before/after.
// =============================================================================

export const runtime = "nodejs";

export async function POST() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const tenantId = (user.app_metadata as { tenant_id?: string })?.tenant_id;
  if (!tenantId) {
    return NextResponse.json({ error: "no_tenant" }, { status: 400 });
  }

  const { data: membership } = await supabase
    .from("tenant_users")
    .select("role")
    .eq("tenant_id", tenantId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (membership?.role !== "owner") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Add-on activo del tenant (admin: la tabla no tiene policy de UPDATE para
  // authenticated; la lectura sí se podría con el cliente, pero unificamos).
  const admin = createAdminClient();
  const { data: addon } = await admin
    .from("subscription_addons")
    .select("id, status, source, provider_subscription_id")
    .eq("tenant_id", tenantId)
    .eq("addon_key", AI_ADDON_KEY)
    .eq("status", "active")
    .is("deleted_at", null)
    .maybeSingle();

  if (!addon) {
    return NextResponse.json({ ok: true, alreadyInactive: true });
  }

  // Cancelar el preapproval en MP si el add-on es comprado y lo tiene.
  if (addon.source === "purchase" && addon.provider_subscription_id) {
    try {
      await getBillingProvider("mercadopago").cancelSubscription(
        addon.provider_subscription_id,
      );
    } catch {
      // Best-effort: la intención queda registrada abajo.
    }
  }

  const { error } = await admin
    .from("subscription_addons")
    .update({ status: "cancelled", deleted_at: new Date().toISOString() })
    .eq("id", addon.id);
  if (error) {
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }

  await admin.from("audit_logs").insert({
    tenant_id: tenantId,
    actor_user_id: user.id,
    entity_type: "subscription_addons",
    entity_id: addon.id,
    action: "addon_cancel_requested",
    reason: "Tenant · add-on Asistente IA cancelado",
    before_data: {
      status: addon.status,
      source: addon.source,
      provider_subscription_id: addon.provider_subscription_id,
    },
    after_data: { status: "cancelled" },
  });

  return NextResponse.json({ ok: true });
}
