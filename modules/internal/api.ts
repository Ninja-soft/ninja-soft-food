import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/types/database";

// =============================================================================
// modules/internal/api — capa de datos del panel staff Ninja-Soft.
//
// Estructura calcada del POS (modules/internal/api.ts). Diferencias clave por
// el modelo de Ninja Food:
//   - El staff lee tenants/subscriptions/plans/audit_logs con el cliente normal
//     autenticado: las policies `internal_read` (public.is_internal()) aplican.
//   - payment_events y system_emails NO tienen policy `internal_read` (solo
//     service_role). Sus listados viven en route handlers / server components con
//     el admin client (ver app/api/internal/* y las páginas server). Acá NO se
//     exponen porque no son legibles con el cliente del navegador.
//   - Las MUTACIONES (extend-trial, set-status) van por route handlers server
//     con admin client + check is_internal: las filas de subscriptions/tenants
//     no tienen policy de UPDATE para authenticated.
// =============================================================================

export type TenantStatus = Database["public"]["Enums"]["tenant_status"];

export interface InternalTenant {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  cuit: string | null;
  industry: Database["public"]["Enums"]["tenant_industry"];
  country: string;
  createdAt: string;
  trialEndsAt: string | null;
  planKey: string | null;
  planName: string | null;
  subStatus: TenantStatus | null;
  periodEnd: string | null;
  userCount: number;
}

export interface TenantDetail {
  tenant: {
    id: string;
    name: string;
    slug: string;
    status: TenantStatus;
    cuit: string | null;
    industry: Database["public"]["Enums"]["tenant_industry"];
    country: string;
    createdAt: string;
    trialEndsAt: string | null;
  };
  subscription: {
    id: string;
    status: TenantStatus;
    billingCycle: Database["public"]["Enums"]["billing_cycle"];
    provider: Database["public"]["Enums"]["billing_provider"];
    periodStart: string | null;
    periodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    planKey: string | null;
    planName: string | null;
    monthlyPriceArs: number | null;
  } | null;
  counts: {
    users: number;
    recipes: number;
    productionsThisMonth: number;
    dispatchesThisMonth: number;
  };
}

export interface InternalPlan {
  id: string;
  key: string;
  name: string;
  monthlyPriceArs: number | null;
  yearlyPriceArs: number | null;
  monthlyPriceUsd: number | null;
  limits: Database["public"]["Tables"]["plans"]["Row"]["limits"];
  isActive: boolean;
}

export interface AuditEntry {
  id: string;
  tenantId: string | null;
  actorUserId: string | null;
  entityType: string;
  entityId: string | null;
  action: string;
  beforeData: unknown;
  afterData: unknown;
  reason: string | null;
  createdAt: string;
  actorName: string | null;
  actorEmail: string | null;
}

const monthStartIso = (): string => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
};

