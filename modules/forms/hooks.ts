"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "./api";
import type { TemplateInput } from "./schemas";

// ── Templates ────────────────────────────────────────────────────────────────

export function useTemplates(search = "") {
  return useQuery({
    queryKey: ["form-templates", search],
    queryFn: () => api.listTemplates(search),
    staleTime: 60_000,
    // No reintentar si falta la migración: el empty state lo resuelve la UI.
    retry: (count, error) =>
      !(error instanceof api.MigrationPendingError) && count < 2,
  });
}

export function useCreateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TemplateInput) => api.createTemplate(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["form-templates"] }),
  });
}

export function useUpdateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: TemplateInput }) =>
      api.updateTemplate(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["form-templates"] }),
  });
}

export function useDeleteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.softDeleteTemplate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["form-templates"] }),
  });
}

// ── Submissions ──────────────────────────────────────────────────────────────

export function useSubmissions(params: {
  templateId: string | null;
  from?: string | null;
  to?: string | null;
}) {
  return useQuery({
    queryKey: ["form-submissions", params],
    queryFn: () =>
      api.listSubmissions({
        templateId: params.templateId as string,
        from: params.from,
        to: params.to,
      }),
    enabled: !!params.templateId,
  });
}

export function useSubmitForm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: api.SubmitFormArgs) => api.submitForm(args),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["form-submissions"] });
      qc.invalidateQueries({ queryKey: ["form-templates"] });
    },
  });
}

// ── Operarios ────────────────────────────────────────────────────────────────

export function useFormMembers() {
  return useQuery({
    queryKey: ["form-members"],
    queryFn: api.listMembers,
    staleTime: 5 * 60_000,
  });
}
