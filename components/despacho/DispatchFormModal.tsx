"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { Money } from "@/components/ui/Typography";
import { daysUntil, formatDate } from "@/lib/utils/format";
import { isVehicleExpired } from "@/components/despacho/VehiclesModal";
import {
  useCompletedProductions,
  useCreateCustomer,
  useCreateDispatch,
  useCreateVehicle,
  useCustomers,
  useVehicles,
} from "@/modules/dispatch/hooks";
import { dispatchSchema, type DispatchInput } from "@/modules/dispatch/schemas";
import { useRecipes } from "@/modules/recipes/hooks";
import { useOperatingProfile } from "@/modules/tenant-profile/hooks";
import { useActiveEstablishment } from "@/modules/establishments/hooks";

const selectCls =
  "h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20";

// Nuevo despacho: cliente (+alta inline), vehículo (+alta inline, aviso UTA/URA
// vencida), fecha e ítems dinámicos (producto → lote opcional → kg).
export function DispatchFormModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { toast } = useToast();
  const { data: customers } = useCustomers();
  const { data: vehicles } = useVehicles();
  const { data: recipes } = useRecipes("", null);
  const { data: productions } = useCompletedProductions();
  const { data: profile } = useOperatingProfile();
  const createDispatchMut = useCreateDispatch();

  // UTA/URA son siglas argentinas; fuera de AR el aviso es genérico.
  const isAr = (profile?.country ?? "AR").toUpperCase() === "AR";
  const createCustomerMut = useCreateCustomer();
  const createVehicleMut = useCreateVehicle();

  // Planta de salida del despacho: la activa, o (en "Todas" + multi) la elegida.
  const { activeId, active, establishments, isMulti } =
    useActiveEstablishment();
  const defaultEstId =
    establishments.find((e) => e.is_default)?.id ?? establishments[0]?.id ?? "";
  const [establishmentId, setEstablishmentId] = useState<string>("");

  const [newCustomerName, setNewCustomerName] = useState("");
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newVehiclePlate, setNewVehiclePlate] = useState("");
  const [showNewVehicle, setShowNewVehicle] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<DispatchInput>({
    resolver: zodResolver(dispatchSchema),
    defaultValues: {
      customer_id: undefined as unknown as string,
      dispatch_date: format(new Date(), "yyyy-MM-dd"),
      vehicle_id: null,
      items: [
        {
          recipe_id: undefined as unknown as string,
          production_id: null,
          quantity_kg: undefined as unknown as number,
        },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "items" });
  const vehicleId = watch("vehicle_id");
  const items = watch("items");

  const selectedVehicle = useMemo(
    () => (vehicles ?? []).find((v) => v.id === vehicleId) ?? null,
    [vehicles, vehicleId]
  );
  const vehicleExpired = selectedVehicle
    ? isVehicleExpired(selectedVehicle)
    : false;

  // Producciones agrupadas por receta (para el select de lote por ítem).
  const productionsByRecipe = useMemo(() => {
    const map = new Map<string, NonNullable<typeof productions>>();
    for (const p of productions ?? []) {
      const list = map.get(p.recipe_id) ?? [];
      list.push(p);
      map.set(p.recipe_id, list);
    }
    return map;
  }, [productions]);

  useEffect(() => {
    if (!open) return;
    setShowNewCustomer(false);
    setShowNewVehicle(false);
    setNewCustomerName("");
    setNewVehiclePlate("");
    setEstablishmentId(activeId ?? defaultEstId);
    reset({
      customer_id: undefined as unknown as string,
      dispatch_date: format(new Date(), "yyyy-MM-dd"),
      vehicle_id: null,
      items: [
        {
          recipe_id: undefined as unknown as string,
          production_id: null,
          quantity_kg: undefined as unknown as number,
        },
      ],
    });
  }, [open, reset, activeId, defaultEstId]);

  async function handleCreateCustomer() {
    const name = newCustomerName.trim();
    if (name.length < 1) return;
    try {
      const created = await createCustomerMut.mutateAsync({
        name,
        address: null,
        locality: null,
        phone: null,
        email: null,
      });
      setValue("customer_id", created.id);
      setShowNewCustomer(false);
      setNewCustomerName("");
      toast({ title: "Cliente creado", variant: "success" });
    } catch (e) {
      toast({
        title: "Error al crear cliente",
        description: e instanceof Error ? e.message : undefined,
        variant: "error",
      });
    }
  }

  async function handleCreateVehicle() {
    const plate = newVehiclePlate.trim();
    if (plate.length < 1) return;
    try {
      const created = await createVehicleMut.mutateAsync({
        plate,
        uta_number: null,
        uta_expiry: null,
        ura_number: null,
        ura_expiry: null,
        capacity_kg: null,
      });
      setValue("vehicle_id", created.id);
      setShowNewVehicle(false);
      setNewVehiclePlate("");
      toast({ title: "Vehículo creado", variant: "success" });
    } catch (e) {
      toast({
        title: "Error al crear vehículo",
        description: e instanceof Error ? e.message : undefined,
        variant: "error",
      });
    }
  }

  const onSubmit = handleSubmit(async (values) => {
    try {
      const result = await createDispatchMut.mutateAsync({
        input: values,
        establishmentId: (activeId ?? (isMulti ? establishmentId : null)) || null,
      });
      toast({
        title: "Despacho registrado",
        description: `${result.items} ${result.items === 1 ? "ítem" : "ítems"} despachados`,
        variant: "success",
      });
      onOpenChange(false);
    } catch (e) {
      toast({
        title: "Error al registrar despacho",
        description: e instanceof Error ? e.message : undefined,
        variant: "error",
      });
    }
  });

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Nuevo despacho"
      description="Salida a un cliente con vehículo habilitado y lotes trazables."
      className="max-w-2xl"
    >
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        {/* Cliente */}
        <div>
          <label className="mb-2 block text-sm font-medium text-muted-foreground">
            Cliente
          </label>
          {showNewCustomer ? (
            <div className="flex gap-2">
              <input
                value={newCustomerName}
                onChange={(e) => setNewCustomerName(e.target.value)}
                placeholder="Nombre del cliente"
                className="focus:ring-primary/20 h-11 w-full rounded-lg border border-input bg-background px-4 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2"
              />
              <Button
                type="button"
                variant="secondary"
                loading={createCustomerMut.isPending}
                onClick={handleCreateCustomer}
              >
                Crear
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowNewCustomer(false)}
              >
                Cancelar
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <select className={selectCls} {...register("customer_id")}>
                <option value="">Elegir cliente…</option>
                {(customers ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.locality ? ` · ${c.locality}` : ""}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowNewCustomer(true)}
              >
                Nuevo
              </Button>
            </div>
          )}
          {errors.customer_id && (
            <p className="mt-2 text-sm text-destructive">
              {errors.customer_id.message}
            </p>
          )}
        </div>

        {/* Planta de salida (solo multi-planta) */}
        {isMulti &&
          (activeId ? (
            <p className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
              Sale desde{" "}
              <span className="font-medium text-foreground">{active?.name}</span>{" "}
              (planta activa).
            </p>
          ) : (
            <div>
              <label className="mb-2 block text-sm font-medium text-muted-foreground">
                Planta de salida
              </label>
              <select
                className={selectCls}
                value={establishmentId}
                onChange={(e) => setEstablishmentId(e.target.value)}
              >
                {establishments.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                    {e.is_default ? " · por defecto" : ""}
                  </option>
                ))}
              </select>
            </div>
          ))}

        <div className="grid grid-cols-2 gap-3">
          {/* Fecha */}
          <Input
            label="Fecha de despacho"
            type="date"
            error={errors.dispatch_date?.message}
            {...register("dispatch_date")}
          />

          {/* Vehículo */}
          <div>
            <label className="mb-2 block text-sm font-medium text-muted-foreground">
              Vehículo
            </label>
            {showNewVehicle ? (
              <div className="flex gap-2">
                <input
                  value={newVehiclePlate}
                  onChange={(e) => setNewVehiclePlate(e.target.value)}
                  placeholder="Patente"
                  className="focus:ring-primary/20 h-11 w-full rounded-lg border border-input bg-background px-4 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2"
                />
                <Button
                  type="button"
                  variant="secondary"
                  loading={createVehicleMut.isPending}
                  onClick={handleCreateVehicle}
                >
                  Crear
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <select
                  className={selectCls}
                  {...register("vehicle_id", {
                    setValueAs: (v) => (v === "" ? null : v),
                  })}
                >
                  <option value="">Sin vehículo</option>
                  {(vehicles ?? []).map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.plate}
                      {isVehicleExpired(v) ? " · habilitación vencida" : ""}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowNewVehicle(true)}
                >
                  Nuevo
                </Button>
              </div>
            )}
          </div>
        </div>

        {vehicleExpired && (
          <p className="border-accent/40 bg-accent/10 flex items-center gap-2 rounded-md border px-3 py-2 text-xs text-accent">
            <AlertTriangle size={13} />
            {isAr
              ? "El vehículo seleccionado tiene UTA o URA vencida a la fecha de hoy."
              : "El vehículo seleccionado tiene una habilitación de transporte vencida a la fecha de hoy."}
          </p>
        )}

        {/* Ítems */}
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Productos a despachar
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                append({
                  recipe_id: undefined as unknown as string,
                  production_id: null,
                  quantity_kg: undefined as unknown as number,
                })
              }
            >
              <Plus size={14} />
              Agregar
            </Button>
          </div>

          {fields.map((field, index) => {
            const recipeId = items?.[index]?.recipe_id;
            const lots = recipeId
              ? (productionsByRecipe.get(recipeId) ?? [])
              : [];
            return (
              <div
                key={field.id}
                className="rounded-md border border-border p-3"
              >
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <div className="space-y-2">
                    <select
                      aria-label="Producto"
                      className={selectCls}
                      {...register(`items.${index}.recipe_id` as const)}
                    >
                      <option value="">Elegir producto…</option>
                      {(recipes ?? []).map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.title}
                        </option>
                      ))}
                    </select>

                    <div className="grid grid-cols-2 gap-2">
                      <select
                        aria-label="Lote (producción)"
                        className={selectCls}
                        disabled={!recipeId}
                        {...register(`items.${index}.production_id` as const, {
                          setValueAs: (v) => (v === "" ? null : v),
                        })}
                      >
                        <option value="">Sin lote (sin trazabilidad)</option>
                        {lots.map((p) => {
                          const d = daysUntil(p.product_expiry_date);
                          return (
                            <option key={p.id} value={p.id}>
                              {p.product_lot_number ?? p.code}
                              {p.product_expiry_date
                                ? ` · vence ${formatDate(p.product_expiry_date)}${d !== null && d < 0 ? " (vencido)" : ""}`
                                : ""}
                            </option>
                          );
                        })}
                      </select>
                      <input
                        aria-label="Cantidad en kg"
                        type="number"
                        step="any"
                        min={0}
                        placeholder="kg"
                        className="focus:ring-primary/20 h-11 w-full rounded-lg border border-input bg-background px-3 text-right text-sm text-foreground outline-none transition focus:border-primary focus:ring-2"
                        {...register(`items.${index}.quantity_kg` as const, {
                          setValueAs: (v) => (v === "" ? undefined : Number(v)),
                        })}
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(index)}
                    disabled={fields.length === 1}
                    aria-label="Quitar ítem"
                    className="hover:bg-destructive/10 grid h-11 w-11 place-items-center rounded-lg text-muted-foreground transition hover:text-destructive disabled:pointer-events-none disabled:opacity-40"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                {errors.items?.[index]?.recipe_id && (
                  <p className="mt-2 text-xs text-destructive">
                    {errors.items[index]?.recipe_id?.message}
                  </p>
                )}
                {errors.items?.[index]?.quantity_kg && (
                  <p className="mt-1 text-xs text-destructive">
                    {errors.items[index]?.quantity_kg?.message}
                  </p>
                )}
              </div>
            );
          })}

          {typeof errors.items?.message === "string" && (
            <p className="text-sm text-destructive">{errors.items.message}</p>
          )}

          <p className="text-xs text-muted-foreground">
            <Money>Tip</Money> · Asigná el lote del producto terminado para que
            el despacho sea reconstruible en un recall.
          </p>
        </div>

        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button type="submit" loading={createDispatchMut.isPending}>
            Registrar despacho
          </Button>
        </div>
      </form>
    </Modal>
  );
}
