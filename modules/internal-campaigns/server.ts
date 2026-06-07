import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireInternal } from "@/modules/internal/server";
import type { Database } from "@/types/database";
import {
  type AudienceFilter,
  type AudienceMember,
  CAMPAIGN_PREFIX,
  filterAudience,
} from "./schemas";

// =============================================================================
// modules/internal-campaigns/server — resolucion server-only de la audiencia.
//
// Lee tenants + su suscripcion (estado efectivo, plan, modo de cobro) y resuelve
// el owner (tenant_users role=owner, fallback al primer miembro) con su email.
// Todo con admin client (subscriptions/system_emails sin policy authenticated) y
// re-verificando is_internal (defensa en profundidad: el service role bypassa
// RLS). El FILTRADO en si es puro (schemas.filterAudience) para testearlo aislado.
// =============================================================================

type TenantStatus = Database["public"]["Enums"]["tenant_status"];

interface RawTenant {
  id: string;
  name: string;
  status: TenantStatus;
  country: string | null;
  deleted_at: string | null;
  subscriptions:
    | {
        status: TenantStatus;
        billing_mode: string | null;
        plans: { key: string } | { key: string }[] | null;
      }
    | {
        status: TenantStatus;
        billing_mode: string | null;
        plans: { key: string } | { key: string }[] | null;
      }[]
    | null;
}

interface RawMembership {
  tenant_id: string;
  role: Database["public"]["Enums"]["tenant_role"];
  user_id: string;
  created_at: string;
  users: { email: string; full_name: string | null } | null;
}

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

/**
 * Trae TODOS los tenants candidatos (no borrados) con su estado efectivo, plan,
 * modo de cobro y owner resuelto. Es la base sin filtrar: el caller aplica los
 * filtros via filterAudience (pura). Owner = tenant_users role=owner; si no hay,
 * el primer miembro por created_at. Solo se incluyen tenants con email valido en
 * el resultado final (lo hace filterAudience).
 */
export async function resolveAudienceBase(): Promise<AudienceMember[]> {
  if (!(await requireInternal({ api: true }))) throw new Error("forbidden");
  const admin = createAdminClient();

  const [tenantsRes, membersRes] = await Promise.all([
    admin
      .from("tenants")
      .select(
        "id, name, status, country, deleted_at, subscriptions(status, billing_mode, plans(key))",
      )
      .is("deleted_at", null)
      .limit(5000),
    admin
      .from("tenant_users")
      .select("tenant_id, role, user_id, created_at, users(email, full_name)")
      .order("created_at", { ascending: true })
      .limit(20000),
  ]);

  if (tenantsRes.error) throw tenantsRes.error;
  if (membersRes.error) throw membersRes.error;

  const tenants = (tenantsRes.data ?? []) as unknown as RawTenant[];
  const memberships = (membersRes.data ?? []) as unknown as RawMembership[];

  // Indexamos el owner por tenant. Como tenant_users viene ordenado por
  // created_at asc, el primer registro de cada tenant es el "primer miembro"
  // (fallback). Un role=owner pisa ese fallback.
  type Owner = { email: string; name: string | null };
  const ownerByTenant = new Map<string, Owner>();
  const firstByTenant = new Map<string, Owner>();
  for (const m of memberships) {
    const u = m.users;
    if (!u?.email) continue;
    const owner: Owner = { email: u.email, name: u.full_name ?? null };
    if (!firstByTenant.has(m.tenant_id)) firstByTenant.set(m.tenant_id, owner);
    if (m.role === "owner" && !ownerByTenant.has(m.tenant_id)) {
      ownerByTenant.set(m.tenant_id, owner);
    }
  }

  const members: AudienceMember[] = [];
  for (const t of tenants) {
    const sub = one(t.subscriptions);
    const plan = sub ? one(sub.plans) : null;
    const owner = ownerByTenant.get(t.id) ?? firstByTenant.get(t.id) ?? null;
    // El estado canonico vive en subscriptions (regla dura 7); fallback al de
    // tenants si no hay suscripcion.
    const status = (sub?.status ?? t.status) as AudienceMember["status"];
    members.push({
      tenantId: t.id,
      tenantName: t.name,
      ownerEmail: owner?.email ?? "",
      ownerName: owner?.name ?? null,
      status,
      planKey: plan?.key ?? null,
      billingMode: sub?.billing_mode ?? null,
      country: t.country ?? null,
    });
  }
  return members;
}

/** Audiencia ya filtrada y ordenada por nombre de negocio. */
export async function resolveAudience(
  filter: AudienceFilter,
): Promise<AudienceMember[]> {
  const base = await resolveAudienceBase();
  return filterAudience(base, filter).sort((a, b) =>
    a.tenantName.localeCompare(b.tenantName),
  );
}

// -----------------------------------------------------------------------------
// Historial de campañas — derivado de system_emails. No hay columna de metadata,
// asi que las campañas se reconocen por el prefijo CAMPAIGN_PREFIX en el subject.
// Agrupamos por (subject sin prefijo + dia) y contamos sent/failed. Simple a
// proposito: una campaña ~ un asunto enviado el mismo dia.
// -----------------------------------------------------------------------------

export interface CampaignHistoryRow {
  /** Clave de agrupacion: "YYYY-MM-DD · asunto". */
  key: string;
  subject: string;
  /** Fecha (dia) del primer envio de la campaña. */
  date: string;
  sent: number;
  failed: number;
  total: number;
}

export async function listCampaignHistory(
  limit = 1000,
): Promise<CampaignHistoryRow[]> {
  if (!(await requireInternal({ api: true }))) throw new Error("forbidden");
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("system_emails")
    .select("subject, status, created_at")
    .ilike("subject", `${CAMPAIGN_PREFIX}%`)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  type Row = { subject: string; status: string; created_at: string };
  const rows = (data ?? []) as Row[];
  const groups = new Map<string, CampaignHistoryRow>();

  for (const r of rows) {
    const cleanSubject = r.subject
      .replace(new RegExp(`^${escapeRegExp(CAMPAIGN_PREFIX)}\\s*`), "")
      .trim();
    const day = r.created_at.slice(0, 10); // YYYY-MM-DD
    const key = `${day} · ${cleanSubject}`;
    const g =
      groups.get(key) ??
      ({
        key,
        subject: cleanSubject,
        date: r.created_at,
        sent: 0,
        failed: 0,
        total: 0,
      } satisfies CampaignHistoryRow);
    g.total += 1;
    if (r.status === "sent") g.sent += 1;
    else if (r.status === "failed") g.failed += 1;
    // Conserva el created_at mas reciente (la lista viene desc).
    groups.set(key, g);
  }

  return Array.from(groups.values()).sort(
    (a, b) => +new Date(b.date) - +new Date(a.date),
  );
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Catalogo de planes activos (key + name) para el selector de filtros. */
export async function listPlanOptions(): Promise<
  { key: string; name: string }[]
> {
  if (!(await requireInternal({ api: true }))) throw new Error("forbidden");
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("plans")
    .select("key, name, is_active")
    .order("key", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as { key: string; name: string; is_active: boolean }[])
    .filter((p) => p.is_active)
    .map((p) => ({ key: p.key, name: p.name }));
}

/** Conteo de tenants por pais (codigo ISO-2) para el selector de paises. */
export async function listCountryOptions(): Promise<string[]> {
  const base = await resolveAudienceBase();
  const set = new Set<string>();
  for (const m of base) {
    if (m.country) set.add(m.country.toUpperCase());
  }
  return Array.from(set).sort();
}
