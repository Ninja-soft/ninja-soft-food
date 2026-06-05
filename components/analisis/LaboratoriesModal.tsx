"use client";

import { useEffect, useState } from "react";
import { FlaskConical, Pencil, Plus, Trash2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { SpinnerBlock } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import type { Laboratory } from "@/modules/quality/api";
import {
  useCreateLaboratory,
  useDeleteLaboratory,
  useLaboratories,
  useUpdateLaboratory,
} from "@/modules/quality/hooks";
import {
  laboratorySchema,
  type LaboratoryInput,
} from "@/modules/quality/schemas";

// Gestión del catálogo de laboratorios del tenant: listado + alta/edición + baja.
export function LaboratoriesModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState<Laboratory | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Laboratory | null>(null);

  const { data: labs, isLoading } = useLaboratories();
  const deleteMut = useDeleteLaboratory();

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
      toast({ title: "Laboratorio eliminado", variant: "success" });
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
        title="Laboratorios"
        description="Catálogo de laboratorios que firman tus análisis."
        className="max-w-2xl"
      >
        {showForm ? (
          <LaboratoryForm
            laboratory={editing}
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
            ) : (labs ?? []).length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <span className="bg-primary/15 grid h-12 w-12 place-items-center rounded-ninjaMd text-primary">
                  <FlaskConical size={22} />
                </span>
                <p className="text-sm text-muted-foreground">
                  Todavía no hay laboratorios cargados.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border rounded-ninjaMd border border-border">
                {(labs ?? []).map((l) => (
                  <li
                    key={l.id}
                    className="flex items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{l.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[l.contact.email, l.contact.phone]
                          .filter(Boolean)
                          .join(" · ") || "Sin datos de contacto"}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() => setEditing(l)}
                        aria-label={`Editar ${l.name}`}
                        className="rounded-md p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(l)}
                        aria-label={`Eliminar ${l.name}`}
                        className="hover:bg-destructive/10 rounded-md p-2 text-muted-foreground transition hover:text-destructive"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Eliminar laboratorio"
        description={`¿Eliminar a ${deleteTarget?.name}? Los análisis existentes se conservan.`}
        confirmLabel="Eliminar"
        danger
        loading={deleteMut.isPending}
        onConfirm={handleDelete}
      />
    </>
  );
}

function LaboratoryForm({
  laboratory,
  onDone,
  onCancel,
}: {
  laboratory: Laboratory | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { toast } = useToast();
  const createMut = useCreateLaboratory();
  const updateMut = useUpdateLaboratory();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LaboratoryInput>({
    resolver: zodResolver(laboratorySchema),
    defaultValues: {
      name: laboratory?.name ?? "",
      contact: {
        phone: laboratory?.contact.phone ?? null,
        email: laboratory?.contact.email ?? null,
      },
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      if (laboratory) {
        await updateMut.mutateAsync({ id: laboratory.id, input: values });
        toast({ title: "Laboratorio actualizado", variant: "success" });
      } else {
        await createMut.mutateAsync(values);
        toast({ title: "Laboratorio creado", variant: "success" });
      }
      onDone();
    } catch (e) {
      toast({
        title: "Error al guardar laboratorio",
        description: e instanceof Error ? e.message : undefined,
        variant: "error",
      });
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <Input
        label="Nombre del laboratorio"
        error={errors.name?.message}
        {...register("name")}
      />
      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Email"
          type="email"
          placeholder="Opcional"
          error={errors.contact?.email?.message}
          {...register("contact.email", {
            setValueAs: (v) => (v === "" ? null : v),
          })}
        />
        <Input
          label="Teléfono"
          placeholder="Opcional"
          error={errors.contact?.phone?.message}
          {...register("contact.phone", {
            setValueAs: (v) => (v === "" ? null : v),
          })}
        />
      </div>
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Volver
        </Button>
        <Button
          type="submit"
          loading={createMut.isPending || updateMut.isPending}
        >
          {laboratory ? "Guardar cambios" : "Crear laboratorio"}
        </Button>
      </div>
    </form>
  );
}
