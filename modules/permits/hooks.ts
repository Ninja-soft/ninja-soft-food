"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import * as api from "./api";
import type { PermitEntityType, PermitInput } from "./schemas";

function key(entityType: PermitEntityType, entityId: string) {
  return ["permits", entityType, entityId] as const;
}

export function usePermits(
  entityType: PermitEntityType,
  entityId: string | null,
) {
  return useQuery({
    queryKey: ["permits", entityType, entityId],
    queryFn: () => api.listPermits(entityType, entityId as string),
    enabled: !!entityId,
  });
}

export function useCreatePermit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PermitInput) => api.createPermit(input),
    onSuccess: (_d, input) =>
      qc.invalidateQueries({ queryKey: key(input.entity_type, input.entity_id) }),
  });
}

export function useUpdatePermit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: PermitInput }) =>
      api.updatePermit(id, input),
    onSuccess: (_d, { input }) =>
      qc.invalidateQueries({ queryKey: key(input.entity_type, input.entity_id) }),
  });
}

export function useDeletePermit(
  entityType: PermitEntityType,
  entityId: string | null,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deletePermit(id),
    onSuccess: () =>
      entityId &&
      qc.invalidateQueries({ queryKey: key(entityType, entityId) }),
  });
}
