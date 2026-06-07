"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Pencil, Plus, Trash2, Truck } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { SpinnerBlock } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { Money } from "@/components/ui/Typography";
import { daysUntil, formatDate } from "@/lib/utils/format";
import type { Vehicle } from "@/modules/dispatch/api";
import {
  useCreateVehicle,
  useDeleteVehicle,
  useUpdateVehicle,
  useVehicles,
} from "@/modules/dispatch/hooks";
import { vehicleSchema, type VehicleInput } from "@/modules/dispatch/schemas";
import { PermitsSection } from "@/components/permits/PermitsSection";

/** ¿Hay alguna habilitación (UTA/URA) vencida? Lee las columnas legacy; las
 *  alertas finas por país viven en regulatory_permits (PermitsSection). */
export function isVehicleExpired(v: {
  uta_expiry: string | null;
  ura_expiry: string | null;
}): boolean {
  const uta = daysUntil(v.uta_expiry);
  const ura = daysUntil(v.ura_expiry);
  return (uta !== null && uta < 0) || (ura !== null && ura < 0);
}

// Gestión de vehículos: listado + alta/edición + baja soft. Avisa UTA/URA vencida.
export function VehiclesModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Vehicle | null>(null);

  const { data: vehicles, isLoading } = useVehicles();
  const deleteMut = useDeleteVehicle();

  useEffect(() => {
    if (!open) {
      setEditing(null);
      setCreating(false);
    }
  }, [open]);

  const showForm = creating || editing !== null;

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deleteMut.mutateAsync(deleteTarget.id);
      toast({ title: "Vehículo eliminado", variant: "success" });
      setDeleteTarget(null);
    } catch (e) {
      toast({
        title: "Error al eliminar",
        description: e instanceof Error ? e.message : undefined,
        variant: "error",
      });
    }
  }

  return (
    <>
      <Modal
        open={open}
        onOpenChange={onOpenChange}
        title="Vehículos"
        description="Transportes habilitados (UTA/URA) para despachar."
        className="max-w-2xl"
      >
        {showForm ? (
          <VehicleForm
            vehicle={editing}
            onDone={() => {
              setEditing(null);
              setCreating(false);
            }}
            onCancel={() => {
              setEditing(null);
              setCreating(false);
            }}
          />
        ) : (
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => setCreating(true)}>
                <Plus size={16} />
                Nuevo
              </Button>
            </div>

            {isLoading ? (
              <SpinnerBlock />
            ) : (vehicles ?? []).length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <span className="bg-primary/15 grid h-12 w-12 place-items-center rounded-lg text-primary">
                  <Truck size={22} />
                </span>
                <p className="text-sm text-muted-foreground">
                  Todavía no hay vehículos.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {(vehicles ?? []).map((v) => {
                  const expired = isVehicleExpired(v);
                  return (
                    <li
                      key={v.id}
                      className="flex items-center justify-between gap-3 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 font-medium">
                          <Money>{v.plate}</Money>
                          {expired && (
                            <span className="bg-accent/15 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-accent">
                              <AlertTriangle size={11} />
                              Habilitación vencida
                            </span>
                          )}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {v.uta_number
                            ? `UTA ${v.uta_number} · vence ${formatDate(v.uta_expiry)}`
                            : "Sin UTA"}
                          {" · "}
                          {v.ura_number
                            ? `URA ${v.ura_number} · vence ${formatDate(v.ura_expiry)}`
                            : "Sin URA"}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          onClick={() => setEditing(v)}
                          aria-label={`Editar ${v.plate}`}
                          className="rounded-md p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(v)}
                          aria-label={`Eliminar ${v.plate}`}
                          className="hover:bg-destructive/10 rounded-md p-2 text-muted-foreground transition hover:text-destructive"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Eliminar vehículo"
        description={`¿Eliminar el vehículo ${deleteTarget?.plate}? Los despachos existentes se conservan.`}
        confirmLabel="Eliminar"
        danger
        loading={deleteMut.isPending}
        onConfirm={handleDelete}
      />
    </>
  );
}

function VehicleForm({
  vehicle,
  onDone,
  onCancel,
}: {
  vehicle: Vehicle | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { toast } = useToast();
  const createMut = useCreateVehicle();
  const updateMut = useUpdateVehicle();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<VehicleInput>({
    resolver: zodResolver(vehicleSchema),
    defaultValues: {
      plate: vehicle?.plate ?? "",
      uta_number: vehicle?.uta_number ?? null,
      uta_expiry: vehicle?.uta_expiry ?? null,
      ura_number: vehicle?.ura_number ?? null,
      ura_expiry: vehicle?.ura_expiry ?? null,
      capacity_kg: vehicle?.capacity_kg ?? null,
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      if (vehicle) {
        await updateMut.mutateAsync({ id: vehicle.id, input: values });
        toast({ title: "Vehículo actualizado", variant: "success" });
      } else {
        await createMut.mutateAsync(values);
        toast({ title: "Vehículo creado", variant: "success" });
      }
      onDone();
    } catch (e) {
      toast({
        title: "Error al guardar vehículo",
        description: e instanceof Error ? e.message : undefined,
        variant: "error",
      });
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Patente"
          error={errors.plate?.message}
          {...register("plate")}
        />
        <Input
          label="Capacidad (kg)"
          type="number"
          step="any"
          placeholder="Opcional"
          error={errors.capacity_kg?.message}
          {...register("capacity_kg", {
            setValueAs: (v) => (v === "" || v === null ? null : Number(v)),
          })}
        />
      </div>

      <div className="space-y-2">
        <p className="border-b border-border pb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Permisos y habilitaciones
        </p>
        <PermitsSection entityType="vehicle" entityId={vehicle?.id ?? null} />
      </div>

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Volver
        </Button>
        <Button
          type="submit"
          loading={createMut.isPending || updateMut.isPending}
        >
          {vehicle ? "Guardar cambios" : "Crear vehículo"}
        </Button>
      </div>
    </form>
  );
}
