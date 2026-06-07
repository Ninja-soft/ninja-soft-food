import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireInternal } from "@/modules/internal/server";
import { getBillingProvider, resolvePlanPrice } from "@/lib/billing";
import { getCountryProfile } from "@/lib/globalization/countries";
import type { Database } from "@/types/database";

// =============================================================================
// POST /api/internal/payment-link — genera un link de pago MP para un tenant
// objetivo, operado por staff (no es el flujo self-service de /api/billing).
//
// Diferencia clave con app/api/billing/subscribe: el preapproval es del TENANT
// TARGET, no del staff logueado. Resolvemos owner email + moneda del tenant con
// el admin client (no de la sesión). El estado real lo fija el webhook, NUNCA el
// redirect. Devolvemos init_point para que el staff lo copie/mande al cliente.
// Audita en audit_logs. Regla dura 7: pasarela solo vía lib/billing.
// =============================================================================

export const runtime = "nodejs";

type Cycle = Database["public"]["Enums"]["billing_cycle"];

export async function POST(req: Request) {
  const actor = await requireInternal({ api: true });
  if (!actor) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: { tenantId?: string; planId?: string; cycle?: string };
  try {
    body = (await req.json()) as {
      tenantId?: string;
      planId?: string;
      cycle?: string;
    };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const tenantId = String(body.tenantId ?? "").trim();
  const planId = String(body.planId ?? "").trim();
  const cycle: Cycle = body.cycle === "yearly" ? "yearly" : "monthly";
  if (!tenantId) {
    return NextResponse.json({ error: "missing_tenant" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Suscripción del tenant target (para conocer el plan vigente si no se pasó uno).
  const { data: sub } = await admin
    .from("subscriptions")
    .select("id, plan_id")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!sub) {
    return NextResponse.json(
      { error: "subscription_not_found" },
      { status: 404 },
    );
  }

  // Plan: el indicado por el staff o el vigente de la suscripción.
  const targetPlanId = planId || sub.plan_id;
  const { data: plan } = await admin
    .from("plans")
    .select(
      "id, key, name, monthly_price_ars, yearly_price_ars, monthly_price_usd",
    )
    .eq("id", targetPlanId)
    .eq("is_active", true)
    .maybeSingle();
  if (!plan) {
    return NextResponse.json({ error: "plan_not_found" }, { status: 404 });
  }

  // Moneda del tenant target: operating profile → fallback perfil de país.
  const { data: opProfile } = await admin
    .from("tenant_operating_profiles")
    .select("currency")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  let tenantCurrency = opProfile?.currency ?? "";
  if (!tenantCurrency) {
    const { data: tenantRow } = await admin
      .from("tenants")
      .select("country")
      .eq("id", tenantId)
      .maybeSingle();
    tenantCurrency = getCountryProfile(tenantRow?.country).currency;
  }

  const resolved = resolvePlanPrice(plan, cycle, tenantCurrency);
  if (!resolved) {
    return NextResponse.json(
      { error: "plan_not_self_service" },
      { status: 400 },
    );
  }
  const { amount, currency } = resolved;

  // Email del pagador = owner del tenant target (no el staff).
  const { data: owner } = await admin
    .from("tenant_users")
    .select("users(email)")
    .eq("tenant_id", tenantId)
    .eq("role", "owner")
    .maybeSingle();
  const userRel = (owner as { users?: { email?: string } | { email?: string }[] } | null)
    ?.users;
  const ownerRow = Array.isArray(userRel) ? userRel[0] : userRel;
  const payerEmail = ownerRow?.email;
  if (!payerEmail) {
    return NextResponse.json({ error: "no_owner_email" }, { status: 400 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const provider = getBillingProvider("mercadopago");

  let result;
  try {
    result = await provider.createSubscription({
      tenantId,
      planKey: plan.key,
      planName: plan.name,
      amount,
      currency,
      cycle,
      payerEmail,
      backUrl: `${appUrl}/configuracion?billing=return`,
      notificationUrl: `${appUrl}/api/webhooks/mp`,
    });
  } catch (e) {
    return NextResponse.json(
      { error: "provider_error", detail: e instanceof Error ? e.message : "" },
      { status: 502 },
    );
  }

  // Guardamos plan + preapproval_id; modo automático (lo cobra MP). El estado
  // lo confirma el webhook, NUNCA este handler.
  await admin
    .from("subscriptions")
    .update({
      plan_id: plan.id,
      provider: "mercadopago",
      provider_subscription_id: result.providerSubscriptionId,
      billing_cycle: cycle,
      billing_mode: "automatic",
      cancel_at_period_end: false,
    })
    .eq("id", sub.id);

  await admin.from("audit_logs").insert({
    tenant_id: tenantId,
    actor_user_id: actor.userId,
    entity_type: "subscriptions",
    entity_id: sub.id,
    action: "internal_payment_link_created",
    reason: `Staff Ninja-Soft · link de pago ${plan.key} ${currency} ${amount}`,
    after_data: {
      preapproval_id: result.providerSubscriptionId,
      plan: plan.key,
      cycle,
      amount,
      currency,
      payer_email: payerEmail,
    },
  });

  return NextResponse.json({ init_point: result.initPoint });
}
