import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { planLimitsIncludeAI } from "@/lib/ai/access";
import { resolveAddonPrice, type AddonPrices } from "./addons";
import { getCountryProfile } from "@/lib/globalization/countries";
import type { Json } from "@/types/database";

// =============================================================================
// lib/billing/addon-status.ts — estado del add-on IA de un tenant (server-side).
//
// Reúne las tres señales que la card "Asistente IA" del tenant necesita:
//   - included: el plan del tenant trae IA (limits.ai_included).
//   - addon:    el subscription_addons activo (source + si tiene preapproval).
//   - price:    precio del add-on en la moneda del tenant (operating profile →
//               país), resuelto con la misma regla de fallback que pricing.ts.
//
// La derivación PURA del estado de la card (incluyendo el flag pending del
// redirect) vive en lib/billing/addons.deriveAddonCardState; acá solo juntamos
// los datos. SERVER-ONLY: admin client (cruza plans/subscriptions/plan_addons).
// =============================================================================

const AI_ADDON_KEY = "ai";

export interface TenantAddonStatus {
  /** El plan del tenant incluye IA (no se vende aparte). */
  included: boolean;
  /** Add-on activo (comprado o regalado). */
  addonActive: boolean;
  /** Fuente del add-on activo: purchase | granted | included | null. */
  addonSource: string | null;
  /** ¿El add-on activo tiene un preapproval de MP que cancelar? */
  hasPreapproval: boolean;
  /** Precio mensual del add-on en la moneda del tenant (null = no cobrable). */
  price: { currency: string; amount: number } | null;
  /** Descripción comercial del add-on (catálogo). */
  description: string | null;
}

/**
 * Resuelve el estado del add-on IA del tenant. NUNCA lanza: ante cualquier fallo
 * devuelve el estado más conservador (sin acceso, sin precio) para no romper la
 * card. El flag `pending` del redirect lo aporta el cliente (query param), no
 * esta función.
 */
export async function getTenantAddonStatus(
  tenantId: string,
): Promise<TenantAddonStatus> {
  const fallback: TenantAddonStatus = {
    included: false,
    addonActive: false,
    addonSource: null,
    hasPreapproval: false,
    price: null,
    description: null,
  };
  if (!tenantId) return fallback;

  const admin = createAdminClient();

  // (a) Plan incluye IA + moneda del tenant (operating profile → país).
  let included = false;
  let currency = "";
  try {
    const { data: sub } = await admin
      .from("subscriptions")
      .select("plan:plans(limits)")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    const plan = sub?.plan as { limits?: Json } | { limits?: Json }[] | null;
    const limits = Array.isArray(plan) ? plan[0]?.limits : plan?.limits;
    included = planLimitsIncludeAI(limits ?? null);
  } catch {
    // sigue
  }

  try {
    const { data: op } = await admin
      .from("tenant_operating_profiles")
      .select("currency")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    currency = op?.currency ?? "";
  } catch {
    // sigue
  }
  if (!currency) {
    try {
      const { data: tenant } = await admin
        .from("tenants")
        .select("country")
        .eq("id", tenantId)
        .maybeSingle();
      currency = getCountryProfile(tenant?.country).currency;
    } catch {
      currency = getCountryProfile(null).currency;
    }
  }

  // (b) Add-on activo: source + preapproval.
  let addonActive = false;
  let addonSource: string | null = null;
  let hasPreapproval = false;
  try {
    const { data: addon } = await admin
      .from("subscription_addons")
      .select("source, provider_subscription_id")
      .eq("tenant_id", tenantId)
      .eq("addon_key", AI_ADDON_KEY)
      .eq("status", "active")
      .is("deleted_at", null)
      .maybeSingle();
    if (addon) {
      addonActive = true;
      addonSource = addon.source;
      hasPreapproval = Boolean(addon.provider_subscription_id);
    }
  } catch {
    // sigue
  }

  // (c) Precio del catálogo en la moneda del tenant.
  let price: { currency: string; amount: number } | null = null;
  let description: string | null = null;
  try {
    const { data: catalog } = await admin
      .from("plan_addons")
      .select("monthly_price_ars, monthly_price_usd, description, is_active")
      .eq("key", AI_ADDON_KEY)
      .maybeSingle();
    if (catalog) {
      description = catalog.description ?? null;
      if (catalog.is_active) {
        price = resolveAddonPrice(catalog as AddonPrices, currency);
      }
    }
  } catch {
    // sigue
  }

  return {
    included,
    addonActive,
    addonSource,
    hasPreapproval,
    price,
    description,
  };
}
