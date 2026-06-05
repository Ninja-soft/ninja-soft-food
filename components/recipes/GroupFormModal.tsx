"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import type { RecipeGroup } from "@/modules/recipes/api";
import { useCreateGroup, useUpdateGroup } from "@/modules/recipes/hooks";
import {
  recipeGroupSchema,
  type RecipeGroupInput,
} from "@/modules/recipes/schemas";

// Alta/edición de grupo de recetas (ej: Embutidos, Salsas, Fiambres).
export function GroupFormModal({
  open,
  onOpenChange,
  group,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  group: RecipeGroup | null;
}) {
  const { toast } = useToast();
  const createMut = useCreateGroup();
  const updateMut = useUpdateGroup();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<RecipeGroupInput>({ resolver: zodResolver(recipeGroupSchema) });

  useEffect(() => {
    if (open) reset({ name: group?.name ?? "" });
  }, [open, group, reset]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      if (group) {
        await updateMut.mutateAsync({ id: group.id, input: values });
        toast({ title: "Grupo actualizado", variant: "success" });
      } else {
        await createMut.mutateAsync(values);
        toast({ title: "Grupo creado", variant: "success" });
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
      title={group ? "Editar grupo" : "Nuevo grupo"}
      description="Carpetas para organizar recetas."
      className="max-w-sm"
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Input
          label="Nombre"
          placeholder="Ej: Embutidos, Salsas, Fiambres"
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
            {group ? "Guardar" : "Crear grupo"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
