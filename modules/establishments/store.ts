"use client";

import { create } from "zustand";
import { persist, createJSONStorage, type StateStorage } from "zustand/middleware";

// Storage seguro: usa localStorage solo si tiene métodos reales (SSR no lo trae;
// algunos entornos de test exponen un stub sin setItem). En caso contrario, cae
// a un Map en memoria — la app sigue funcionando, solo no persiste entre cargas.
function safeStorage(): StateStorage {
  if (
    typeof window !== "undefined" &&
    typeof window.localStorage?.setItem === "function"
  ) {
    return window.localStorage;
  }
  const mem = new Map<string, string>();
  return {
    getItem: (k) => mem.get(k) ?? null,
    setItem: (k, v) => void mem.set(k, v),
    removeItem: (k) => void mem.delete(k),
  };
}

// =============================================================================
// Store de la PLANTA ACTIVA (filtro de UI, doc 12 §2). Persiste en localStorage
// la selección POR TENANT: la clave del map es el tenant_id, el valor es el
// establishment_id activo o null ("Todas las plantas").
//
// Por qué por tenant: un usuario puede pertenecer a varios tenants en el mismo
// navegador (cambia de empresa); cada uno conserva su propia planta activa sin
// pisarse. La selección NO es un permiso: la seguridad sigue siendo tenant-level
// vía RLS. Esto es solo un filtro cómodo de visualización.
// =============================================================================

interface ActiveEstablishmentState {
  /** tenant_id -> establishment_id activo (null = "Todas las plantas"). */
  byTenant: Record<string, string | null>;
  /** Setea la planta activa del tenant (null = todas). */
  setActive: (tenantId: string, establishmentId: string | null) => void;
  /** Lee la planta activa del tenant (undefined si nunca se eligió). */
  getActive: (tenantId: string) => string | null | undefined;
  /** Limpia la selección del tenant (vuelve a "todas" implícito). */
  reset: (tenantId: string) => void;
}

/**
 * Resuelve la planta activa efectiva (lógica PURA, testeable sin React):
 *  - con 0 o 1 establecimiento → null (mono-planta nunca filtra);
 *  - sin selección (undefined) o "Todas" (null) → null;
 *  - selección apuntando a una planta inexistente (borrada) → null (cae a "Todas");
 *  - selección válida → ese id.
 */
export function resolveActiveEstablishmentId(
  stored: string | null | undefined,
  establishmentIds: string[],
): string | null {
  if (establishmentIds.length <= 1) return null;
  if (stored == null) return null;
  return establishmentIds.includes(stored) ? stored : null;
}

export const useActiveEstablishmentStore = create<ActiveEstablishmentState>()(
  persist(
    (set, get) => ({
      byTenant: {},
      setActive: (tenantId, establishmentId) =>
        set((s) => ({
          byTenant: { ...s.byTenant, [tenantId]: establishmentId },
        })),
      getActive: (tenantId) => get().byTenant[tenantId],
      reset: (tenantId) =>
        set((s) => {
          const next = { ...s.byTenant };
          delete next[tenantId];
          return { byTenant: next };
        }),
    }),
    {
      name: "food-active-establishment",
      storage: createJSONStorage(safeStorage),
      // Solo persistimos el map (las funciones no son serializables).
      partialize: (s) => ({ byTenant: s.byTenant }),
    },
  ),
);
