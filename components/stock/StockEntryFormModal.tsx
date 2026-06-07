"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { addDays, format } from "date-fns";
import { Paperclip, RefreshCw } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Switch } from "@/components/ui/Switch";
import { useToast } from "@/components/ui/Toast";
import { useIngredients } from "@/modules/ingredients/hooks";
import { uploadInvoice } from "@/modules/stock/api";
import {
  useCreateEntry,
  useCreateSupplier,
  useSuppliers,
} from "@/modules/stock/hooks";
import {
  FROZEN_EXTRA_DAYS,
  stockEntrySchema,
  type StockEntryInput,
} from "@/modules/stock/schemas";
import { useOperatingProfile } from "@/modules/tenant-profile/hooks";

function genLotNumber(): string {
  const date = format(new Date(), "yyMMdd");
  const suffix = Math.random().toString(36).slice(2, 5).toUpperCase();
  return `L${date}-${suffix}`;
}

// Nuevo ingreso de stock: lote + vencimiento (regla CAA congelados) + proveedor + factura.
export function StockEntryFormModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { toast } = useToast();
  const { data: ingredients } = useIngredients("", null);
  const { data: suppliers } = useSuppliers();
  const { data: profile } = useOperatingProfile();
  const createMut = useCreateEntry();
  const createSupplierMut = useCreateSupplier();

  // El número del proveedor es RNE en Argentina; para otros países lo mostramos
  // como "Registro" genérico (el registro fino vive en regulatory_permits).
  const isAr = (profile?.country ?? "AR").toUpperCase() === "AR";

  const fileRef = useRef<HTMLInputElement>(null);
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [newSupplierName, setNewSupplierName] = useState("");
  const [showNewSupplier, setShowNewSupplier] = useState(false);
  const [uploading, setUploading] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<StockEntryInput>({
    resolver: zodResolver(stockEntrySchema),
    defaultValues: {
      ingredient_id: undefined as unknown as string,
      quantity: undefined as unknown as number,
      lot_number: "",
      expiry_date: null,
      manufacture_date: null,
      is_frozen: false,
      supplier_id: null,
      unit_cost: null,
      is_internal_use: false,
    },
  });

  const ingredientId = watch("ingredient_id");
  const manufactureDate = watch("manufacture_date");
  const isFrozen = watch("is_frozen");
  const isInternalUse = watch("is_internal_use");

  const ingredient = useMemo(
    () => (ingredients ?? []).find((i) => i.id === ingredientId) ?? null,
    [ingredients, ingredientId],
  );

  useEffect(() => {
    if (!open) return;
    setInvoiceFile(null);
    setShowNewSupplier(false);
    setNewSupplierName("");
    reset({
      ingredient_id: undefined as unknown as string,
      quantity: undefined as unknown as number,
      lot_number: genLotNumber(),
      expiry_date: null,
      manufacture_date: format(new Date(), "yyyy-MM-dd"),
      is_frozen: false,
      supplier_id: null,
      unit_cost: null,
      is_internal_use: false,
    });
  }, [open, reset]);

  // Sugerencia de vencimiento: fecha fab + días típicos del ingrediente,
  // +60 días si está congelado (regla CAA heredada de La Jamonera).
  useEffect(() => {
    if (!ingredient?.is_perishable) return;
    const base = manufactureDate ? new Date(manufactureDate) : new Date();
    const shelf = ingredient.default_shelf_days ?? null;
    if (shelf === null) return;
    const days = shelf + (isFrozen ? FROZEN_EXTRA_DAYS : 0);
    setValue("expiry_date", format(addDays(base, days), "yyyy-MM-dd"));
  }, [ingredient, manufactureDate, isFrozen, setValue]);

  async function handleCreateSupplier() {
    const name = newSupplierName.trim();
    if (name.length < 2) return;
    try {
      const created = await createSupplierMut.mutateAsync({
        name,
        rne_number: null,
      });
      setValue("supplier_id", created.id);
      setShowNewSupplier(false);
      setNewSupplierName("");
      toast({ title: "Proveedor creado", variant: "success" });
    } catch (e) {
      toast({
        title: "Error al crear proveedor",
        description: e instanceof Error ? e.message : undefined,
        variant: "error",
      });
    }
  }

  const onSubmit = handleSubmit(async (values) => {
    if (!ingredient) return;
    try {
      let invoice_url: string | null = null;
      if (invoiceFile) {
        setUploading(true);
        invoice_url = await uploadInvoice(invoiceFile);
      }
      await createMut.mutateAsync({
        ...values,
        unit: ingredient.unit,
        invoice_url,
      });
      toast({
        title: "Ingreso registrado",
        description: `${ingredient.name} · lote ${values.lot_number}`,
        variant: "success",
      });
      onOpenChange(false);
    } catch (e) {
      toast({
        title: "Error al registrar ingreso",
        description: e instanceof Error ? e.message : undefined,
        variant: "error",
      });
    } finally {
      setUploading(false);
    }
  });

  const saving = uploading || createMut.isPending;

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Nuevo ingreso de stock"
      description="Cada ingreso es un lote trazable."
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div>
          <label
            htmlFor="entry-ingredient"
            className="mb-2 block text-sm font-medium text-muted-foreground"
          >
            Ingrediente
          </label>
          <select
            id="entry-ingredient"
            className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            {...register("ingredient_id")}
          >
            <option value="">Elegir ingrediente…</option>
            {(ingredients ?? []).map((i) => (
              <option key={i.id} value={i.id}>
                {i.name} ({i.unit})
              </option>
            ))}
          </select>
          {errors.ingredient_id && (
            <p className="mt-2 text-sm text-destructive">
              {errors.ingredient_id.message}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input
            label={`Cantidad${ingredient ? ` (${ingredient.unit})` : ""}`}
            type="number"
            step="any"
            placeholder="0"
            error={errors.quantity?.message}
            {...register("quantity", {
              setValueAs: (v) => (v === "" ? undefined : Number(v)),
            })}
          />
          <Input
            label="Costo unitario (ARS)"
            type="number"
            step="any"
            placeholder="Opcional"
            error={errors.unit_cost?.message}
            {...register("unit_cost", {
              setValueAs: (v) => (v === "" || v === null ? null : Number(v)),
            })}
          />
        </div>

        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Input
              label="Lote"
              error={errors.lot_number?.message}
              {...register("lot_number")}
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            size="icon"
            aria-label="Regenerar lote"
            onClick={() => setValue("lot_number", genLotNumber())}
          >
            <RefreshCw size={16} />
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Fecha de elaboración"
            type="date"
            error={errors.manufacture_date?.message}
            {...register("manufacture_date", {
              setValueAs: (v) => (v === "" ? null : v),
            })}
          />
          <Input
            label="Vencimiento"
            type="date"
            hint={
              ingredient && !ingredient.is_perishable
                ? "No perecedero (opcional)"
                : undefined
            }
            error={errors.expiry_date?.message}
            {...register("expiry_date", {
              setValueAs: (v) => (v === "" ? null : v),
            })}
          />
        </div>

        <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-4 py-3">
          <div>
            <p className="text-sm font-medium">Producto congelado</p>
            <p className="text-xs text-muted-foreground">
              Extiende el vencimiento +{FROZEN_EXTRA_DAYS} días (CAA)
            </p>
          </div>
          <Switch
            checked={isFrozen}
            onCheckedChange={(v) => setValue("is_frozen", v)}
            label="Congelado"
          />
        </div>

        {/* Proveedor */}
        <div>
          <label
            htmlFor="entry-supplier"
            className="mb-2 block text-sm font-medium text-muted-foreground"
          >
            Proveedor
          </label>
          {showNewSupplier ? (
            <div className="flex gap-2">
              <input
                value={newSupplierName}
                onChange={(e) => setNewSupplierName(e.target.value)}
                placeholder="Nombre del proveedor"
                className="h-11 w-full rounded-lg border border-input bg-background px-4 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
              <Button
                type="button"
                variant="secondary"
                loading={createSupplierMut.isPending}
                onClick={handleCreateSupplier}
              >
                Crear
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <select
                id="entry-supplier"
                className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                {...register("supplier_id", {
                  setValueAs: (v) => (v === "" ? null : v),
                })}
              >
                <option value="">Sin proveedor</option>
                {(suppliers ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.rne_number
                      ? ` · ${isAr ? "RNE" : "Registro"} ${s.rne_number}`
                      : ` · sin ${isAr ? "RNE" : "registro"}`}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowNewSupplier(true)}
              >
                Nuevo
              </Button>
            </div>
          )}
        </div>

        {/* Factura */}
        <div className="flex items-center justify-between rounded-md border border-dashed border-border px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">Remito / factura</p>
            <p className="truncate text-xs text-muted-foreground">
              {invoiceFile ? invoiceFile.name : "PDF o imagen · hasta 10 MB"}
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => fileRef.current?.click()}
          >
            <Paperclip size={14} />
            {invoiceFile ? "Cambiar" : "Adjuntar"}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f && f.size > 10 * 1024 * 1024) {
                toast({
                  title: "Archivo muy pesado",
                  description: "Máximo 10 MB",
                  variant: "error",
                });
                return;
              }
              setInvoiceFile(f ?? null);
            }}
          />
        </div>

        <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-4 py-3">
          <div>
            <p className="text-sm font-medium">Uso interno</p>
            <p className="text-xs text-muted-foreground">
              No comercializable (consumo de la empresa)
            </p>
          </div>
          <Switch
            checked={isInternalUse}
            onCheckedChange={(v) => setValue("is_internal_use", v)}
            label="Uso interno"
          />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button type="submit" loading={saving}>
            Registrar ingreso
          </Button>
        </div>
      </form>
    </Modal>
  );
}
