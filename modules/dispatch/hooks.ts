"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "./api";
import type { CustomerInput, DispatchInput, VehicleInput } from "./schemas";

// ── Clientes ─────────────────────────────────────────────────────────────────

export function useCustomers(search = "") {
  return useQuery({
    queryKey: ["customers", search],
    queryFn: () => api.listCustomers(search),
    staleTime: 60_000,
  });
}

export function useCreateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CustomerInput) => api.createCustomer(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customers"] }),
  });
}

export function useUpdateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CustomerInput }) =>
      api.updateCustomer(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customers"] }),
  });
}

export function useDeleteCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.softDeleteCustomer(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customers"] }),
  });
}

// ── Vehículos ────────────────────────────────────────────────────────────────

export function useVehicles() {
  return useQuery({
    queryKey: ["vehicles"],
    queryFn: api.listVehicles,
    staleTime: 60_000,
  });
}

export function useCreateVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: VehicleInput) => api.createVehicle(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vehicles"] }),
  });
}

export function useUpdateVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: VehicleInput }) =>
      api.updateVehicle(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vehicles"] }),
  });
}

export function useDeleteVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.softDeleteVehicle(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vehicles"] }),
  });
}

// ── Producciones disponibles ─────────────────────────────────────────────────

export function useCompletedProductions() {
  return useQuery({
    queryKey: ["dispatch-productions"],
    queryFn: api.listCompletedProductions,
    staleTime: 30_000,
  });
}

// ── Despachos ────────────────────────────────────────────────────────────────

export function useDispatches(params: {
  search?: string;
  from?: string | null;
  to?: string | null;
}) {
  return useQuery({
    queryKey: ["dispatches", params],
    queryFn: () => api.listDispatches(params),
  });
}

export function useDispatchDetail(id: string | null) {
  return useQuery({
    queryKey: ["dispatch-detail", id],
    queryFn: () => api.getDispatchDetail(id as string),
    enabled: !!id,
  });
}

export function useCreateDispatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: DispatchInput) => api.createDispatch(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dispatches"] }),
  });
}

export function useVoidDispatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.voidDispatch(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dispatches"] }),
  });
}
