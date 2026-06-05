import { createClient } from "@/lib/supabase/client";
import { getTenantId } from "@/lib/utils/tenant";
import { parsePlanLimits, type PlanLimits } from "@/lib/billing/limits";
import type { Database } from "@/types/database";

// =============================================================================
// modules/billing/api.ts — lectura del estado de suscripción del tenant y
// catálogo de planes. Las mutaciones (suscribir / cancelar) van por los route
// handlers /api/billing/* (la UI nunca toca MP directo).
// =============================================================================

type CanonicalStatus = Database["public"]["Enums"]["tenant_status"];
type BillingCycle = Database["public"]["Enums"]["billing_cycle"];
type ProviderKey = Database["public"]["Enums"]["billing_provider"];

export interface PlanRow {
  id: string;
  key: string;
  name: string;
  monthly_price_ars: number | null;
  yearly_price_ars: number | null;
  limits: PlanLimits;
}

export interface SubscriptionView {
  status: CanonicalStatus;
  billingCycle: BillingCycle;
  provider: ProviderKey;
  providerSubscriptionId: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  plan: PlanRow | null;
  /** Fin del trial del tenant (si aplica). */
  trialEndsAt: string | null;
}

/** Suscripción + plan del tenant de la sesión. */
export async function getMySubscription(): Promise<SubscriptionView | null> {
  const supabase = createClient();
  const tenantId = await getTenantId();

  const [{ data: sub, error: subErr }, { data: tenant, error: tErr }] =
    await Promise.all([
      supabase
        .from("subscriptions")
        .select(
          `status, billing_cycle, provider, provider_subscription_id,
           current_period_start, current_period_end, cancel_at_period_end,
           plan:plans(id, key, name, monthly_price_ars, yearly_price_ars, limits)`,
        )
        .eq("tenant_id", tenantId)
        .maybeSingle(),
      supabase
        .from("tenants")
        .select("trial_ends_at")
        .eq("id", tenantId)
        .maybeSingle(),
    ]);

  if (subErr) throw subErr;
  if (tErr) throw tErr;
  if (!sub) return null;

  const planRaw = sub.plan as
    | {
        id: string;
        key: string;
        name: string;
        monthly_price_ars: number | null;
        yearly_price_ars: number | null;
        limits: Database["public"]["Tables"]["plans"]["Row"]["limits"];
      }
    | null;

  return {
    status: sub.status,
    billingCycle: sub.billing_cycle,
    provider: sub.provider,
    providerSubscriptionId: sub.provider_subscription_id,
    currentPeriodStart: sub.current_period_start,
    currentPeriodEnd: sub.current_period_end,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    trialEndsAt: tenant?.trial_ends_at ?? null,
    plan: planRaw
      ? {
          id: planRaw.id,
          key: planRaw.key,
          name: planRaw.name,
          monthly_price_ars: planRaw.monthly_price_ars,
          yearly_price_ars: planRaw.yearly_price_ars,
          limits: parsePlanLimits(planRaw.limits),
        }
      : null,
  };
}

/** Planes activos para el grid de precios. */
export async function listPlans(): Promise<PlanRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("plans")
    .select("id, key, name, monthly_price_ars, yearly_price_ars, limits")
    .eq("is_active", true)
    .order("monthly_price_ars", { ascending: true, nullsFirst: true });
  if (error) throw error;
  return (data ?? []).map((p) => ({
    id: p.id,
    key: p.key,
    name: p.name,
    monthly_price_ars: p.monthly_price_ars,
    yearly_price_ars: p.yearly_price_ars,
    limits: parsePlanLimits(p.limits),
  }));
}

// ── Mutaciones vía route handlers (la UI nunca habla con la pasarela) ─────────

export async function startCheckout(
  planKey: string,
  cycle: BillingCycle,
): Promise<{ init_point: string }> {
  const res = await fetch("/api/billing/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ planKey, cycle }),
  });
  const json = (await res.json()) as { init_point?: string; error?: string };
  if (!res.ok || !json.init_point) {
    throw new Error(json.error ?? "No se pudo iniciar el pago");
  }
  return { init_point: json.init_point };
}

export async function cancelSubscription(): Promise<void> {
  const res = await fetch("/api/billing/cancel", { method: "POST" });
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(json.error ?? "No se pudo cancelar la suscripción");
  }
}
