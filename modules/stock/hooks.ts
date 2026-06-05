"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import * as api from "./api";
import type { StockEntryInput, SupplierInput } from "./schemas";

export function useAvailableEntries() {
  return useQuery({
    queryKey: ["stock-available"],
    queryFn: api.listAvailableEntries,
  });
}

export function useEntryHistory(search: string) {
  return useQuery({
    queryKey: ["stock-history", search],
    queryFn: () => api.listEntryHistory(search),
  });
}

export function useSuppliers() {
  return useQuery({
    queryKey: ["suppliers"],
    queryFn: api.listSuppliers,
    staleTime: 60_000,
  });
}

function useInvalidateStock() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["stock-available"] });
    qc.invalidateQueries({ queryKey: ["stock-history"] });
  };
}

export function useCreateEntry() {
  const invalidate = useInvalidateStock();
  return useMutation({
    mutationFn: (
      input: StockEntryInput & { unit: string; invoice_url?: string | null },
    ) => api.createEntry(input),
    onSuccess: invalidate,
  });
}

export function useAdjustEntry() {
  const invalidate = useInvalidateStock();
  return useMutation({
    mutationFn: api.adjustEntry,
    onSuccess: invalidate,
  });
}

export function useCreateSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SupplierInput) => api.createSupplier(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["suppliers"] }),
  });
}
