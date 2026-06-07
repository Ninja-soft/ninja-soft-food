"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "./api";
import type { BillingCycle } from "@/lib/billing/types";

export function useMySubscription() {
  return useQuery({
    queryKey: ["my-subscription"],
    queryFn: api.getMySubscription,
    staleTime: 30_000,
  });
}

export function usePlans() {
  return useQuery({
    queryKey: ["plans"],
    queryFn: api.listPlans,
    staleTime: 5 * 60_000,
  });
}

export function useStartCheckout() {
  return useMutation({
    mutationFn: ({ planKey, cycle }: { planKey: string; cycle: BillingCycle }) =>
      api.startCheckout(planKey, cycle),
  });
}

export function useCancelSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.cancelSubscription(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-subscription"] }),
  });
}

// ── Add-on Asistente IA ───────────────────────────────────────────────────────

export function useAddonStatus() {
  return useQuery({
    queryKey: ["addon-status"],
    queryFn: api.getAddonStatus,
    staleTime: 30_000,
  });
}

export function useStartAddonCheckout() {
  return useMutation({
    mutationFn: () => api.startAddonCheckout(),
  });
}

export function useCancelAddon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.cancelAddon(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["addon-status"] });
      // El gating de IA (RecipeFormModal) lee /api/ai/status; refrescamos.
      qc.invalidateQueries({ queryKey: ["ai-status"] });
    },
  });
}
