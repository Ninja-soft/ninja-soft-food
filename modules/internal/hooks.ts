"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { internalApi } from "./api";

// Hooks TanStack Query del panel staff — patrón POS (modules/internal/hooks.ts).
// Solo cubren las tablas legibles por el cliente (policies internal_read):
// tenants, subscriptions, plans, audit_logs. Pagos y emails se renderizan en
// server components (modules/internal/server.ts) porque van con admin client.

export function useInternalTenants(search?: string) {
  return useQuery({
    queryKey: ["internal", "tenants", search ?? ""],
    queryFn: () => internalApi.listTenants(search),
    staleTime: 30_000,
  });
}

export function useTenantDetail(tenantId: string) {
  return useQuery({
    queryKey: ["internal", "tenant", tenantId],
    queryFn: () => internalApi.getTenantDetail(tenantId),
  });
}

export function useInternalAudit(tenantId?: string | null) {
  return useQuery({
    queryKey: ["internal", "audit", tenantId ?? "all"],
    queryFn: () => internalApi.listAuditLogs(tenantId),
  });
}

export function useInternalPlans() {
  return useQuery({
    queryKey: ["internal", "plans"],
    queryFn: () => internalApi.listPlans(),
    staleTime: 30_000,
  });
}

export function useInternalAddons() {
  return useQuery({
    queryKey: ["internal", "addons"],
    queryFn: () => internalApi.listAddons(),
    staleTime: 30_000,
  });
}

// ── Mutaciones (route handlers server con admin client + check is_internal) ───

async function postAction<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error((json as { error?: string })?.error ?? "internal_action_failed");
  }
  return json;
}

export function useTenantActions(tenantId: string) {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["internal", "tenant", tenantId] });
    qc.invalidateQueries({ queryKey: ["internal", "tenants"] });
  };

  return {
    extendTrial: useMutation({
      mutationFn: () =>
        postAction<{ ok: boolean }>("/api/internal/extend-trial", { tenantId }),
      onSuccess: invalidate,
    }),
    setStatus: useMutation({
      mutationFn: (status: string) =>
        postAction<{ ok: boolean }>("/api/internal/set-status", {
          tenantId,
          status,
        }),
      onSuccess: invalidate,
    }),
  };
}

export interface UpdatePlanPayload {
  plan_id: string;
  monthly_price_ars: number | null;
  yearly_price_ars: number | null;
  is_active?: boolean;
  /** Toggle "IA incluida": setea limits.ai_included (lo lee tenantHasAI). */
  ai_included?: boolean;
}

export function useUpdatePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdatePlanPayload) =>
      postAction<{ ok: boolean }>("/api/internal/update-plan", payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["internal", "plans"] });
      // El catálogo de billing del tenant (modules/billing/hooks → usePlans)
      // lee la misma tabla; refrescamos por si el cache convive.
      qc.invalidateQueries({ queryKey: ["plans"] });
    },
  });
}

export interface UpdateAddonPayload {
  key: string;
  monthly_price_ars: number | null;
  monthly_price_usd: number | null;
  is_active?: boolean;
  description?: string;
}

export function useUpdateAddon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateAddonPayload) =>
      postAction<{ ok: boolean }>("/api/internal/update-addon", payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["internal", "addons"] });
    },
  });
}
