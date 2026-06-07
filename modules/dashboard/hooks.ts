"use client";

import { useQuery } from "@tanstack/react-query";
import * as api from "./api";

// Datos de dashboard: solo lectura, agregados. staleTime 60s para no refetchear
// en cada foco/montaje (el dato cambia con baja frecuencia operativa).
const STALE = 60_000;

// establishmentId entra en la queryKey: cada planta (y "Todas") tiene su cache.
// La compliance es tenant-wide (permisos/vehículos/proveedores no se filtran).
export function useProductionSeries(months = 6, establishmentId?: string | null) {
  return useQuery({
    queryKey: ["dashboard", "production-series", months, establishmentId ?? null],
    queryFn: () => api.getProductionSeries(months, establishmentId),
    staleTime: STALE,
  });
}

export function useMonthKpis(establishmentId?: string | null) {
  return useQuery({
    queryKey: ["dashboard", "month-kpis", establishmentId ?? null],
    queryFn: () => api.getMonthKpis(establishmentId),
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

export function useStockAlerts(establishmentId?: string | null) {
  return useQuery({
    queryKey: ["dashboard", "stock-alerts", establishmentId ?? null],
    queryFn: () => api.getStockAlerts(establishmentId),
    staleTime: STALE,
  });
}

export function useRecentActivity(establishmentId?: string | null) {
  return useQuery({
    queryKey: ["dashboard", "recent-activity", establishmentId ?? null],
    queryFn: () => api.getRecentActivity(establishmentId),
    staleTime: STALE,
  });
}
