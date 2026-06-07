"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// =============================================================================
// modules/internal-billing/hooks — capa cliente de la operación de cobros del
// panel staff (ficha del tenant). Listados por GET route handlers (usan admin
// client); mutaciones por POST route handlers auditados. Patrón calcado de
// modules/internal-ops/hooks.
// =============================================================================

export interface BillingSubscriptionDTO {
  id: string;
  status: string;
  billingMode: string;
  isLifetime: boolean;
  billingCycle: string;
  provider: string;
  providerSubscriptionId: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  planId: string;
  planKey: string | null;
  planName: string | null;
  monthlyPriceArs: number | null;
}
export interface ManualPaymentDTO {
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
export interface AddonDTO {
  id: string;
  addonKey: string;
  status: string;
  source: string;
  createdAt: string;
}
export interface BillingDetailDTO {
  subscription: BillingSubscriptionDTO | null;
  manualPayments: ManualPaymentDTO[];
  aiAddon: AddonDTO | null;
}
export interface InternalNoteDTO {
  id: string;
  body: string;
  authorName: string | null;
  authorEmail: string | null;
  createdAt: string;
}
export interface TenantFlagDTO {
  id: string;
  flag: string;
  enabled: boolean;
  note: string | null;
  updatedAt: string;
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

// ── Queries ──────────────────────────────────────────────────────────────────

export function useBillingDetail(tenantId: string) {
  return useQuery({
    queryKey: ["internal", "billing-detail", tenantId],
    queryFn: () =>
      getJson<{ detail: BillingDetailDTO }>(
        `/api/internal/billing-detail?tenantId=${encodeURIComponent(tenantId)}`,
      ).then((r) => r.detail),
    staleTime: 15_000,
  });
}

export function useInternalNotes(tenantId: string) {
  return useQuery({
    queryKey: ["internal", "notes", tenantId],
    queryFn: () =>
      getJson<{ notes: InternalNoteDTO[] }>(
        `/api/internal/notes?tenantId=${encodeURIComponent(tenantId)}`,
      ).then((r) => r.notes),
    staleTime: 15_000,
  });
}

export function useTenantFlags(tenantId: string) {
  return useQuery({
    queryKey: ["internal", "flags", tenantId],
    queryFn: () =>
      getJson<{ flags: TenantFlagDTO[] }>(
        `/api/internal/flags?tenantId=${encodeURIComponent(tenantId)}`,
      ).then((r) => r.flags),
    staleTime: 15_000,
  });
}

// ── Mutaciones de cobro ───────────────────────────────────────────────────────

function useBillingInvalidate(tenantId: string) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["internal", "billing-detail", tenantId] });
    qc.invalidateQueries({ queryKey: ["internal", "tenant", tenantId] });
    qc.invalidateQueries({ queryKey: ["internal", "tenants"] });
  };
}

export interface ManualPaymentInput {
  amount: number;
  currency: string;
  method: string;
  reference?: string;
  paidAt: string;
  periodMonths: number;
  notes?: string;
}

export function useBillingActions(tenantId: string) {
  const invalidate = useBillingInvalidate(tenantId);

  return {
    changePlan: useMutation({
      mutationFn: (planId: string) =>
        postJson<{ ok: boolean }>("/api/internal/change-plan", {
          tenantId,
          planId,
        }),
      onSuccess: invalidate,
    }),
    manualPayment: useMutation({
      mutationFn: (input: ManualPaymentInput) =>
        postJson<{ ok: boolean }>("/api/internal/manual-payment", {
          tenantId,
          ...input,
        }),
      onSuccess: invalidate,
    }),
    grantCourtesy: useMutation({
      mutationFn: (months: number) =>
        postJson<{ ok: boolean }>("/api/internal/comp", {
          tenantId,
          mode: "courtesy",
          months,
        }),
      onSuccess: invalidate,
    }),
    grantLifetime: useMutation({
      mutationFn: () =>
        postJson<{ ok: boolean }>("/api/internal/comp", {
          tenantId,
          mode: "lifetime",
        }),
      onSuccess: invalidate,
    }),
    extendSubscription: useMutation({
      mutationFn: (vars: { days?: number; months?: number }) =>
        postJson<{ ok: boolean }>("/api/internal/extend-subscription", {
          tenantId,
          ...vars,
        }),
      onSuccess: invalidate,
    }),
    paymentLink: useMutation({
      mutationFn: (vars: { planId?: string; cycle?: string }) =>
        postJson<{ init_point: string }>("/api/internal/payment-link", {
          tenantId,
          ...vars,
        }),
    }),
    setAddon: useMutation({
      mutationFn: (action: "grant" | "cancel") =>
        postJson<{ ok: boolean }>("/api/internal/addon", { tenantId, action }),
      onSuccess: invalidate,
    }),
  };
}

// ── Notas ─────────────────────────────────────────────────────────────────────

export function useNoteActions(tenantId: string) {
  const qc = useQueryClient();
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["internal", "notes", tenantId] });

  return {
    create: useMutation({
      mutationFn: (text: string) =>
        postJson<{ ok: boolean }>("/api/internal/notes/create", {
          tenantId,
          body: text,
        }),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (noteId: string) =>
        postJson<{ ok: boolean }>("/api/internal/notes/delete", { noteId }),
      onSuccess: invalidate,
    }),
  };
}

// ── Flags ─────────────────────────────────────────────────────────────────────

export interface SetFlagInput {
  flag: string;
  enabled: boolean;
  note?: string;
}

export function useFlagActions(tenantId: string) {
  const qc = useQueryClient();
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["internal", "flags", tenantId] });

  return {
    set: useMutation({
      mutationFn: (input: SetFlagInput) =>
        postJson<{ ok: boolean }>("/api/internal/flags/set", {
          tenantId,
          ...input,
        }),
      onSuccess: invalidate,
    }),
  };
}
