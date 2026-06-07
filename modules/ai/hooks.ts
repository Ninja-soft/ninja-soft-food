"use client";

import { useQuery } from "@tanstack/react-query";

// =============================================================================
// modules/ai/hooks — estado de IA del tenant para la UI (client-side).
//
// useAiStatus() consulta GET /api/ai/status (authenticated, resuelve el tenant
// del claim server-side) y devuelve si la IA está habilitada para el tenant. Las
// pantallas lo usan para mostrar/ocultar las acciones de IA. enabled=false ante
// cualquier ausencia/fallo: la IA nunca debe romper el render. staleTime alto
// porque el gating cambia rara vez (plan/add-on/flag).
// =============================================================================

export function useAiStatus() {
  return useQuery({
    queryKey: ["ai-status"],
    queryFn: async (): Promise<{ enabled: boolean }> => {
      try {
        const res = await fetch("/api/ai/status");
        if (!res.ok) return { enabled: false };
        return (await res.json()) as { enabled: boolean };
      } catch {
        return { enabled: false };
      }
    },
    staleTime: 5 * 60 * 1000,
  });
}
