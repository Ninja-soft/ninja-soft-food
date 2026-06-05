"use client";

import { useQuery } from "@tanstack/react-query";
import * as api from "./api";

// Hooks TanStack Query del módulo Recall / Trazabilidad.

/** Buscador unificado de lotes (MP + PT). Se habilita con 2+ caracteres. */
export function useLotSearch(query: string) {
  const q = query.trim();
  return useQuery({
    queryKey: ["trace", "search", q],
    queryFn: () => api.searchLots(q),
    enabled: q.length >= 2,
    staleTime: 30_000,
  });
}

/** Trace forward desde un lote de materia prima hacia los clientes. */
export function useForwardTrace(stockEntryId: string | null) {
  return useQuery({
    queryKey: ["trace", "forward", stockEntryId],
    queryFn: () => api.traceForward(stockEntryId as string),
    enabled: !!stockEntryId,
  });
}

/** Trace backward desde un lote de producto terminado hacia insumos y clientes. */
export function useBackwardTrace(productionId: string | null) {
  return useQuery({
    queryKey: ["trace", "backward", productionId],
    queryFn: () => api.traceBackward(productionId as string),
    enabled: !!productionId,
  });
}
