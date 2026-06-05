"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, Plus, Trash2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Switch } from "@/components/ui/Switch";
import { useToast } from "@/components/ui/Toast";
import { useIngredients } from "@/modules/ingredients/hooks";
import { uploadRecipeImage, type Recipe } from "@/modules/recipes/api";
import {
  useCreateRecipe,
  useRecipeGroups,
  useUpdateRecipe,
} from "@/modules/recipes/hooks";
import {
  FOOD_CATEGORIES,
  FRONT_LABELS,
  PACKAGING_DELAYS,
  PRODUCT_TYPES,
  recipeSchema,
  type RecipeIngredientInput,
  type RecipeInput,
} from "@/modules/recipes/schemas";
import { cn } from "@/lib/utils/cn";

type FormulaRow = RecipeIngredientInput & { key: string };

const selectCls =
  "h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="border-b border-border pb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
      {children}
    </p>
  );
}

// Alta/edición de receta: ficha completa heredada de La Jamonera.
export function RecipeFormModal({
  open,
  onOpenChange,
  recipe,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  recipe: Recipe | null;
}) {
  const { toast } = useToast();
  const { data: groups } = useRecipeGroups();
  const { data: ingredients } = useIngredients("", null);
  const createMut = useCreateRecipe();
  const updateMut = useUpdateRecipe();

  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [formula, setFormula] = useState<FormulaRow[]>([]);
  const [formulaError, setFormulaError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<RecipeInput>({
    resolver: zodResolver(recipeSchema),
    defaultValues: {
      title: "",
      commercial_name: null,
      group_id: null,
      category: "otros",
      product_type: "solido",
      description: null,
      shelf_life_days: 30,
      aging_days: 0,
      packaging_delay_type: "none",
      rnpa_number: null,
      rnpa_expiry: null,
      rnpa_exempt: false,
      rnpa_exempt_reason: null,
      front_labels: [],
      nutrition: {
        calories: null,
        proteins: null,
        fats: null,
        carbs: null,
        sodium: null,
      },
    },
  });

  const packagingDelay = watch("packaging_delay_type");
  const rnpaExempt = watch("rnpa_exempt");
  const frontLabels = watch("front_labels");

  useEffect(() => {
    if (!open) return;
    setFile(null);
    setPreview(recipe?.image_url ?? null);
    setFormulaError(null);
    setFormula(
      (recipe?.recipe_ingredients ?? []).map((ri) => ({
        key: ri.id,
        ingredient_id: ri.ingredient_id,
        quantity: ri.quantity,
        unit: ri.unit,
        is_substitute: ri.is_substitute,
        source_ingredient_id: ri.source_ingredient_id,
      })),
    );
    reset({
      title: recipe?.title ?? "",
      commercial_name: recipe?.commercial_name ?? null,
      group_id: recipe?.group_id ?? null,
      category: (recipe?.category as RecipeInput["category"]) ?? "otros",
      product_type:
        (recipe?.product_type as RecipeInput["product_type"]) ?? "solido",
      description: recipe?.description ?? null,
      shelf_life_days: recipe?.shelf_life_days ?? 30,
      aging_days: recipe?.aging_days ?? 0,
      packaging_delay_type: recipe?.packaging_delay_type ?? "none",
      rnpa_number: recipe?.rnpa_number ?? null,
      rnpa_expiry: recipe?.rnpa_expiry ?? null,
      rnpa_exempt: recipe?.rnpa_exempt ?? false,
      rnpa_exempt_reason: recipe?.rnpa_exempt_reason ?? null,
      front_labels: recipe?.front_labels ?? [],
      nutrition: {
        calories: recipe?.nutrition?.calories ?? null,
        proteins: recipe?.nutrition?.proteins ?? null,
        fats: recipe?.nutrition?.fats ?? null,
        carbs: recipe?.nutrition?.carbs ?? null,
        sodium: recipe?.nutrition?.sodium ?? null,
      },
    });
  }, [open, recipe, reset]);

  const ingredientById = useMemo(() => {
    const map = new Map((ingredients ?? []).map((i) => [i.id, i]));
    return map;
  }, [ingredients]);

  function addFormulaRow() {
    setFormula((rows) => [
      ...rows,
      {
        key: crypto.randomUUID(),
        ingredient_id: "" as string,
        quantity: 0,
        unit: "",
        is_substitute: false,
        source_ingredient_id: null,
      },
    ]);
  }

  function updateRow(key: string, patch: Partial<FormulaRow>) {
    setFormula((rows) =>
      rows.map((r) => (r.key === key ? { ...r, ...patch } : r)),
    );
  }

  function toggleFrontLabel(value: string) {
    const current = frontLabels ?? [];
    setValue(
      "front_labels",
      current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value],
    );
  }

  const onSubmit = handleSubmit(async (values) => {
    // Validación de fórmula
    const cleanRows: RecipeIngredientInput[] = [];
    for (const row of formula) {
      if (!row.ingredient_id) {
        setFormulaError("Hay filas sin ingrediente elegido");
        return;
      }
      if (!row.quantity || row.quantity <= 0) {
        setFormulaError("Hay cantidades inválidas en la fórmula");
        return;
      }
      const ing = ingredientById.get(row.ingredient_id);
      cleanRows.push({
        ingredient_id: row.ingredient_id,
        quantity: row.quantity,
        unit: ing?.unit ?? row.unit ?? "kg",
        is_substitute: row.is_substitute,
        source_ingredient_id: row.is_substitute
          ? row.source_ingredient_id
          : null,
      });
    }
    setFormulaError(null);

    try {
      let image_url = recipe?.image_url ?? null;
      if (file) {
        setUploading(true);
        image_url = await uploadRecipeImage(file);
      }
      if (recipe) {
        await updateMut.mutateAsync({
          id: recipe.id,
          input: { ...values, image_url },
          ingredients: cleanRows,
        });
        toast({ title: "Receta actualizada", variant: "success" });
      } else {
        await createMut.mutateAsync({
          input: { ...values, image_url },
          ingredients: cleanRows,
        });
        toast({ title: "Receta creada", variant: "success" });
      }
      onOpenChange(false);
    } catch (e) {
      toast({
        title: "Error al guardar",
        description: e instanceof Error ? e.message : undefined,
        variant: "error",
      });
    } finally {
      setUploading(false);
    }
  });

  const saving = uploading || createMut.isPending || updateMut.isPending;

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={recipe ? "Editar receta" : "Nueva receta"}
      description="Ficha técnica del producto elaborado."
      className="max-w-2xl"
    >
      <form onSubmit={onSubmit} className="space-y-6" noValidate>
        {/* Datos básicos */}
        <div className="space-y-4">
          <SectionTitle>Producto</SectionTitle>
          <div className="flex items-start gap-4">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-lg border border-dashed border-border bg-muted/40 text-muted-foreground transition hover:border-primary hover:text-primary"
              aria-label="Subir foto"
            >
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="" className="h-full w-full object-cover" />
              ) : (
                <ImagePlus size={24} />
              )}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                if (f.size > 5 * 1024 * 1024) {
                  toast({
                    title: "Imagen muy pesada",
                    description: "Máximo 5 MB",
                    variant: "error",
                  });
                  return;
                }
                setFile(f);
                setPreview(URL.createObjectURL(f));
              }}
            />
            <div className="grid flex-1 gap-3">
              <Input
                label="Nombre interno"
                placeholder="Ej: Bondiola curada"
                error={errors.title?.message}
                {...register("title")}
              />
              <Input
                label="Nombre comercial"
                placeholder="Como figura en el rótulo (opcional)"
                error={errors.commercial_name?.message}
                {...register("commercial_name")}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-2 block text-sm font-medium text-muted-foreground">
                Grupo
              </label>
              <select
                className={selectCls}
                {...register("group_id", {
                  setValueAs: (v) => (v === "" ? null : v),
                })}
              >
                <option value="">Sin grupo</option>
                {(groups ?? []).map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-muted-foreground">
                Categoría (CAA)
              </label>
              <select className={selectCls} {...register("category")}>
                {FOOD_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-muted-foreground">
                Tipo
              </label>
              <select className={selectCls} {...register("product_type")}>
                {PRODUCT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <Input
            label="Descripción técnica"
            placeholder="Especificaciones del producto (opcional)"
            error={errors.description?.message}
            {...register("description")}
          />
        </div>

        {/* Fórmula */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <SectionTitle>Fórmula</SectionTitle>
            <Button type="button" variant="secondary" size="sm" onClick={addFormulaRow}>
              <Plus size={14} />
              Ingrediente
            </Button>
          </div>
          {formula.length === 0 && (
            <p className="rounded-md border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
              Sin ingredientes todavía. La fórmula define qué lotes se consumen
              al producir.
            </p>
          )}
          {formula.map((row) => {
            const ing = ingredientById.get(row.ingredient_id);
            return (
              <div
                key={row.key}
                className={cn(
                  "grid grid-cols-[1fr_110px_auto_auto] items-center gap-2 rounded-md border border-border p-2",
                  row.is_substitute && "border-accent/40 bg-accent/5",
                )}
              >
                <select
                  aria-label="Ingrediente"
                  className={cn(selectCls, "h-10")}
                  value={row.ingredient_id}
                  onChange={(e) =>
                    updateRow(row.key, {
                      ingredient_id: e.target.value,
                      unit: ingredientById.get(e.target.value)?.unit ?? "",
                    })
                  }
                >
                  <option value="">Elegir…</option>
                  {(ingredients ?? []).map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </select>
                <div className="relative">
                  <input
                    aria-label="Cantidad"
                    type="number"
                    step="any"
                    placeholder="Cant."
                    value={row.quantity || ""}
                    onChange={(e) =>
                      updateRow(row.key, { quantity: Number(e.target.value) })
                    }
                    className="h-10 w-full rounded-lg border border-input bg-background px-3 pr-10 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    {ing?.unit ?? ""}
                  </span>
                </div>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={row.is_substitute}
                    onChange={(e) =>
                      updateRow(row.key, {
                        is_substitute: e.target.checked,
                        source_ingredient_id: null,
                      })
                    }
                    className="h-3.5 w-3.5 accent-[var(--primary)]"
                  />
                  Sustituto
                </label>
                <button
                  type="button"
                  aria-label="Quitar"
                  onClick={() =>
                    setFormula((rows) => rows.filter((r) => r.key !== row.key))
                  }
                  className="rounded-md p-1.5 text-muted-foreground transition hover:bg-muted hover:text-destructive"
                >
                  <Trash2 size={15} />
                </button>
                {row.is_substitute && (
                  <div className="col-span-4">
                    <select
                      aria-label="Sustituye a"
                      className={cn(selectCls, "h-9 text-xs")}
                      value={row.source_ingredient_id ?? ""}
                      onChange={(e) =>
                        updateRow(row.key, {
                          source_ingredient_id: e.target.value || null,
                        })
                      }
                    >
                      <option value="">Sustituye a…</option>
                      {formula
                        .filter(
                          (r) => !r.is_substitute && r.ingredient_id,
                        )
                        .map((r) => (
                          <option key={r.key} value={r.ingredient_id}>
                            {ingredientById.get(r.ingredient_id)?.name}
                          </option>
                        ))}
                    </select>
                  </div>
                )}
              </div>
            );
          })}
          {formulaError && (
            <p className="text-sm text-destructive">{formulaError}</p>
          )}
        </div>

        {/* Vida útil */}
        <div className="space-y-3">
          <SectionTitle>Vida útil</SectionTitle>
          <div className="grid grid-cols-3 gap-3">
            <Input
              label="Vida útil (días)"
              type="number"
              error={errors.shelf_life_days?.message}
              {...register("shelf_life_days", {
                setValueAs: (v) => (v === "" ? undefined : Number(v)),
              })}
            />
            <div className="col-span-2">
              <label className="mb-2 block text-sm font-medium text-muted-foreground">
                Envasado
              </label>
              <select className={selectCls} {...register("packaging_delay_type")}>
                {PACKAGING_DELAYS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {packagingDelay === "aging" && (
            <Input
              label="Días de estacionamiento"
              type="number"
              hint="Maduración previa al envasado (ej: curados)"
              error={errors.aging_days?.message}
              {...register("aging_days", {
                setValueAs: (v) => (v === "" ? 0 : Number(v)),
              })}
            />
          )}
        </div>

        {/* RNPA */}
        <div className="space-y-3">
          <SectionTitle>RNPA</SectionTitle>
          <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-4 py-3">
            <div>
              <p className="text-sm font-medium">No requiere RNPA</p>
              <p className="text-xs text-muted-foreground">
                Ej: elaboración y venta directa al mostrador
              </p>
            </div>
            <Switch
              checked={rnpaExempt}
              onCheckedChange={(v) => setValue("rnpa_exempt", v)}
              label="Exento de RNPA"
            />
          </div>
          {rnpaExempt ? (
            <Input
              label="Motivo de la exención"
              placeholder="Ej: venta al mostrador en el local"
              error={errors.rnpa_exempt_reason?.message}
              {...register("rnpa_exempt_reason")}
            />
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Número RNPA"
                placeholder="Ej: 21-123456"
                error={errors.rnpa_number?.message}
                {...register("rnpa_number")}
              />
              <Input
                label="Vencimiento RNPA"
                type="date"
                error={errors.rnpa_expiry?.message}
                {...register("rnpa_expiry", {
                  setValueAs: (v) => (v === "" ? null : v),
                })}
              />
            </div>
          )}
        </div>

        {/* Rotulado frontal */}
        <div className="space-y-3">
          <SectionTitle>Rotulado frontal · Ley 27.642</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {FRONT_LABELS.map((l) => {
              const active = (frontLabels ?? []).includes(l.value);
              return (
                <button
                  key={l.value}
                  type="button"
                  onClick={() => toggleFrontLabel(l.value)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs transition",
                    active
                      ? "border-foreground bg-foreground font-semibold text-background"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {l.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Nutrición */}
        <div className="space-y-3">
          <SectionTitle>Información nutricional (por 100 g/ml)</SectionTitle>
          <div className="grid grid-cols-5 gap-2">
            {(
              [
                ["calories", "Calorías"],
                ["proteins", "Proteínas"],
                ["fats", "Grasas"],
                ["carbs", "Hidratos"],
                ["sodium", "Sodio"],
              ] as const
            ).map(([key, label]) => (
              <Input
                key={key}
                label={label}
                type="number"
                step="any"
                {...register(`nutrition.${key}`, {
                  setValueAs: (v) =>
                    v === "" || v === null ? null : Number(v),
                })}
              />
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button type="submit" loading={saving}>
            {recipe ? "Guardar cambios" : "Crear receta"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
