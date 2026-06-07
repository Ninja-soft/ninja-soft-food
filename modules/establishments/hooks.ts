"use client";

import { useMemo } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { getTenantId } from "@/lib/utils/tenant";
import * as api from "./api";
import type { EstablishmentInput } from "./schemas";
import {
  resolveActiveEstablishmentId,
  useActiveEstablishmentStore,
} from "./store";

const KEY = ["establishments"] as const;

/** tenant_id de la sesión (claim del JWT). Cacheado: no cambia en la sesión. */
export function useTenantId() {
  return useQuery({
    queryKey: ["tenant-id"],
    queryFn: getTenantId,
    staleTime: Infinity,
  });
}

/** Establecimientos activos del tenant. staleTime alto: cambian rara vez. */
export function useEstablishments() {
  return useQuery({
    queryKey: KEY,
    queryFn: api.listEstablishments,
    staleTime: 5 * 60_000,
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: KEY });
}

export function useCreateEstablishment() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: EstablishmentInput) => api.createEstablishment(input),
    onSuccess: invalidate,
  });
}

export function useUpdateEstablishment() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: EstablishmentInput }) =>
      api.updateEstablishment(id, input),
    onSuccess: invalidate,
  });
}

export function useSetDefaultEstablishment() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.setDefaultEstablishment(id),
    onSuccess: invalidate,
  });
}

export function useDeleteEstablishment() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.deleteEstablishment(id),
    onSuccess: invalidate,
  });
}

// ── Planta activa (filtro de UI) ──────────────────────────────────────────────

export type ActiveEstablishment = {
  /** Planta activa, o null = "Todas las plantas". */
  activeId: string | null;
  /** Establecimiento activo resuelto (null si "Todas" o aún cargando). */
  active: api.Establishment | null;
  /** Lista de establecimientos del tenant (default primero). */
  establishments: api.Establishment[];
  /** ¿El tenant opera más de una planta? (gatea el selector y los filtros). */
  isMulti: boolean;
  /** Setea la planta activa (null = todas). */
  setActive: (id: string | null) => void;
  isLoading: boolean;
};

/**
 * Estado consolidado de la planta activa para el tenant de la sesión: combina
 * el listado (TanStack Query) con la selección persistida (Zustand). Si nunca
 * se eligió, el default es "Todas las plantas" (activeId = null) → las queries
 * no filtran y el comportamiento es idéntico al mono-planta (doc 12 §3).
 */
export function useActiveEstablishment(): ActiveEstablishment {
  const { data: tenantId } = useTenantId();
  const { data: establishments, isLoading } = useEstablishments();
  const byTenant = useActiveEstablishmentStore((s) => s.byTenant);
  const setActiveRaw = useActiveEstablishmentStore((s) => s.setActive);

  const list = useMemo(() => establishments ?? [], [establishments]);
  const isMulti = list.length > 1;

  // Selección persistida resuelta (la lógica vive en resolveActiveEstablishmentId,
  // pura y testeable): cae a "Todas" si la planta guardada ya no existe.
  const stored = tenantId ? byTenant[tenantId] : undefined;
  const activeId = useMemo(
    () =>
      resolveActiveEstablishmentId(
        stored,
        list.map((e) => e.id),
      ),
    [stored, list],
  );

  const active = useMemo(
    () => list.find((e) => e.id === activeId) ?? null,
    [list, activeId],
  );

  return {
    activeId,
    active,
    establishments: list,
    isMulti,
    setActive: (id) => {
      if (tenantId) setActiveRaw(tenantId, id);
    },
    isLoading,
  };
}
