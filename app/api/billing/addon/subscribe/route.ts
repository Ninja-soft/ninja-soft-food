import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getBillingProvider,
  resolveAddonPrice,
  buildAddonExternalReference,
  AI_ADDON_KEY,
  type AddonPrices,
} from "@/lib/billing";
import { getCountryProfile } from "@/lib/globalization/countries";

// =============================================================================
// POST /api/billing/addon/subscribe — activa el add-on Asistente IA (compra).
//
// Crea un preapproval de Mercado Pago SEPARADO del de la suscripción principal,
// por el monto MENSUAL del add-on (lib/billing/addons.resolveAddonPrice), con
// external_reference `addon:ai:<tenantId>` para que el webhook lo distinga.
//
// REGLA DURA 7: NO crea subscription_addons acá. El webhook es la fuente de
// verdad del cobro: cuando MP confirme (preapproval authorized), el webhook crea
// /activa la fila. Acá solo devolvemos init_point para el redirect al checkout.
// La UI vuelve a /configuracion?addon=pending y muestra "Pago en proceso" hasta
// que el webhook active.
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

  // Solo el owner puede contratar el add-on (paga la suscripción).
  const { data: membership } = await supabase
    .from("tenant_users")
    .select("role")
    .eq("tenant_id", tenantId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (membership?.role !== "owner") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Si ya hay un add-on activo (comprado o regalado) no rehacemos el cobro.
  const { data: existing } = await supabase
    .from("subscription_addons")
    .select("id, source")
    .eq("tenant_id", tenantId)
    .eq("addon_key", AI_ADDON_KEY)
    .eq("status", "active")
    .is("deleted_at", null)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: "already_active" }, { status: 409 });
  }

  // Moneda del tenant: operating profile → país (igual que /subscribe).
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

  // Catálogo del add-on (precio real lo setea staff en /internal/planes).
  const { data: catalog } = await supabase
    .from("plan_addons")
    .select("key, name, description, monthly_price_ars, monthly_price_usd, is_active")
    .eq("key", AI_ADDON_KEY)
    .maybeSingle();
  if (!catalog || !catalog.is_active) {
    return NextResponse.json({ error: "addon_unavailable" }, { status: 404 });
  }

  const resolved = resolveAddonPrice(catalog as AddonPrices, tenantCurrency);
  if (!resolved) {
    // Precio en 0 / no cargado en esa moneda → no autogestionable.
    return NextResponse.json({ error: "addon_not_self_service" }, { status: 400 });
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
      planKey: catalog.key,
      planName: catalog.name,
      amount,
      currency,
      cycle: "monthly", // el add-on suma un cargo mensual a la suscripción.
      payerEmail,
      // CLAVE: external_reference con prefijo addon → el webhook lo separa del
      // preapproval principal (cuyo external_reference es el tenantId pelado).
      externalReference: buildAddonExternalReference(AI_ADDON_KEY, tenantId),
      reason: "Ninja Food — Add-on Asistente IA",
      backUrl: `${appUrl}/configuracion?addon=pending`,
      notificationUrl: `${appUrl}/api/webhooks/mp`,
    });
  } catch (e) {
    return NextResponse.json(
      { error: "provider_error", detail: e instanceof Error ? e.message : "" },
      { status: 502 },
    );
  }

  // Auditoría del checkout iniciado. NO creamos subscription_addons: lo hace el
  // webhook al confirmar el cobro (regla dura 7).
  const admin = createAdminClient();
  await admin.from("audit_logs").insert({
    tenant_id: tenantId,
    actor_user_id: user.id,
    entity_type: "subscription_addons",
    action: "addon_checkout_created",
    after_data: {
      addon_key: AI_ADDON_KEY,
      preapproval_id: result.providerSubscriptionId,
      amount,
      currency,
    },
  });

  return NextResponse.json({ init_point: result.initPoint });
}
