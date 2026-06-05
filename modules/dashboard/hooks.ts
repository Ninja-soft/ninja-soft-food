"use client";

import { useQuery } from "@tanstack/react-query";
import * as api from "./api";

// Datos de dashboard: solo lectura, agregados. staleTime 60s para no refetchear
// en cada foco/montaje (el dato cambia con baja frecuencia operativa).
const STALE = 60_000;

export function useProductionSeries(months = 6) {
  return useQuery({
    queryKey: ["dashboard", "production-series", months],
    queryFn: () => api.getProductionSeries(months),
    staleTime: STALE,
  });
}

export function useMonthKpis() {
  return useQuery({
    queryKey: ["dashboard", "month-kpis"],
    queryFn: api.getMonthKpis,
    staleTime: STALE,
  });
}

export function useComplianceCards() {
  return useQuery({
    queryKey: ["dashboard", "compliance"],
    queryFn: api.getComplianceCards,
    staleTime: STALE,
  });
}

export function useStockAlerts() {
  return useQuery({
    queryKey: ["dashboard", "stock-alerts"],
    queryFn: api.getStockAlerts,
    staleTime: STALE,
  });
}

export function useRecentActivity() {
  return useQuery({
    queryKey: ["dashboard", "recent-activity"],
    queryFn: api.getRecentActivity,
    staleTime: STALE,
  });
}
