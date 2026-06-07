import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireInternal } from "@/modules/internal/server";
import type { Database } from "@/types/database";

// =============================================================================
// modules/internal-ops/server — operación SaaS del panel staff Ninja-Soft.
//
// Cubre las partes de la consola que NO dependen de las migraciones 0014/0015:
//   - Salud operativa del tenant (último login del owner, actividad reciente).
//   - Usuarios globales de la plataforma (listado + estado de cuenta).
//   - Staff interno (is_internal = boolean; Food NO usa niveles como el POS).
//   - Metadata de auditoría (distinct de entity_type / action para los filtros).
//
// Todo usa admin client (service_role) porque cruza auth.users (last_sign_in,
// banned_until) y tablas sin policy internal_read. Defensa en profundidad:
// cada lector re-verifica requireInternal() además del guard del layout.
// NUNCA importar desde el cliente.
// =============================================================================

const TENANT_OWNER_ROLE: Database["public"]["Enums"]["tenant_role"] = "owner";

async function assertInternal() {
  const actor = await requireInternal({ api: true });
  if (!actor) throw new Error("forbidden");
  return actor;
}

// ── Salud operativa del tenant ─────────────────────────────────────────────

export interface TenantHealth {
  ownerEmail: string | null;
  ownerName: string | null;
  ownerLastSignInAt: string | null;
  activeUsers: number;
  productions7d: number;
  productions30d: number;
  dispatches30d: number;
  lastActivityAt: string | null;
}

/**
 * Devuelve null si el tenant no tiene miembros (no hay a quién medir).
 * El "último uso" se calcula como el máximo created_at entre la última
 * producción y el último despacho (proxy de actividad operativa).
 */
