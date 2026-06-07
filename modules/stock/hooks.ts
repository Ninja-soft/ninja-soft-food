"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import * as api from "./api";
import type { StockEntryInput, SupplierInput } from "./schemas";

// El filtro de planta activa entra como parte de la queryKey para que el cache
// distinga "Todas" de cada planta. null/undefined = sin filtro.
export function useAvailableEntries(establishmentId?: string | null) {
  return useQuery({
    queryKey: ["stock-available", establishmentId ?? null],
    queryFn: () => api.listAvailableEntries({ establishmentId }),
  });
}

export function useEntryHistory(search: string, establishmentId?: string | null) {
  return useQuery({
    queryKey: ["stock-history", search, establishmentId ?? null],
    queryFn: () => api.listEntryHistory(search, { establishmentId }),
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
      input: StockEntryInput & {
        unit: string;
        invoice_url?: string | null;
        establishment_id?: string | null;
      },
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
