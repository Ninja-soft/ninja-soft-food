"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Switch } from "@/components/ui/Switch";
import { useToast } from "@/components/ui/Toast";
import { useUpdatePlan } from "@/modules/internal/hooks";
import type { InternalPlan } from "@/modules/internal/api";
import { MAX_PRICE } from "@/modules/internal/plans";

// Modal de edición de precios de un plan (panel staff). Inputs numéricos crudos
// (sin formato de moneda mientras se edita); la lista los muestra formateados.
// La mutación va por route handler admin (requireInternal + level admin).

/** Parsea el input crudo a precio: vacío → null (a medida); si no, entero. */
function parsePriceInput(raw: string): { value: number | null; error?: string } {
  const trimmed = raw.trim();
  if (trimmed === "") return { value: null };
  if (!/^\d+$/.test(trimmed)) {
    return { value: null, error: "Solo números enteros (vacío = a medida)" };
  }
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n <= 0) {
    return { value: null, error: "Debe ser mayor a cero" };
  }
  if (n > MAX_PRICE) {
    return { value: null, error: "Supera el máximo permitido" };
  }
  return { value: n };
}

export function PlanEditorModal({
  plan,
  open,
  onOpenChange,
}: {
  plan: InternalPlan;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { toast } = useToast();
  const update = useUpdatePlan();

  const [monthly, setMonthly] = useState("");
  const [yearly, setYearly] = useState("");
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (open) {
      setMonthly(plan.monthlyPriceArs != null ? String(plan.monthlyPriceArs) : "");
      setYearly(plan.yearlyPriceArs != null ? String(plan.yearlyPriceArs) : "");
      setActive(plan.isActive);
    }
  }, [open, plan]);

  const monthlyParsed = parsePriceInput(monthly);
  const yearlyParsed = parsePriceInput(yearly);
  const hasError = Boolean(monthlyParsed.error || yearlyParsed.error);

  function onSave() {
    if (hasError) return;
    update.mutate(
      {
        plan_id: plan.id,
        monthly_price_ars: monthlyParsed.value,
        yearly_price_ars: yearlyParsed.value,
        is_active: active,
      },
      {
        onSuccess: () => {
          toast({ title: "Plan actualizado", variant: "success" });
          onOpenChange(false);
        },
        onError: (e) =>
          toast({
            title: "No se pudo actualizar",
            description: e instanceof Error ? e.message : undefined,
            variant: "error",
          }),
      },
    );
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={`Editar precios · ${plan.name}`}
      className="max-w-md"
    >
      <div className="space-y-5">
        <p className="text-sm text-muted-foreground">
          Precios en pesos argentinos. Dejá un campo vacío para que el plan quede{" "}
          <span className="font-medium text-foreground">a medida</span> (no aparece
          para autogestión). El precio en USD se mantiene como referencia y no se
          edita acá.
        </p>

        <Input
          label="Precio mensual (ARS)"
          inputMode="numeric"
          value={monthly}
          onChange={(e) => setMonthly(e.target.value)}
          placeholder="Vacío = a medida"
          error={monthlyParsed.error}
          hint={!monthlyParsed.error ? "Entero, sin decimales ni separadores" : undefined}
        />

        <Input
          label="Precio anual (ARS)"
          inputMode="numeric"
          value={yearly}
          onChange={(e) => setYearly(e.target.value)}
          placeholder="Vacío = a medida"
          error={yearlyParsed.error}
          hint={
            !yearlyParsed.error
              ? "Convención comercial: anual ≈ 10 meses (no obligatorio)"
              : undefined
          }
        />

        <div className="flex items-center justify-between rounded-ninjaMd border border-border bg-muted/30 px-4 py-3">
          <div>
            <div className="text-sm font-medium text-foreground">Plan activo</div>
            <div className="text-xs text-muted-foreground">
              Si se desactiva, no aparece en el catálogo de suscripción.
            </div>
          </div>
          <Switch checked={active} onCheckedChange={setActive} label="Plan activo" />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={onSave}
            loading={update.isPending}
            disabled={hasError || update.isPending}
          >
            Guardar cambios
          </Button>
        </div>
      </div>
    </Modal>
  );
}
