"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import * as api from "./api";
import type { ProductionInput, ProductionInputRow } from "./schemas";

export function useProductions(search: string, establishmentId?: string | null) {
  return useQuery({
    queryKey: ["productions", search, establishmentId ?? null],
    queryFn: () => api.listProductions(search, { establishmentId }),
  });
}

export function useCompleteProduction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      input,
      inputs,
      photoUrl,
      establishmentId,
    }: {
      input: ProductionInput;
      inputs: ProductionInputRow[];
      photoUrl?: string | null;
      establishmentId?: string | null;
    }) => api.completeProduction(input, inputs, photoUrl, establishmentId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["productions"] });
      qc.invalidateQueries({ queryKey: ["stock-available"] });
      qc.invalidateQueries({ queryKey: ["stock-history"] });
    },
  });
}