export const internalApi = {
  // ── Tenants ────────────────────────────────────────────────────────────────
  listTenants: async (search?: string): Promise<InternalTenant[]> => {
    const supabase = createClient();
    let query = supabase
      .from("tenants")
      .select(
        "id, name, slug, status, cuit, industry, country, created_at, trial_ends_at, subscriptions(status, current_period_end, billing_cycle, plans(key, name)), tenant_users(user_id)",
      )
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(200);
    if (search && search.trim()) {
      query = query.ilike("name", `%${search.trim()}%`);
    }
    const { data, error } = await query;
    if (error) throw error;

    type SubRow = {
      status: TenantStatus;
      current_period_end: string | null;
      billing_cycle: Database["public"]["Enums"]["billing_cycle"];
      plans: { key: string; name: string } | null;
    };
    type Row = {
      id: string;
      name: string;
      slug: string;
      status: TenantStatus;
      cuit: string | null;
      industry: Database["public"]["Enums"]["tenant_industry"];
      country: string;
      created_at: string;
      trial_ends_at: string | null;
      subscriptions: SubRow | SubRow[] | null;
      tenant_users: { user_id: string }[] | null;
    };

    return ((data ?? []) as unknown as Row[]).map((t) => {
      const sub = Array.isArray(t.subscriptions)
        ? t.subscriptions[0] ?? null
        : t.subscriptions;
      return {
        id: t.id,
        name: t.name,
        slug: t.slug,
        status: t.status,
        cuit: t.cuit,
        industry: t.industry,
        country: t.country,
        createdAt: t.created_at,
        trialEndsAt: t.trial_ends_at,
        planKey: sub?.plans?.key ?? null,
        planName: sub?.plans?.name ?? null,
        subStatus: sub?.status ?? null,
        periodEnd: sub?.current_period_end ?? null,
        userCount: t.tenant_users?.length ?? 0,
      };
    });
  },

  getTenantDetail: async (tenantId: string): Promise<TenantDetail | null> => {
    const supabase = createClient();

    const { data: tenant, error: tErr } = await supabase
      .from("tenants")
      .select(
        "id, name, slug, status, cuit, industry, country, created_at, trial_ends_at",
      )
      .eq("id", tenantId)
      .is("deleted_at", null)
      .maybeSingle();
    if (tErr) throw tErr;
    if (!tenant) return null;

    const { data: sub, error: sErr } = await supabase
      .from("subscriptions")
      .select(
        "id, status, billing_cycle, provider, current_period_start, current_period_end, cancel_at_period_end, plans(key, name, monthly_price_ars)",
      )
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (sErr) throw sErr;

    const monthIso = monthStartIso();
    const [users, recipes, productions, dispatches] = await Promise.all([
      supabase
        .from("tenant_users")
        .select("user_id", { count: "exact", head: true })
        .eq("tenant_id", tenantId),
      supabase
        .from("recipes")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .is("deleted_at", null),
      supabase
        .from("productions")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .is("deleted_at", null)
        .gte("created_at", monthIso),
      supabase
        .from("dispatches")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .is("deleted_at", null)
        .gte("created_at", monthIso),
    ]);

    type SubResult = {
      id: string;
      status: TenantStatus;
      billing_cycle: Database["public"]["Enums"]["billing_cycle"];
      provider: Database["public"]["Enums"]["billing_provider"];
      current_period_start: string | null;
      current_period_end: string | null;
      cancel_at_period_end: boolean;
      plans: { key: string; name: string; monthly_price_ars: number | null } | null;
    };
    const s = sub as unknown as SubResult | null;

    return {
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        status: tenant.status,
        cuit: tenant.cuit,
        industry: tenant.industry,
        country: tenant.country,
        createdAt: tenant.created_at,
        trialEndsAt: tenant.trial_ends_at,
      },
      subscription: s
        ? {
            id: s.id,
            status: s.status,
            billingCycle: s.billing_cycle,
            provider: s.provider,
            periodStart: s.current_period_start,
            periodEnd: s.current_period_end,
            cancelAtPeriodEnd: s.cancel_at_period_end,
            planKey: s.plans?.key ?? null,
            planName: s.plans?.name ?? null,
            monthlyPriceArs: s.plans?.monthly_price_ars ?? null,
          }
        : null,
      counts: {
        users: users.count ?? 0,
        recipes: recipes.count ?? 0,
        productionsThisMonth: productions.count ?? 0,
        dispatchesThisMonth: dispatches.count ?? 0,
      },
    };
  },

  // ── Planes ──────────────────────────────────────────────────────────────────
  // Lectura con el cliente autenticado: plans tiene policy plans_public_read
  // (select to authenticated). La escritura va por route handler admin
  // (app/api/internal/update-plan) porque plans no tiene policy de UPDATE.
  // Orden por precio USD ascendente con nulls al final (enterprise queda último),
  // y por key como desempate estable.
  listPlans: async (): Promise<InternalPlan[]> => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("plans")
      .select(
        "id, key, name, monthly_price_ars, yearly_price_ars, monthly_price_usd, limits, is_active",
      )
      .order("monthly_price_usd", { ascending: true, nullsFirst: false })
      .order("key", { ascending: true });
    if (error) throw error;
    return (data ?? []).map((p) => ({
      id: p.id,
      key: p.key,
      name: p.name,
      monthlyPriceArs: p.monthly_price_ars,
      yearlyPriceArs: p.yearly_price_ars,
      monthlyPriceUsd: p.monthly_price_usd,
      limits: p.limits,
      isActive: p.is_active,
    }));
  },

  // ── Auditoría ───────────────────────────────────────────────────────────────
  listAuditLogs: async (tenantId?: string | null): Promise<AuditEntry[]> => {
    const supabase = createClient();
    let query = supabase
      .from("audit_logs")
      .select(
        "id, tenant_id, actor_user_id, entity_type, entity_id, action, before_data, after_data, reason, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (tenantId) query = query.eq("tenant_id", tenantId);
    const { data, error } = await query;
    if (error) throw error;
    const rows = data ?? [];

    // Resolver nombres de actores (audit_logs no trae el join embebido).
    const actorIds = Array.from(
      new Set(rows.map((r) => r.actor_user_id).filter(Boolean)),
    ) as string[];
    const actors = new Map<string, { name: string | null; email: string }>();
    if (actorIds.length > 0) {
      const { data: users } = await supabase
        .from("users")
        .select("id, full_name, email")
        .in("id", actorIds);
      for (const u of users ?? []) {
        actors.set(u.id, { name: u.full_name, email: u.email });
      }
    }

    return rows.map((r) => ({
      id: r.id,
      tenantId: r.tenant_id,
      actorUserId: r.actor_user_id,
      entityType: r.entity_type,
      entityId: r.entity_id,
      action: r.action,
      beforeData: r.before_data,
      afterData: r.after_data,
      reason: r.reason,
      createdAt: r.created_at,
      actorName: r.actor_user_id ? actors.get(r.actor_user_id)?.name ?? null : null,
      actorEmail: r.actor_user_id ? actors.get(r.actor_user_id)?.email ?? null : null,
    }));
  },
};
