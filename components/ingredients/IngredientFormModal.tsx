"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, ScanBarcode } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { BarcodeScanner } from "@/components/ui/BarcodeScanner";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Switch } from "@/components/ui/Switch";
import { useToast } from "@/components/ui/Toast";
import { uploadIngredientImage, type Ingredient } from "@/modules/ingredients/api";
import {
  useCreateIngredient,
  useFamilies,
  useUnits,
  useUpdateIngredient,
} from "@/modules/ingredients/hooks";
import {
  ingredientSchema,
  type IngredientInput,
} from "@/modules/ingredients/schemas";

// Alta/edición de ingrediente: form RHF+zod con foto a Storage.
export function IngredientFormModal({
  open,
  onOpenChange,
  ingredient,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  ingredient: Ingredient | null; // null = crear
}) {
  const { toast } = useToast();
  const { data: families } = useFamilies();
  const { data: units } = useUnits();
  const createMut = useCreateIngredient();
  const updateMut = useUpdateIngredient();

  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<IngredientInput>({
    resolver: zodResolver(ingredientSchema),
    defaultValues: {
      name: "",
      family_id: null,
      unit: "kg",
      is_perishable: true,
      barcode: null,
      description: null,
      low_stock_threshold: null,
      default_shelf_days: null,
    },
  });

  const isPerishable = watch("is_perishable");

  useEffect(() => {
    if (!open) return;
    setFile(null);
    setPreview(ingredient?.image_url ?? null);
    reset({
      name: ingredient?.name ?? "",
      family_id: ingredient?.family_id ?? null,
      unit: ingredient?.unit ?? "kg",
      is_perishable: ingredient?.is_perishable ?? true,
      barcode: ingredient?.barcode ?? null,
      description: ingredient?.description ?? null,
      low_stock_threshold: ingredient?.low_stock_threshold ?? null,
      default_shelf_days: ingredient?.default_shelf_days ?? null,
    });
  }, [open, ingredient, reset]);

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) {
      toast({ title: "Imagen muy pesada", description: "Máximo 5 MB", variant: "error" });
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  const onSubmit = handleSubmit(async (values) => {
    try {
      let image_url = ingredient?.image_url ?? null;
      if (file) {
        setUploading(true);
        image_url = await uploadIngredientImage(file);
      }
      if (ingredient) {
        await updateMut.mutateAsync({ id: ingredient.id, input: { ...values, image_url } });
        toast({ title: "Ingrediente actualizado", variant: "success" });
      } else {
        await createMut.mutateAsync({ ...values, image_url });
        toast({ title: "Ingrediente creado", variant: "success" });
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
      title={ingredient ? "Editar ingrediente" : "Nuevo ingrediente"}
      description="Materia prima o insumo de tus recetas."
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {/* Foto */}
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-lg border border-dashed border-border bg-muted/40 text-muted-foreground transition hover:border-primary hover:text-primary"
            aria-label="Subir foto"
          >
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="" className="h-full w-full object-cover" />
            ) : (
              <ImagePlus size={22} />
            )}
          </button>
          <div className="text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Foto (opcional)</p>
            <p>JPG, PNG o WebP · hasta 5 MB</p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={onPickFile}
          />
        </div>

        <Input
          label="Nombre"
          placeholder="Ej: Carne de cerdo, Sal fina, Pimentón"
          error={errors.name?.message}
          {...register("name")}
        />

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="ing-family"
              className="mb-2 block text-sm font-medium text-muted-foreground"
            >
              Familia
            </label>
            <select
              id="ing-family"
              className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              {...register("family_id", {
                setValueAs: (v) => (v === "" ? null : v),
              })}
            >
              <option value="">Sin familia</option>
              {(families ?? []).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="ing-unit"
              className="mb-2 block text-sm font-medium text-muted-foreground"
            >
              Unidad
            </label>
            <select
              id="ing-unit"
              className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              {...register("unit")}
            >
              {(units ?? []).map((u) => (
                <option key={u.id} value={u.abbr}>
                  {u.name} ({u.abbr})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-4 py-3">
          <div>
            <p className="text-sm font-medium">Perecedero</p>
            <p className="text-xs text-muted-foreground">
              Controla vencimiento en cada ingreso de stock
            </p>
          </div>
          <Switch
            checked={isPerishable}
            onCheckedChange={(v) => setValue("is_perishable", v)}
            label="Perecedero"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Alerta stock bajo"
            type="number"
            step="any"
            placeholder="Global: 5"
            hint="Umbral propio (opcional)"
            error={errors.low_stock_threshold?.message}
            {...register("low_stock_threshold", {
              setValueAs: (v) => (v === "" || v === null ? null : Number(v)),
            })}
          />
          <Input
            label="Vencimiento típico (días)"
            type="number"
            placeholder="Ej: 30"
            hint="Sugerido al ingresar stock"
            error={errors.default_shelf_days?.message}
            {...register("default_shelf_days", {
              setValueAs: (v) => (v === "" || v === null ? null : Number(v)),
            })}
          />
        </div>

        <div>
          <label
            htmlFor="ing-barcode"
            className="mb-2 block text-sm font-medium text-muted-foreground"
          >
            Código de barras
          </label>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Input
                id="ing-barcode"
                placeholder="EAN-13 / Code-128 (opcional)"
                inputMode="numeric"
                error={errors.barcode?.message}
                {...register("barcode")}
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              aria-label="Escanear código de barras"
              onClick={() => setScannerOpen(true)}
            >
              <ScanBarcode size={18} />
            </Button>
          </div>
        </div>

        <Input
          label="Descripción"
          placeholder="Notas internas (opcional)"
          error={errors.description?.message}
          {...register("description")}
        />

        <div className="flex justify-end gap-2 pt-1">
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button type="submit" loading={saving}>
            {ingredient ? "Guardar cambios" : "Crear ingrediente"}
          </Button>
        </div>
      </form>

      <BarcodeScanner
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        title="Escanear código del ingrediente"
        onResult={(code) => {
          setValue("barcode", code, { shouldDirty: true });
          setScannerOpen(false);
        }}
      />
    </Modal>
  );
}
