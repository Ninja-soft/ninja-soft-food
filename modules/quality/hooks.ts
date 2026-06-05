"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "./api";
import type { AnalysisType, AnalysisInput, LaboratoryInput } from "./schemas";

// ── Análisis de laboratorio ──────────────────────────────────────────────────

export function useAnalyses(params: {
  type?: AnalysisType | null;
  from?: string | null;
  to?: string | null;
  search?: string;
}) {
  return useQuery({
    queryKey: ["analyses", params],
    queryFn: () => api.listAnalyses(params),
  });
}

export function useCreateAnalysis() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AnalysisInput) => api.createAnalysis(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["analyses"] }),
  });
}

export function useUpdateAnalysis() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: AnalysisInput }) =>
      api.updateAnalysis(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["analyses"] }),
  });
}

export function useDeleteAnalysis() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.softDeleteAnalysis(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["analyses"] }),
  });
}

// ── Laboratorios ─────────────────────────────────────────────────────────────

export function useLaboratories() {
  return useQuery({
    queryKey: ["laboratories"],
    queryFn: api.listLaboratories,
    staleTime: 60_000,
  });
}

export function useCreateLaboratory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: LaboratoryInput) => api.createLaboratory(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["laboratories"] }),
  });
}

export function useUpdateLaboratory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: LaboratoryInput }) =>
      api.updateLaboratory(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["laboratories"] }),
  });
}

export function useDeleteLaboratory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.softDeleteLaboratory(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["laboratories"] }),
  });
}

// ── Adjuntos ─────────────────────────────────────────────────────────────────

export function useUploadAttachment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { analysisId: string; file: File }) =>
      api.uploadAnalysisAttachment(params),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["analyses"] }),
  });
}

export function useDeleteAttachment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (attachment: { id: string; url: string }) =>
      api.deleteAnalysisAttachment(attachment),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["analyses"] }),
  });
}
