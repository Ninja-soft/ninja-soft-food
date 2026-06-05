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
