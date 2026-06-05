"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import * as api from "./api";
import type {
  RecipeGroupInput,
  RecipeIngredientInput,
  RecipeInput,
} from "./schemas";

export function useRecipeGroups() {
  return useQuery({ queryKey: ["recipe-groups"], queryFn: api.listGroups });
}

export function useRecipes(search: string, groupId: string | null) {
  return useQuery({
    queryKey: ["recipes", { search, groupId }],
    queryFn: () => api.listRecipes({ search, groupId }),
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return {
    groups: () => qc.invalidateQueries({ queryKey: ["recipe-groups"] }),
    recipes: () => qc.invalidateQueries({ queryKey: ["recipes"] }),
  };
}

export function useCreateGroup() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (input: RecipeGroupInput) => api.createGroup(input),
    onSuccess: inv.groups,
  });
}

export function useUpdateGroup() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: RecipeGroupInput }) =>
      api.updateGroup(id, input),
    onSuccess: () => {
      inv.groups();
      inv.recipes();
    },
  });
}

export function useDeleteGroup() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.deleteGroup(id),
    onSuccess: () => {
      inv.groups();
      inv.recipes();
    },
  });
}

export function useCreateRecipe() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: ({
      input,
      ingredients,
    }: {
      input: RecipeInput & { image_url?: string | null };
      ingredients: RecipeIngredientInput[];
    }) => api.createRecipe(input, ingredients),
    onSuccess: inv.recipes,
  });
}

export function useUpdateRecipe() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: ({
      id,
      input,
      ingredients,
    }: {
      id: string;
      input: Partial<RecipeInput> & { image_url?: string | null };
      ingredients: RecipeIngredientInput[];
    }) => api.updateRecipe(id, input, ingredients),
    onSuccess: inv.recipes,
  });
}

export function useDeleteRecipe() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.deleteRecipe(id),
    onSuccess: inv.recipes,
  });
}