export async function getTenantHealth(
  tenantId: string,
): Promise<TenantHealth | null> {
  await assertInternal();
  const admin = createAdminClient();

  const now = Date.now();
  const since7d = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  const since30d = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Owner del tenant (fallback al primer miembro si no hay owner explícito).
  const { data: members } = await admin
    .from("tenant_users")
    .select("user_id, role, users(email, full_name)")
    .eq("tenant_id", tenantId);

  type MemberRow = {
    user_id: string;
    role: Database["public"]["Enums"]["tenant_role"];
    users: { email: string; full_name: string | null } | null;
  };
  const rows = (members ?? []) as unknown as MemberRow[];
  const owner =
    rows.find((m) => m.role === TENANT_OWNER_ROLE) ?? rows[0] ?? null;

  let ownerLastSignInAt: string | null = null;
  if (owner) {
    const { data: authUser } = await admin.auth.admin.getUserById(
      owner.user_id,
    );
    ownerLastSignInAt = authUser.user?.last_sign_in_at ?? null;
  }

  const [prod7, prod30, disp30, lastProd, lastDisp] = await Promise.all([
    admin
      .from("productions")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .gte("created_at", since7d),
    admin
      .from("productions")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .gte("created_at", since30d),
    admin
      .from("dispatches")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .gte("created_at", since30d),
    admin
      .from("productions")
      .select("created_at")
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("dispatches")
      .select("created_at")
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const lastTimes = [lastProd.data?.created_at, lastDisp.data?.created_at]
    .filter(Boolean)
    .map((t) => new Date(t as string).getTime());
  const lastActivityAt =
    lastTimes.length > 0
      ? new Date(Math.max(...lastTimes)).toISOString()
      : null;

  return {
    ownerEmail: owner?.users?.email ?? null,
    ownerName: owner?.users?.full_name ?? null,
    ownerLastSignInAt,
    activeUsers: rows.length,
    productions7d: prod7.count ?? 0,
    productions30d: prod30.count ?? 0,
    dispatches30d: disp30.count ?? 0,
    lastActivityAt,
  };
}

// ── Usuarios globales ──────────────────────────────────────────────────────

export interface GlobalUserMembership {
  tenantName: string;
  role: Database["public"]["Enums"]["tenant_role"];
}

export interface GlobalUser {
  id: string;
  email: string;
  fullName: string | null;
  isInternal: boolean;
  createdAt: string;
  lastSignInAt: string | null;
  suspended: boolean;
  memberships: GlobalUserMembership[];
}

/**
 * Lista TODOS los users de la plataforma. Cruza public.users (perfil +
 * is_internal) con auth.users (last_sign_in_at + banned_until) y con
 * tenant_users (membresías). La búsqueda filtra email/nombre server-side.
 */
export async function listGlobalUsers(opts?: {
  search?: string;
  limit?: number;
}): Promise<GlobalUser[]> {
  await assertInternal();
  const admin = createAdminClient();
  const limit = opts?.limit ?? 500;

  let query = admin
    .from("users")
    .select(
      "id, email, full_name, is_internal, created_at, tenant_users(role, tenants(name))",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  const search = opts?.search?.trim();
  if (search) {
    query = query.or(`email.ilike.%${search}%,full_name.ilike.%${search}%`);
  }

  const { data, error } = await query;
  if (error) throw error;

  type MembRow = {
    role: Database["public"]["Enums"]["tenant_role"];
    tenants: { name: string } | { name: string }[] | null;
  };
  type Row = {
    id: string;
    email: string;
    full_name: string | null;
    is_internal: boolean;
    created_at: string;
    tenant_users: MembRow[] | null;
  };
  const rows = (data ?? []) as unknown as Row[];

  // Estado de cuenta (banned_until) y último login vienen de auth.admin.
  // listUsers pagina de a 1000; recorremos hasta cubrir la plataforma.
  const authState = new Map<
    string,
    { lastSignInAt: string | null; suspended: boolean }
  >();
  for (let page = 1; page <= 20; page++) {
    const { data: list, error: lErr } = await admin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (lErr) break;
    for (const u of list.users) {
      const bannedUntil = (u as { banned_until?: string | null })
        .banned_until;
      authState.set(u.id, {
        lastSignInAt: u.last_sign_in_at ?? null,
        suspended: Boolean(bannedUntil && new Date(bannedUntil) > new Date()),
      });
    }
    if (list.users.length < 1000) break;
  }

  return rows.map((r) => {
    const memberships: GlobalUserMembership[] = (r.tenant_users ?? []).map(
      (m) => {
        const t = Array.isArray(m.tenants) ? m.tenants[0] : m.tenants;
        return { tenantName: t?.name ?? "—", role: m.role };
      },
    );
    const state = authState.get(r.id);
    return {
      id: r.id,
      email: r.email,
      fullName: r.full_name,
      isInternal: r.is_internal,
      createdAt: r.created_at,
      lastSignInAt: state?.lastSignInAt ?? null,
      suspended: state?.suspended ?? false,
      memberships,
    };
  });
}

// ── Staff interno ──────────────────────────────────────────────────────────

export interface StaffMember {
  id: string;
  email: string;
  fullName: string | null;
  createdAt: string;
  lastSignInAt: string | null;
}

/** Lista los users con is_internal = true. */
export async function listStaff(): Promise<StaffMember[]> {
  await assertInternal();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("users")
    .select("id, email, full_name, created_at")
    .eq("is_internal", true)
    .order("created_at", { ascending: true });
  if (error) throw error;
  const rows = data ?? [];

  const lastSignIn = new Map<string, string | null>();
  for (const r of rows) {
    const { data: au } = await admin.auth.admin.getUserById(r.id);
    lastSignIn.set(r.id, au.user?.last_sign_in_at ?? null);
  }

  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    fullName: r.full_name,
    createdAt: r.created_at,
    lastSignInAt: lastSignIn.get(r.id) ?? null,
  }));
}

// ── Metadata de auditoría (para poblar los filtros) ─────────────────────────

export interface AuditFacets {
  entityTypes: string[];
  actions: string[];
}

/** Distinct de entity_type y action sobre los últimos registros de auditoría. */
export async function getAuditFacets(): Promise<AuditFacets> {
  await assertInternal();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("audit_logs")
    .select("entity_type, action")
    .order("created_at", { ascending: false })
    .limit(2000);
  if (error) throw error;

  const entityTypes = new Set<string>();
  const actions = new Set<string>();
  for (const r of data ?? []) {
    if (r.entity_type) entityTypes.add(r.entity_type);
    if (r.action) actions.add(r.action);
  }
  return {
    entityTypes: Array.from(entityTypes).sort(),
    actions: Array.from(actions).sort(),
  };
}
