"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "./api";
import { MigrationPendingError } from "./api";

// Hooks de la sección Ajustes → API. Las queries devuelven [] cuando la
// migración 0010 todavía no está aplicada (la card muestra el empty state).

function isMigrationPending(error: unknown): boolean {
  return error instanceof MigrationPendingError;
}

export function useApiKeys() {
  return useQuery({
    queryKey: ["api-keys"],
    queryFn: api.listApiKeys,
    retry: (count, error) => !isMigrationPending(error) && count < 2,
  });
}

export function useWebhooks() {
  return useQuery({
    queryKey: ["outbound-webhooks"],
    queryFn: api.listWebhooks,
    retry: (count, error) => !isMigrationPending(error) && count < 2,
  });
}

export function useCreateApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.createApiKey,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["api-keys"] }),
  });
}

export function useRevokeApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.revokeApiKey,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["api-keys"] }),
  });
}

export function useCreateWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.createWebhook,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["outbound-webhooks"] }),
  });
}

export function useSetWebhookActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.setWebhookActive(id, isActive),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["outbound-webhooks"] }),
  });
}

export function useDeleteWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.deleteWebhook,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["outbound-webhooks"] }),
  });
}
