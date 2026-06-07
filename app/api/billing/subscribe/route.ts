import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBillingProvider, resolvePlanPrice } from "@/lib/billing";
import { getCountryProfile } from "@/lib/globalization/countries";
import type { Database } from "@/types/database";

// =============================================================================
// POST /api/billing/subscribe — inicia una suscripción de Mercado Pago.
//
// La UI NUNCA toca MP directo: llama acá. Resuelve el tenant de la sesión,
// valida que el usuario sea owner, crea el preapproval con la pasarela y
// devuelve init_point para el redirect. El estado real lo confirma el webhook,
// NUNCA el redirect.
// =============================================================================

export const runtime = "nodejs";

type Cycle = Database["public"]["Enums"]["billing_cycle"];

export async function POST(req: Request) {
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

  let body: { planKey?: string; cycle?: string };
  try {
    body = (await req.json()) as { planKey?: string; cycle?: string };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const planKey = String(body.planKey ?? "").trim();
  const cycle: Cycle = body.cycle === "yearly" ? "yearly" : "monthly";
  if (!planKey) {
    return NextResponse.json({ error: "missing_plan" }, { status: 400 });
  }

  // Solo el owner puede cambiar el plan / suscribir.
  const { data: membership } = await supabase
    .from("tenant_users")
    .select("role")
    .eq("tenant_id", tenantId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (membership?.role !== "owner") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Moneda del tenant: la resuelve el operating profile (perfil global). Si el
  // perfil no está cargado, caemos al perfil de país del tenant (lib/globalization).
  // El provider de billing NO lee DB: la moneda viaja como parámetro ya resuelto.
  const { data: opProfile } = await supabase
    .from("tenant_operating_profiles")
    .select("currency")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  let tenantCurrency = opProfile?.currency ?? "";
  if (!tenantCurrency) {
    const { data: tenantRow } = await supabase
      .from("tenants")
      .select("country")
      .eq("id", tenantId)
      .maybeSingle();
    tenantCurrency = getCountryProfile(tenantRow?.country).currency;
  }

  // Plan + precio. Enterprise es "a medida": no se cobra self-service.
  const { data: plan } = await supabase
    .from("plans")
    .select(
      "id, key, name, monthly_price_ars, yearly_price_ars, monthly_price_usd",
    )
    .eq("key", planKey)
    .eq("is_active", true)
    .maybeSingle();
  if (!plan) {
    return NextResponse.json({ error: "plan_not_found" }, { status: 404 });
  }

  // Resolución pura: moneda + monto según la moneda del tenant (ARS → precio
  // ARS, otra → precio USD como fallback documentado hasta Fase 5).
  const resolved = resolvePlanPrice(plan, cycle, tenantCurrency);
  if (!resolved) {
    return NextResponse.json(
      { error: "plan_not_self_service" },
      { status: 400 },
    );
  }
  const { amount, currency } = resolved;

  const payerEmail = user.email;
  if (!payerEmail) {
    return NextResponse.json({ error: "no_payer_email" }, { status: 400 });
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
      // El webhook (route.ts) vive en la app, no en Supabase. MP llama acá.
      notificationUrl: `${appUrl}/api/webhooks/mp`,
    });
  } catch (e) {
    return NextResponse.json(
      { error: "provider_error", detail: e instanceof Error ? e.message : "" },
      { status: 502 },
    );
  }

  // Guardamos el plan elegido + el preapproval_id (estado lo fija el webhook).
  // Usamos admin: la fila de subscriptions no tiene política de UPDATE para
  // authenticated (solo service_role).
  const admin = createAdminClient();
  await admin
    .from("subscriptions")
    .update({
      plan_id: plan.id,
      provider: "mercadopago",
      provider_subscription_id: result.providerSubscriptionId,
      billing_cycle: cycle,
      cancel_at_period_end: false,
    })
    .eq("tenant_id", tenantId);

  await admin.from("audit_logs").insert({
    tenant_id: tenantId,
    actor_user_id: user.id,
    entity_type: "subscriptions",
    action: "subscription_checkout_created",
    after_data: {
      preapproval_id: result.providerSubscriptionId,
      plan: plan.key,
      cycle,
      amount,
      currency,
    },
  });

  return NextResponse.json({ init_point: result.initPoint });
}
