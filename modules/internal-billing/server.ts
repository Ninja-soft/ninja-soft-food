import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireInternal } from "@/modules/internal/server";
import type { Database } from "@/types/database";

// =============================================================================
// modules/internal-billing/server — lectura de la operación de cobros del panel
// staff (ficha del tenant). Todo usa admin client (service_role) porque las
// tablas de 0014 (manual_payments, internal_notes) no tienen policy legible por
// el navegador, y subscriptions/subscription_addons/tenant_flags se cruzan acá
// con datos sensibles. Defensa en profundidad: cada lector re-verifica
// requireInternal() además del guard del layout. NUNCA importar desde cliente.
// =============================================================================

async function assertInternal() {
  if (!(await requireInternal({ api: true }))) throw new Error("forbidden");
}

// ── Detalle de cobros del tenant (para la card "Suscripción y cobros") ───────

export interface BillingDetail {
  subscription: {
    id: string;
    status: Database["public"]["Enums"]["tenant_status"];
    billingMode: string;
    isLifetime: boolean;
    billingCycle: Database["public"]["Enums"]["billing_cycle"];
    provider: Database["public"]["Enums"]["billing_provider"];
    providerSubscriptionId: string | null;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    planId: string;
    planKey: string | null;
    planName: string | null;
    monthlyPriceArs: number | null;
  } | null;
  manualPayments: ManualPaymentRow[];
  aiAddon: AddonRow | null;
}

export interface ManualPaymentRow {
  id: string;
  amount: number;
  currency: string;
  method: string;
  reference: string | null;
  paidAt: string;
  periodMonths: number;
  notes: string | null;
  createdAt: string;
}

export interface AddonRow {
  id: string;
  addonKey: string;
  status: string;
  source: string;
  createdAt: string;
}

export async function getBillingDetail(
  tenantId: string,
): Promise<BillingDetail> {
  await assertInternal();
  const admin = createAdminClient();

  const [subRes, paymentsRes, addonRes] = await Promise.all([
    admin
      .from("subscriptions")
      .select(
        "id, status, billing_mode, is_lifetime, billing_cycle, provider, provider_subscription_id, current_period_start, current_period_end, cancel_at_period_end, plan_id, plans(key, name, monthly_price_ars)",
      )
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    admin
      .from("manual_payments")
      .select(
        "id, amount, currency, method, reference, paid_at, period_months, notes, created_at",
      )
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .order("paid_at", { ascending: false })
      .limit(50),
    admin
      .from("subscription_addons")
      .select("id, addon_key, status, source, created_at")
      .eq("tenant_id", tenantId)
      .eq("addon_key", "ai")
      .is("deleted_at", null)
      .eq("status", "active")
      .maybeSingle(),
  ]);

  type SubResult = {
    id: string;
    status: Database["public"]["Enums"]["tenant_status"];
    billing_mode: string;
    is_lifetime: boolean;
    billing_cycle: Database["public"]["Enums"]["billing_cycle"];
    provider: Database["public"]["Enums"]["billing_provider"];
    provider_subscription_id: string | null;
    current_period_start: string | null;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
    plan_id: string;
    plans: { key: string; name: string; monthly_price_ars: number | null } | null;
  };
  const s = subRes.data as unknown as SubResult | null;

  return {
    subscription: s
      ? {
          id: s.id,
          status: s.status,
          billingMode: s.billing_mode,
          isLifetime: s.is_lifetime,
          billingCycle: s.billing_cycle,
          provider: s.provider,
          providerSubscriptionId: s.provider_subscription_id,
          currentPeriodStart: s.current_period_start,
          currentPeriodEnd: s.current_period_end,
          cancelAtPeriodEnd: s.cancel_at_period_end,
          planId: s.plan_id,
          planKey: s.plans?.key ?? null,
          planName: s.plans?.name ?? null,
          monthlyPriceArs: s.plans?.monthly_price_ars ?? null,
        }
      : null,
    manualPayments: (paymentsRes.data ?? []).map((p) => ({
      id: p.id,
      amount: Number(p.amount),
      currency: p.currency,
      method: p.method,
      reference: p.reference,
      paidAt: p.paid_at,
      periodMonths: p.period_months,
      notes: p.notes,
      createdAt: p.created_at,
    })),
    aiAddon: addonRes.data
      ? {
          id: addonRes.data.id,
          addonKey: addonRes.data.addon_key,
          status: addonRes.data.status,
          source: addonRes.data.source,
          createdAt: addonRes.data.created_at,
        }
      : null,
  };
}

// ── Notas internas del tenant ────────────────────────────────────────────────

export interface InternalNoteRow {
  id: string;
  body: string;
  authorName: string | null;
  authorEmail: string | null;
  createdAt: string;
}

export async function listInternalNotes(
  tenantId: string,
): Promise<InternalNoteRow[]> {
  await assertInternal();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("internal_notes")
    .select("id, body, created_at, author_id, users(full_name, email)")
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;

  type Row = {
    id: string;
    body: string;
    created_at: string;
    author_id: string;
    users: { full_name: string | null; email: string } | { full_name: string | null; email: string }[] | null;
  };
  return ((data ?? []) as unknown as Row[]).map((r) => {
    const author = Array.isArray(r.users) ? r.users[0] : r.users;
    return {
      id: r.id,
      body: r.body,
      authorName: author?.full_name ?? null,
      authorEmail: author?.email ?? null,
      createdAt: r.created_at,
    };
  });
}

// ── Feature flags del tenant ──────────────────────────────────────────────────

export interface TenantFlagRow {
  id: string;
  flag: string;
  enabled: boolean;
  note: string | null;
  updatedAt: string;
}

export async function listTenantFlags(
  tenantId: string,
): Promise<TenantFlagRow[]> {
  await assertInternal();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("tenant_flags")
    .select("id, flag, enabled, note, updated_at")
    .eq("tenant_id", tenantId)
    .order("flag", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((f) => ({
    id: f.id,
    flag: f.flag,
    enabled: f.enabled,
    note: f.note,
    updatedAt: f.updated_at,
  }));
}
