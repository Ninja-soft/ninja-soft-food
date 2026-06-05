import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBillingProvider } from "@/lib/billing";

// =============================================================================
// POST /api/billing/cancel — cancela la suscripción del tenant.
//
// Cancela en Mercado Pago (estado cancelled del preapproval) y marca
// cancel_at_period_end. El webhook confirmará el cambio de estado canónico; acá
// dejamos la intención registrada para que el acceso siga hasta el fin del
// período pagado (doc 05 §3: cancelled → lectura 90 días).
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

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("provider, provider_subscription_id")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!sub) {
    return NextResponse.json({ error: "no_subscription" }, { status: 404 });
  }

  // Cancelar en la pasarela (best-effort: si falla, igual marcamos la intención
  // y el job de reconciliación la resuelve).
  if (sub.provider === "mercadopago" && sub.provider_subscription_id) {
    try {
      await getBillingProvider("mercadopago").cancelSubscription(
        sub.provider_subscription_id,
      );
    } catch {
      // Ignorado a propósito: la intención queda registrada abajo.
    }
  }

  const admin = createAdminClient();
  await admin
    .from("subscriptions")
    .update({ cancel_at_period_end: true })
    .eq("tenant_id", tenantId);

  await admin.from("audit_logs").insert({
    tenant_id: tenantId,
    actor_user_id: user.id,
    entity_type: "subscriptions",
    action: "subscription_cancel_requested",
    after_data: { provider_subscription_id: sub.provider_subscription_id },
  });

  return NextResponse.json({ ok: true });
}
