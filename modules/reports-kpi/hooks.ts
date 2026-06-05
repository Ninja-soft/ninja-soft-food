"use client";

import { useQuery } from "@tanstack/react-query";
import * as api from "./api";
import type { ReportRange } from "./api";

// Reportes: solo lectura, agregados. staleTime 60s (mismo criterio que el
// dashboard: el dato cambia con baja frecuencia operativa).
const STALE = 60_000;

function rangeKey(range: ReportRange): string {
  return `${range.from}_${range.to}`;
}

export function useProductionReport(range: ReportRange) {
  return useQuery({
    queryKey: ["reports-kpi", "production", rangeKey(range)],
    queryFn: () => api.getProductionReport(range),
    staleTime: STALE,
  });
}

export function useCostReport(range: ReportRange) {
  return useQuery({
    queryKey: ["reports-kpi", "cost", rangeKey(range)],
    queryFn: () => api.getCostReport(range),
    staleTime: STALE,
  });
}

export function useDispatchReport(range: ReportRange) {
  return useQuery({
    queryKey: ["reports-kpi", "dispatch", rangeKey(range)],
    queryFn: () => api.getDispatchReport(range),
    staleTime: STALE,
  });
}
