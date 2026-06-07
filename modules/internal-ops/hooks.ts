"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// Hooks TanStack Query de la consola SaaS interna (usuarios globales, staff,
// impersonation). Los listados van por GET route handlers porque usan admin
// client (auth.users); las mutaciones por POST route handlers auditados.

export interface GlobalUserMembershipDTO {
  tenantName: string;
  role: string;
}
export interface GlobalUserDTO {
  id: string;
  email: string;
  fullName: string | null;
  isInternal: boolean;
  createdAt: string;
  lastSignInAt: string | null;
  suspended: boolean;
  memberships: GlobalUserMembershipDTO[];
}
export interface StaffMemberDTO {
  id: string;
  email: string;
  fullName: string | null;
  createdAt: string;
  lastSignInAt: string | null;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json?.error ?? "request_failed");
  return json;
}
async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json?.error ?? "action_failed");
  return json;
}

// ── Usuarios globales ──────────────────────────────────────────────────────

export function useGlobalUsers(search?: string) {
  return useQuery({
    queryKey: ["internal", "global-users", search ?? ""],
    queryFn: () =>
      getJson<{ users: GlobalUserDTO[] }>(
        `/api/internal/users${
          search ? `?search=${encodeURIComponent(search)}` : ""
        }`,
      ).then((r) => r.users),
    staleTime: 15_000,
  });
}

export function useSetUserActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { userId: string; active: boolean }) =>
      postJson<{ ok: boolean }>("/api/internal/users/set-active", vars),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["internal", "global-users"] }),
  });
}

// ── Staff ──────────────────────────────────────────────────────────────────

export function useStaff() {
  return useQuery({
    queryKey: ["internal", "staff"],
    queryFn: () =>
      getJson<{ staff: StaffMemberDTO[] }>("/api/internal/staff").then(
        (r) => r.staff,
      ),
    staleTime: 15_000,
  });
}

export function useSetStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { userId?: string; email?: string; isInternal: boolean }) =>
      postJson<{ ok: boolean }>("/api/internal/staff/set-internal", vars),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["internal", "staff"] });
      qc.invalidateQueries({ queryKey: ["internal", "global-users"] });
    },
  });
}

// ── Auditoría: facetas para filtros ─────────────────────────────────────────

export interface AuditFacetsDTO {
  entityTypes: string[];
  actions: string[];
}

export function useAuditFacets() {
  return useQuery({
    queryKey: ["internal", "audit-facets"],
    queryFn: () => getJson<AuditFacetsDTO>("/api/internal/audit-facets"),
    staleTime: 60_000,
  });
}

// ── Salud operativa del tenant ─────────────────────────────────────────────

export interface TenantHealthDTO {
  ownerEmail: string | null;
  ownerName: string | null;
  ownerLastSignInAt: string | null;
  activeUsers: number;
  productions7d: number;
  productions30d: number;
  dispatches30d: number;
  lastActivityAt: string | null;
}

export function useTenantHealth(tenantId: string) {
  return useQuery({
    queryKey: ["internal", "tenant-health", tenantId],
    queryFn: () =>
      getJson<{ health: TenantHealthDTO | null }>(
        `/api/internal/tenant-health?tenantId=${encodeURIComponent(tenantId)}`,
      ).then((r) => r.health),
    staleTime: 30_000,
  });
}

// ── Impersonation ──────────────────────────────────────────────────────────

export interface ImpersonateResult {
  ok: boolean;
  actionLink: string;
  ownerEmail: string;
}

export function useImpersonate() {
  return useMutation({
    mutationFn: (tenantId: string) =>
      postJson<ImpersonateResult>("/api/internal/impersonate", { tenantId }),
  });
}
