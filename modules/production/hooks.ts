"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import * as api from "./api";
import type { ProductionInput, ProductionInputRow } from "./schemas";

export function useProductions(search: string) {
  return useQuery({
    queryKey: ["productions", search],
    queryFn: () => api.listProductions(search),
  });
}

export function useCompleteProduction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      input,
      inputs,
      photoUrl,
    }: {
      input: ProductionInput;
      inputs: ProductionInputRow[];
      photoUrl?: string | null;
    }) => api.completeProduction(input, inputs, photoUrl),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["productions"] });
      qc.invalidateQueries({ queryKey: ["stock-available"] });
      qc.invalidateQueries({ queryKey: ["stock-history"] });
    },
  });
}
