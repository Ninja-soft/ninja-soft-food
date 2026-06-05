import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";

// =============================================================================
// modules/internal/server — datos del panel staff que SOLO viven server-side.
//
// payment_events y system_emails no tienen policy `internal_read` (CLAUDE: solo
// service_role). Por eso sus listados usan el admin client (service_role) en
// server components / route handlers. NUNCA importar desde el cliente.
//
// requireInternal() es la defensa server-side compartida (además del guard del
// layout): resuelve la sesión, exige users.is_internal y devuelve el contexto
// del staff. Las páginas y route handlers la llaman antes de tocar nada.
// =============================================================================

export interface InternalActor {
  userId: string;
  email: string;
  fullName: string | null;
  level: string | null;
}

/**
 * Verifica que la sesión sea de staff Ninja-Soft (users.is_internal = true).
 * En route handlers pasá { api: true } para recibir null en vez de redirect.
 */
export async function requireInternal(opts?: {
  api?: boolean;
}): Promise<InternalActor | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    if (opts?.api) return null;
    redirect("/login?next=/internal");
  }

  const { data: me } = await supabase
    .from("users")
    .select("is_internal, internal_level, full_name, email")
    .eq("id", user.id)
    .maybeSingle();

  if (!me?.is_internal) {
    if (opts?.api) return null;
    redirect("/dashboard");
  }

  return {
    userId: user.id,
    email: me.email ?? user.email ?? "",
    fullName: me.full_name ?? null,
    level: me.internal_level ?? null,
  };
}

export interface PaymentEventRow {
  id: string;
  provider: Database["public"]["Enums"]["billing_provider"];
  providerEventId: string;
  tenantId: string | null;
  tenantName: string | null;
  processedAt: string | null;
  createdAt: string;
  payload: unknown;
}

export async function listPaymentEvents(limit = 100): Promise<PaymentEventRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("payment_events")
    .select(
      "id, provider, provider_event_id, tenant_id, processed_at, created_at, payload, tenants(name)",
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  type Row = {
    id: string;
    provider: Database["public"]["Enums"]["billing_provider"];
    provider_event_id: string;
    tenant_id: string | null;
    processed_at: string | null;
    created_at: string;
    payload: unknown;
    tenants: { name: string } | { name: string }[] | null;
  };

  return ((data ?? []) as unknown as Row[]).map((r) => {
    const tenant = Array.isArray(r.tenants) ? r.tenants[0] : r.tenants;
    return {
      id: r.id,
      provider: r.provider,
      providerEventId: r.provider_event_id,
      tenantId: r.tenant_id,
      tenantName: tenant?.name ?? null,
      processedAt: r.processed_at,
      createdAt: r.created_at,
      payload: r.payload,
    };
  });
}

export interface SystemEmailRow {
  id: string;
  subject: string;
  recipient: string;
  status: string;
  errorMessage: string | null;
  sentAt: string | null;
  createdAt: string;
  tenantId: string | null;
  tenantName: string | null;
}

export async function listSystemEmails(limit = 200): Promise<SystemEmailRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("system_emails")
    .select(
      "id, subject, recipient, status, error_message, sent_at, created_at, tenant_id, tenants(name)",
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  type Row = {
    id: string;
    subject: string;
    recipient: string;
    status: string;
    error_message: string | null;
    sent_at: string | null;
    created_at: string;
    tenant_id: string | null;
    tenants: { name: string } | { name: string }[] | null;
  };

  return ((data ?? []) as unknown as Row[]).map((r) => {
    const tenant = Array.isArray(r.tenants) ? r.tenants[0] : r.tenants;
    return {
      id: r.id,
      subject: r.subject,
      recipient: r.recipient,
      status: r.status,
      errorMessage: r.error_message,
      sentAt: r.sent_at,
      createdAt: r.created_at,
      tenantId: r.tenant_id,
      tenantName: tenant?.name ?? null,
    };
  });
}

export interface OverviewStats {
  totalTenants: number;
  active: number;
  trial: number;
  pastDue: number;
  suspended: number;
  cancelled: number;
  paymentEvents24h: number;
  failedEmails: number;
}

/** Resumen para la home del panel — mezcla client tables (tenants) con admin (pagos/emails). */
export async function getOverviewStats(): Promise<OverviewStats> {
  const admin = createAdminClient();
  const supabase = createClient();

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [tenantsRes, eventsRes, emailsRes] = await Promise.all([
    supabase
      .from("tenants")
      .select("status, subscriptions(status)")
      .is("deleted_at", null)
      .limit(1000),
    admin
      .from("payment_events")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since24h),
    admin
      .from("system_emails")
      .select("id", { count: "exact", head: true })
      .eq("status", "failed"),
  ]);

  type TRow = {
    status: TenantStatusEnum;
    subscriptions: { status: TenantStatusEnum } | { status: TenantStatusEnum }[] | null;
  };
  type TenantStatusEnum = Database["public"]["Enums"]["tenant_status"];
  const rows = (tenantsRes.data ?? []) as unknown as TRow[];

  const effective = (t: TRow): TenantStatusEnum => {
    const sub = Array.isArray(t.subscriptions)
      ? t.subscriptions[0]
      : t.subscriptions;
    return sub?.status ?? t.status;
  };
  const count = (s: TenantStatusEnum) =>
    rows.filter((t) => effective(t) === s).length;

  return {
    totalTenants: rows.length,
    active: count("active"),
    trial: count("trial"),
    pastDue: count("past_due"),
    suspended: count("suspended"),
    cancelled: count("cancelled"),
    paymentEvents24h: eventsRes.count ?? 0,
    failedEmails: emailsRes.count ?? 0,
  };
}
