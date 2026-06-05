"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Infinity as InfinityIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { Money } from "@/components/ui/Typography";
import { cn } from "@/lib/utils/cn";
import { daysUntil, formatDate, formatQty } from "@/lib/utils/format";
import { useCompleteProduction } from "@/modules/production/hooks";
import {
  productionSchema,
  type ProductionInput,
  type ProductionInputRow,
} from "@/modules/production/schemas";
import { useRecipes } from "@/modules/recipes/hooks";
import { useAvailableEntries } from "@/modules/stock/hooks";

const selectCls =
  "h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20";

type Assignment = {
  // por lote: cantidad tomada (puede ser 0)
  byEntry: Record<string, number>;
  // cantidad sin trazabilidad de origen ("stock infinito")
  infinite: number;
};

// Nueva producción: fórmula escalada + asignación de lotes FEFO editable.
// Supuesto (heredado de La Jamonera): la fórmula está expresada POR KG de
// producto terminado; la necesidad = cantidad de fórmula × kg a producir.
export function ProductionFormModal({
  open,
  onOpenChange,
  onCompleted,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCompleted: (traceSlug: string, code: string) => void;
}) {
  const { toast } = useToast();
  const { data: recipes } = useRecipes("", null);
  const { data: stock } = useAvailableEntries();
  const completeMut = useCompleteProduction();

  const [assignments, setAssignments] = useState<Record<string, Assignment>>(
    {},
  );
  const [assignError, setAssignError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<ProductionInput>({
    resolver: zodResolver(productionSchema),
    defaultValues: {
      recipe_id: undefined as unknown as string,
      quantity_kg: undefined as unknown as number,
      production_date: format(new Date(), "yyyy-MM-dd"),
      product_lot_number: null,
      notes: null,
    },
  });

  const recipeId = watch("recipe_id");
  const quantityKg = watch("quantity_kg");

  const recipe = useMemo(
    () => (recipes ?? []).find((r) => r.id === recipeId) ?? null,
    [recipes, recipeId],
  );

  // Necesidades por ingrediente (solo filas principales; sustitutos manual v1)
  const needs = useMemo(() => {
    if (!recipe || !quantityKg || quantityKg <= 0) return [];
    return recipe.recipe_ingredients
      .filter((ri) => !ri.is_substitute)
      .map((ri) => ({
        ingredient_id: ri.ingredient_id,
        name: ri.ingredient?.name ?? "(ingrediente)",
        unit: ri.unit,
        needed: ri.quantity * quantityKg,
      }));
  }, [recipe, quantityKg]);

  const lotsByIngredient = useMemo(() => {
    const map = new Map<string, NonNullable<typeof stock>>();
    for (const e of stock ?? []) {
      if (e.is_internal_use) continue;
      const list = map.get(e.ingredient_id) ?? [];
      list.push(e);
      map.set(e.ingredient_id, list);
    }
    return map; // ya viene FEFO (orden por vencimiento)
  }, [stock]);

  // Auto-asignación FEFO al cambiar receta/cantidad
  useEffect(() => {
    if (!open) return;
    const next: Record<string, Assignment> = {};
    for (const need of needs) {
      const lots = lotsByIngredient.get(need.ingredient_id) ?? [];
      const byEntry: Record<string, number> = {};
      let pending = need.needed;
      for (const lot of lots) {
        if (pending <= 0) break;
        const take = Math.min(pending, lot.remaining_quantity);
        byEntry[lot.id] = Math.round(take * 1000) / 1000;
        pending -= take;
      }
      next[need.ingredient_id] = {
        byEntry,
        infinite: pending > 0 ? Math.round(pending * 1000) / 1000 : 0,
      };
    }
    setAssignments(next);
    setAssignError(null);
  }, [open, needs, lotsByIngredient]);

  useEffect(() => {
    if (!open) return;
    reset({
      recipe_id: undefined as unknown as string,
      quantity_kg: undefined as unknown as number,
      production_date: format(new Date(), "yyyy-MM-dd"),
      product_lot_number: null,
      notes: null,
    });
    setAssignments({});
    setAssignError(null);
  }, [open, reset]);

  function setEntryQty(ingredientId: string, entryId: string, qty: number) {
    setAssignments((prev) => ({
      ...prev,
      [ingredientId]: {
        infinite: prev[ingredientId]?.infinite ?? 0,
        byEntry: { ...(prev[ingredientId]?.byEntry ?? {}), [entryId]: qty },
      },
    }));
  }

  function setInfinite(ingredientId: string, qty: number) {
    setAssignments((prev) => ({
      ...prev,
      [ingredientId]: {
        byEntry: prev[ingredientId]?.byEntry ?? {},
        infinite: qty,
      },
    }));
  }

  const onSubmit = handleSubmit(async (values) => {
    // Validar asignaciones y armar inputs
    const rows: ProductionInputRow[] = [];
    for (const need of needs) {
      const a = assignments[need.ingredient_id] ?? { byEntry: {}, infinite: 0 };
      let assigned = 0;
      for (const [entryId, qty] of Object.entries(a.byEntry)) {
        if (!qty || qty <= 0) continue;
        const lot = (lotsByIngredient.get(need.ingredient_id) ?? []).find(
          (l) => l.id === entryId,
        );
        if (lot && qty > lot.remaining_quantity) {
          setAssignError(
            `${need.name}: el lote ${lot.lot_number} no tiene ${formatQty(qty)} ${need.unit} disponibles`,
          );
          return;
        }
        assigned += qty;
        rows.push({
          ingredient_id: need.ingredient_id,
          stock_entry_id: entryId,
          taken_qty: qty,
          is_substitute: false,
          source_ingredient_id: null,
        });
      }
      if (a.infinite > 0) {
        assigned += a.infinite;
        rows.push({
          ingredient_id: need.ingredient_id,
          stock_entry_id: null,
          taken_qty: a.infinite,
          is_substitute: false,
          source_ingredient_id: null,
        });
      }
      if (Math.abs(assigned - need.needed) > 0.001) {
        setAssignError(
          `${need.name}: asignaste ${formatQty(assigned)} de ${formatQty(need.needed)} ${need.unit} necesarios`,
        );
        return;
      }
    }
    setAssignError(null);

    try {
      const result = await completeMut.mutateAsync({ input: values, inputs: rows });
      toast({
        title: `Producción ${result.code} completada`,
        description: `Lote ${result.product_lot} · vence ${formatDate(result.expiry_date)}`,
        variant: "success",
      });
      onOpenChange(false);
      onCompleted(result.trace_slug, result.code);
    } catch (e) {
      toast({
        title: "Error al completar producción",
        description: e instanceof Error ? e.message : undefined,
        variant: "error",
      });
    }
  });

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Nueva producción"
      description="Consume lotes de materia prima y genera el lote del producto."
      className="max-w-2xl"
    >
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 sm:col-span-1">
            <label className="mb-2 block text-sm font-medium text-muted-foreground">
              Receta
            </label>
            <select className={selectCls} {...register("recipe_id")}>
              <option value="">Elegir receta…</option>
              {(recipes ?? []).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title}
                </option>
              ))}
            </select>
            {errors.recipe_id && (
              <p className="mt-2 text-sm text-destructive">
                {errors.recipe_id.message}
              </p>
            )}
          </div>
          <Input
            label="Cantidad a producir (kg)"
            type="number"
            step="any"
            error={errors.quantity_kg?.message}
            {...register("quantity_kg", {
              setValueAs: (v) => (v === "" ? undefined : Number(v)),
            })}
          />
          <Input
            label="Fecha de producción"
            type="date"
            error={errors.production_date?.message}
            {...register("production_date")}
          />
          <Input
            label="Lote del producto"
            placeholder="Auto si lo dejás vacío"
            error={errors.product_lot_number?.message}
            {...register("product_lot_number")}
          />
        </div>

        {/* Asignación de lotes */}
        {needs.length > 0 && (
          <div className="space-y-3">
            <p className="border-b border-border pb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Lotes a consumir (sugerencia FEFO editable)
            </p>
            {needs.map((need) => {
              const lots = lotsByIngredient.get(need.ingredient_id) ?? [];
              const a = assignments[need.ingredient_id] ?? {
                byEntry: {},
                infinite: 0,
              };
              const assigned =
                Object.values(a.byEntry).reduce((s, q) => s + (q || 0), 0) +
                (a.infinite || 0);
              const ok = Math.abs(assigned - need.needed) <= 0.001;
              return (
                <div
                  key={need.ingredient_id}
                  className={cn(
                    "rounded-md border p-3",
                    ok ? "border-border" : "border-accent/50 bg-accent/5",
                  )}
                >
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="font-semibold">{need.name}</span>
                    <span
                      className={cn(
                        "text-xs",
                        ok ? "text-primary" : "text-accent",
                      )}
                    >
                      <Money>
                        {formatQty(assigned)} / {formatQty(need.needed)}{" "}
                        {need.unit}
                      </Money>
                    </span>
                  </div>
                  {lots.length === 0 && (
                    <p className="mb-2 text-xs text-muted-foreground">
                      Sin lotes disponibles: usá stock sin origen o cargá un
                      ingreso primero.
                    </p>
                  )}
                  <div className="space-y-1.5">
                    {lots.map((lot) => {
                      const d = daysUntil(lot.expiry_date);
                      return (
                        <div
                          key={lot.id}
                          className="grid grid-cols-[1fr_120px] items-center gap-2 text-xs"
                        >
                          <span className="truncate text-muted-foreground">
                            <Money>{lot.lot_number}</Money>
                            {" · disp. "}
                            <Money>
                              {formatQty(lot.remaining_quantity)} {lot.unit}
                            </Money>
                            {lot.expiry_date && (
                              <span
                                className={cn(
                                  "ml-1",
                                  d !== null && d < 0 && "text-destructive",
                                  d !== null &&
                                    d >= 0 &&
                                    d <= 2 &&
                                    "text-accent",
                                )}
                              >
                                · vence {formatDate(lot.expiry_date)}
                              </span>
                            )}
                          </span>
                          <input
                            aria-label={`Cantidad del lote ${lot.lot_number}`}
                            type="number"
                            step="any"
                            min={0}
                            value={a.byEntry[lot.id] ?? ""}
                            onChange={(e) =>
                              setEntryQty(
                                need.ingredient_id,
                                lot.id,
                                Number(e.target.value),
                              )
                            }
                            className="h-9 w-full rounded-lg border border-input bg-background px-3 text-right text-xs outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                          />
                        </div>
                      );
                    })}
                    {/* Stock sin origen (caja chica) */}
                    <div className="grid grid-cols-[1fr_120px] items-center gap-2 text-xs">
                      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                        <InfinityIcon size={13} className="text-accent" />
                        Sin trazabilidad de origen (caja chica)
                      </span>
                      <input
                        aria-label="Cantidad sin origen"
                        type="number"
                        step="any"
                        min={0}
                        value={a.infinite || ""}
                        onChange={(e) =>
                          setInfinite(need.ingredient_id, Number(e.target.value))
                        }
                        className="h-9 w-full rounded-lg border border-dashed border-input bg-background px-3 text-right text-xs outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {recipe && needs.length === 0 && (
          <p className="rounded-md border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
            Esta receta no tiene fórmula cargada: la producción se registra sin
            consumo de lotes.
          </p>
        )}

        <Input
          label="Notas"
          placeholder="Observaciones (opcional)"
          error={errors.notes?.message}
          {...register("notes")}
        />

        {assignError && (
          <p className="text-sm text-destructive">{assignError}</p>
        )}

        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button type="submit" loading={completeMut.isPending}>
            Completar producción
          </Button>
        </div>
      </form>
    </Modal>
  );
}
