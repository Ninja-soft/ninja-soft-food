"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import * as api from "./api";
import type { FamilyInput, IngredientInput } from "./schemas";

const KEYS = {
  families: ["ingredient-families"] as const,
  ingredients: (search: string, familyId: string | null) =>
    ["ingredients", { search, familyId }] as const,
  units: ["measure-units"] as const,
};

export function useFamilies() {
  return useQuery({ queryKey: KEYS.families, queryFn: api.listFamilies });
}

export function useIngredients(search: string, familyId: string | null) {
  return useQuery({
    queryKey: KEYS.ingredients(search, familyId),
    queryFn: () => api.listIngredients({ search, familyId }),
  });
}

export function useUnits() {
  return useQuery({
    queryKey: KEYS.units,
    queryFn: api.listUnits,
    staleTime: 5 * 60_000,
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return {
    families: () => qc.invalidateQueries({ queryKey: KEYS.families }),
    ingredients: () => qc.invalidateQueries({ queryKey: ["ingredients"] }),
  };
}

export function useCreateFamily() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (input: FamilyInput) => api.createFamily(input),
    onSuccess: inv.families,
  });
}

export function useUpdateFamily() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: FamilyInput }) =>
      api.updateFamily(id, input),
    onSuccess: () => {
      inv.families();
      inv.ingredients();
    },
  });
}

export function useDeleteFamily() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.deleteFamily(id),
    onSuccess: () => {
      inv.families();
      inv.ingredients();
    },
  });
}

export function useCreateIngredient() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (input: IngredientInput & { image_url?: string | null }) =>
      api.createIngredient(input),
    onSuccess: inv.ingredients,
  });
}

export function useUpdateIngredient() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: Partial<IngredientInput> & { image_url?: string | null };
    }) => api.updateIngredient(id, input),
    onSuccess: inv.ingredients,
  });
}

export function useDeleteIngredient() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.deleteIngredient(id),
    onSuccess: inv.ingredients,
  });
}

/**
 * Lookup imperativo de ingrediente por código de barras (al escanear). Es una
 * mutación porque se dispara on-demand y no debe cachearse por query key.
 */
export function useFindIngredientByBarcode() {
  return useMutation({
    mutationFn: (barcode: string) => api.findIngredientByBarcode(barcode),
  });
}
