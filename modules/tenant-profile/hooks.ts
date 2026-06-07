"use client";

import { useQuery } from "@tanstack/react-query";
import * as api from "./api";

/**
 * useOperatingProfile — contexto de país del tenant para la UI.
 * Devuelve { country, locale, currency, timezone, taxIdLabel, complianceFrameworks,
 * labelSystem, countryProfile }. Cacheado: el perfil cambia muy poco.
 *
 * Mientras carga, `data` es undefined: los consumidores deben degradar de forma
 * digna (no asumir Argentina). El query nunca lanza al render — el fallback de
 * país vive en buildOperatingProfile.
 */
export function useOperatingProfile() {
  return useQuery({
    queryKey: ["operating-profile-context"],
    queryFn: api.getOperatingProfile,
    staleTime: 5 * 60 * 1000,
  });
}
