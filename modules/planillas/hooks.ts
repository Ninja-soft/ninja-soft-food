"use client";

import { useQuery } from "@tanstack/react-query";
import * as api from "./api";

export function useTenantBranding() {
  return useQuery({
    queryKey: ["tenant-branding"],
    queryFn: api.getTenantBranding,
    staleTime: 5 * 60_000,
  });
}

export function useProductionDetail(id: string | null) {
  return useQuery({
    queryKey: ["production-detail", id],
    queryFn: () => api.getProductionDetail(id as string),
    enabled: !!id,
  });
}

export function useProductionsInRange(
  from: string | null,
  to: string | null,
) {
  return useQuery({
    queryKey: ["productions-range", from, to],
    queryFn: () => api.listProductionsInRange(from as string, to as string),
    enabled: !!from && !!to,
  });
}

export function useStockEntriesInRange(
  from: string | null,
  to: string | null,
) {
  return useQuery({
    queryKey: ["stock-range", from, to],
    queryFn: () => api.listStockEntriesInRange(from as string, to as string),
    enabled: !!from && !!to,
  });
}
