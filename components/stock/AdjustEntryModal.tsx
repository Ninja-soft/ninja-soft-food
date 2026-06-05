"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { formatQty } from "@/lib/utils/format";
import type { StockEntry } from "@/modules/stock/api";
import { useAdjustEntry } from "@/modules/stock/hooks";
import { adjustSchema, type AdjustInput } from "@/modules/stock/schemas";

// Ajuste manual de un lote: motivo obligatorio (queda en el ledger).
export function AdjustEntryModal({
  entry,
  onClose,
}: {
  entry: StockEntry | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const adjustMut = useAdjustEntry();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AdjustInput>({ resolver: zodResolver(adjustSchema) });

  useEffect(() => {
    if (entry) reset({ delta: undefined as unknown as number, reason: "" });
  }, [entry, reset]);

  const onSubmit = handleSubmit(async (values) => {
    if (!entry) return;
    try {
      await adjustMut.mutateAsync({
        entryId: entry.id,
        delta: values.delta,
        reason: values.reason,
      });
      toast({ title: "Ajuste registrado", variant: "success" });
      onClose();
    } catch (e) {
      toast({
        title: "Error al ajustar",
        description: e instanceof Error ? e.message : undefined,
        variant: "error",
      });
    }
  });

  return (
    <Modal
      open={!!entry}
      onOpenChange={(o) => !o && onClose()}
      title="Ajustar lote"
      description={
        entry
          ? `${entry.ingredient?.name ?? ""} · lote ${entry.lot_number} · disponible ${formatQty(entry.remaining_quantity)} ${entry.unit}`
          : undefined
      }
      className="max-w-sm"
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Input
          label={`Cantidad (+ suma / - resta, en ${entry?.unit ?? ""})`}
          type="number"
          step="any"
          placeholder="Ej: -2.5"
          autoFocus
          error={errors.delta?.message}
          {...register("delta", {
            setValueAs: (v) => (v === "" ? undefined : Number(v)),
          })}
        />
        <Input
          label="Motivo (obligatorio, queda en auditoría)"
          placeholder="Ej: merma por rotura de envase"
          error={errors.reason?.message}
          {...register("reason")}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={adjustMut.isPending}>
            Registrar ajuste
          </Button>
        </div>
      </form>
    </Modal>
  );
}
