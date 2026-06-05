"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import type { Family } from "@/modules/ingredients/api";
import { useCreateFamily, useUpdateFamily } from "@/modules/ingredients/hooks";
import { familySchema, type FamilyInput } from "@/modules/ingredients/schemas";

// Alta/edición de familia de ingredientes.
export function FamilyFormModal({
  open,
  onOpenChange,
  family,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  family: Family | null; // null = crear
}) {
  const { toast } = useToast();
  const createMut = useCreateFamily();
  const updateMut = useUpdateFamily();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FamilyInput>({ resolver: zodResolver(familySchema) });

  useEffect(() => {
    if (open) reset({ name: family?.name ?? "" });
  }, [open, family, reset]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      if (family) {
        await updateMut.mutateAsync({ id: family.id, input: values });
        toast({ title: "Familia actualizada", variant: "success" });
      } else {
        await createMut.mutateAsync(values);
        toast({ title: "Familia creada", variant: "success" });
      }
      onOpenChange(false);
    } catch (e) {
      toast({
        title: "Error al guardar",
        description: e instanceof Error ? e.message : undefined,
        variant: "error",
      });
    }
  });

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={family ? "Editar familia" : "Nueva familia"}
      description="Agrupa ingredientes para encontrarlos rápido."
      className="max-w-sm"
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Input
          label="Nombre"
          placeholder="Ej: Carnes, Condimentos, Aditivos"
          autoFocus
          error={errors.name?.message}
          {...register("name")}
        />
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            loading={createMut.isPending || updateMut.isPending}
          >
            {family ? "Guardar" : "Crear familia"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
