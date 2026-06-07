"use client";

import { useState } from "react";
import {
  Building2,
  Factory,
  MapPin,
  Pencil,
  Plus,
  Sparkles,
  Star,
  Trash2,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { SpinnerBlock } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { PermitsSection } from "@/components/permits/PermitsSection";
import { useMySubscription } from "@/modules/billing/hooks";
import { limitFor } from "@/lib/billing/limits";
import type { Establishment } from "@/modules/establishments/api";
import {
  useCreateEstablishment,
  useDeleteEstablishment,
  useEstablishments,
  useSetDefaultEstablishment,
  useUpdateEstablishment,
} from "@/modules/establishments/hooks";
import {
  establishmentSchema,
  type EstablishmentInput,
} from "@/modules/establishments/schemas";
import { cn } from "@/lib/utils/cn";

// Configuración → Establecimientos. Gestión de las plantas del tenant (plan
// Industria). Listado + alta/edición/borrado con tope de plan; marcar default;
// permisos regulatorios (RNE/RUCA) embebidos en la edición vía PermitsSection.
export function EstablishmentsCard({
  onUpgrade,
}: {
  onUpgrade?: () => void;
}) {
  const { toast } = useToast();
  const { data: establishments, isLoading } = useEstablishments();
  const { data: sub } = useMySubscription();
  const setDefaultMut = useSetDefaultEstablishment();
  const deleteMut = useDeleteEstablishment();

  const [formTarget, setFormTarget] = useState<Establishment | "new" | null>(
    null,
  );
  const [deleteTarget, setDeleteTarget] = useState<Establishment | null>(null);

  const list = establishments ?? [];
  const limit = sub?.plan?.limits
    ? limitFor(sub.plan.limits, "establishments")
    : null;
  const used = list.length;
  const reached = limit !== null && used >= limit;

  async function handleSetDefault(e: Establishment) {
    if (e.is_default) return;
    try {
      await setDefaultMut.mutateAsync(e.id);
      toast({ title: `${e.name} es ahora la planta por defecto`, variant: "success" });
    } catch (err) {
      toast({
        title: "No se pudo marcar como predeterminada",
        description: err instanceof Error ? err.message : undefined,
        variant: "error",
      });
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deleteMut.mutateAsync(deleteTarget.id);
      toast({ title: "Establecimiento eliminado", variant: "success" });
      setDeleteTarget(null);
    } catch (err) {
      toast({
        title: "No se pudo eliminar",
        description: err instanceof Error ? err.message : undefined,
        variant: "error",
      });
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="relative">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />
        <CardContent className="relative space-y-5 p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Factory size={15} />
                Plantas y establecimientos
              </div>
              <h3 className="font-display text-2xl font-extrabold tracking-tight">
                Establecimientos
              </h3>
              <p className="max-w-prose text-sm text-muted-foreground">
                Cada planta lleva su propio stock, producción y despacho. La
                marcada por defecto se usa para los datos cargados antes de elegir
                una planta activa.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              {limit !== null && (
                <span className="rounded-full border border-border bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
                  <span className="font-price font-semibold text-foreground tabular-nums">
                    {used}
                  </span>{" "}
                  / {limit}
                </span>
              )}
              <Button
                size="sm"
                onClick={() => setFormTarget("new")}
                disabled={reached}
              >
                <Plus size={15} />
                Nuevo
              </Button>
            </div>
          </div>

          {/* Banner soft-block al llegar al tope del plan */}
          {reached && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ninja-lime/30 bg-ninja-lime/5 px-4 py-3 text-sm">
              <span className="flex items-center gap-2 text-muted-foreground">
                <Sparkles size={15} className="text-ninja-lime" />
                Alcanzaste el máximo de establecimientos de tu plan.
              </span>
              {onUpgrade && (
                <Button variant="secondary" size="sm" onClick={onUpgrade}>
                  Ver planes
                </Button>
              )}
            </div>
          )}

          {/* Listado */}
          {isLoading ? (
            <SpinnerBlock />
          ) : list.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-10 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-lg bg-primary/10 text-primary">
                <Building2 size={22} />
              </span>
              <div>
                <p className="text-sm font-semibold">Sin establecimientos</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Registrá tu primera planta para separar stock y producción.
                </p>
              </div>
              <Button size="sm" onClick={() => setFormTarget("new")}>
                <Plus size={15} />
                Nuevo establecimiento
              </Button>
            </div>
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
              {list.map((e) => (
                <li
                  key={e.id}
                  className="flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-secondary/30"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className={cn(
                        "grid h-9 w-9 shrink-0 place-items-center rounded-lg",
                        e.is_default
                          ? "bg-primary/15 text-primary"
                          : "bg-muted/60 text-muted-foreground",
                      )}
                    >
                      <Factory size={16} />
                    </span>
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-sm font-medium">
                        <span className="truncate">{e.name}</span>
                        {e.is_default && (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">
                            <Star size={10} />
                            Por defecto
                          </span>
                        )}
                      </p>
                      {(e.address || e.locality) && (
                        <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                          <MapPin size={11} className="shrink-0" />
                          {[e.address, e.locality].filter(Boolean).join(" · ")}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {!e.is_default && (
                      <button
                        type="button"
                        onClick={() => handleSetDefault(e)}
                        disabled={setDefaultMut.isPending}
                        className="rounded-md px-2 py-1.5 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
                      >
                        Marcar por defecto
                      </button>
                    )}
                    <button
                      type="button"
                      aria-label="Editar establecimiento"
                      onClick={() => setFormTarget(e)}
                      className="rounded-md p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      aria-label="Eliminar establecimiento"
                      onClick={() => setDeleteTarget(e)}
                      disabled={e.is_default || list.length === 1}
                      title={
                        e.is_default
                          ? "No se puede eliminar la planta por defecto"
                          : list.length === 1
                            ? "Debe quedar al menos un establecimiento"
                            : undefined
                      }
                      className="hover:bg-destructive/10 rounded-md p-2 text-muted-foreground transition hover:text-destructive disabled:pointer-events-none disabled:opacity-40"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </div>

      <EstablishmentFormModal
        target={formTarget}
        onClose={() => setFormTarget(null)}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Eliminar establecimiento"
        description={
          deleteTarget
            ? `Se eliminará "${deleteTarget.name}". El stock, las producciones y los despachos asociados se conservan en el historial. ¿Confirmás?`
            : undefined
        }
        confirmLabel="Sí, eliminar"
        cancelLabel="No"
        danger
        loading={deleteMut.isPending}
        onConfirm={() => handleDelete()}
      />
    </Card>
  );
}

// ── Modal de alta/edición (con permisos embebidos en edición) ─────────────────

function EstablishmentFormModal({
  target,
  onClose,
}: {
  target: Establishment | "new" | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const createMut = useCreateEstablishment();
  const updateMut = useUpdateEstablishment();

  const editing = target && target !== "new" ? target : null;
  const open = target !== null;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<EstablishmentInput>({
    resolver: zodResolver(establishmentSchema),
    values: {
      name: editing?.name ?? "",
      address: editing?.address ?? null,
      locality: editing?.locality ?? null,
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      if (editing) {
        await updateMut.mutateAsync({ id: editing.id, input: values });
        toast({ title: "Establecimiento actualizado", variant: "success" });
      } else {
        await createMut.mutateAsync(values);
        toast({ title: "Establecimiento creado", variant: "success" });
        reset({ name: "", address: null, locality: null });
        onClose();
        return;
      }
    } catch (e) {
      toast({
        title: "No se pudo guardar",
        description: e instanceof Error ? e.message : undefined,
        variant: "error",
      });
    }
  });

  return (
    <Modal
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={editing ? "Editar establecimiento" : "Nuevo establecimiento"}
      description="Una planta del tenant con su propio stock y producción."
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Input
          label="Nombre"
          placeholder="Planta Central"
          error={errors.name?.message}
          {...register("name")}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Dirección"
            placeholder="Opcional"
            error={errors.address?.message}
            {...register("address", {
              setValueAs: (v) => (v === "" ? null : v),
            })}
          />
          <Input
            label="Localidad"
            placeholder="Opcional"
            error={errors.locality?.message}
            {...register("locality", {
              setValueAs: (v) => (v === "" ? null : v),
            })}
          />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            {editing ? "Cerrar" : "Cancelar"}
          </Button>
          <Button
            type="submit"
            loading={createMut.isPending || updateMut.isPending}
          >
            {editing ? "Guardar cambios" : "Crear establecimiento"}
          </Button>
        </div>
      </form>

      {/* Permisos y habilitaciones (RNE/RUCA): solo en edición, requieren un
          establishment_id ya persistido. */}
      {editing && (
        <div className="mt-6 space-y-3 border-t border-border pt-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Permisos y habilitaciones
          </p>
          <PermitsSection entityType="establishment" entityId={editing.id} />
        </div>
      )}
    </Modal>
  );
}
