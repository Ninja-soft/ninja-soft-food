"use client";

import { useEffect, useState } from "react";
import { Pencil, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Money } from "@/components/ui/Typography";
import { SpinnerBlock } from "@/components/ui/Spinner";
import { Switch } from "@/components/ui/Switch";
import { useToast } from "@/components/ui/Toast";
import { useInternalAddons, useUpdateAddon } from "@/modules/internal/hooks";
import type { InternalAddon } from "@/modules/internal/api";
import { MAX_PRICE } from "@/modules/internal/plans";
import { formatMoney } from "@/lib/utils/format";

// Editor del catálogo de add-ons (panel staff). Mismo patrón que PlansTable +
// PlanEditorModal: tabla de lectura + modal de edición vía route handler admin
// (/api/internal/update-addon, requireInternal + level admin). El add-on suma un
// cargo MENSUAL a la suscripción del tenant: precio en ARS y USD (fallback).

/** Parsea input crudo a precio: vacío → null (no autogestionable); si no, entero. */
function parsePriceInput(raw: string): { value: number | null; error?: string } {
  const trimmed = raw.trim();
  if (trimmed === "") return { value: null };
  if (!/^\d+$/.test(trimmed)) {
    return { value: null, error: "Solo números enteros (vacío = no cobrable)" };
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

function priceCell(value: number | null, currency?: string): React.ReactNode {
  if (value === null) {
    return <span className="text-muted-foreground">No cobrable</span>;
  }
  return <Money>{formatMoney(value, currency ? { currency } : undefined)}</Money>;
}

export function AddonsCard({ canEdit }: { canEdit: boolean }) {
  const { data: addons, isLoading } = useInternalAddons();
  const [editing, setEditing] = useState<InternalAddon | null>(null);

  return (
    <>
      <div className="flex items-center gap-2.5">
        <Sparkles size={18} className="text-primary" />
        <h2 className="font-display text-xl font-bold tracking-tight">
          Add-ons
        </h2>
      </div>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Extras que suman un cargo mensual a la suscripción del negocio. El precio
        que cargues acá es el que ve el tenant en su configuración. Precio en cero
        o vacío = no autogestionable (solo regalo de staff).
      </p>

      <div className="mt-5 overflow-x-auto rounded-ninjaMd border border-border bg-card shadow-soft backdrop-blur-xl">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-muted text-left text-xs uppercase tracking-[0.14em] text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Add-on</th>
              <th className="px-4 py-3">ARS mensual</th>
              <th className="px-4 py-3">USD mensual</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3 text-right">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border text-foreground">
            {isLoading && (
              <tr>
                <td colSpan={5} className="px-4 py-10">
                  <SpinnerBlock />
                </td>
              </tr>
            )}
            {!isLoading && (addons?.length ?? 0) === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-10 text-center text-muted-foreground"
                >
                  No hay add-ons cargados.
                </td>
              </tr>
            )}
            {(addons ?? []).map((a) => (
              <tr key={a.key} className="transition hover:bg-muted/40">
                <td className="px-4 py-3">
                  <div className="font-medium text-foreground">{a.name}</div>
                  {a.description && (
                    <div className="mt-0.5 max-w-md text-xs text-muted-foreground">
                      {a.description}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">{priceCell(a.monthlyPriceArs)}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {priceCell(a.monthlyPriceUsd, "USD")}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={
                      a.isActive
                        ? "inline-flex items-center rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-300"
                        : "inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground"
                    }
                  >
                    {a.isActive ? "Activo" : "Inactivo"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  {canEdit ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setEditing(a)}
                    >
                      <Pencil size={14} /> Editar
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canEdit && editing && (
        <AddonEditorModal
          addon={editing}
          open={editing !== null}
          onOpenChange={(o) => !o && setEditing(null)}
        />
      )}
    </>
  );
}

function AddonEditorModal({
  addon,
  open,
  onOpenChange,
}: {
  addon: InternalAddon;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { toast } = useToast();
  const update = useUpdateAddon();

  const [ars, setArs] = useState("");
  const [usd, setUsd] = useState("");
  const [active, setActive] = useState(true);
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (open) {
      setArs(addon.monthlyPriceArs != null ? String(addon.monthlyPriceArs) : "");
      setUsd(addon.monthlyPriceUsd != null ? String(addon.monthlyPriceUsd) : "");
      setActive(addon.isActive);
      setDescription(addon.description ?? "");
    }
  }, [open, addon]);

  const arsParsed = parsePriceInput(ars);
  const usdParsed = parsePriceInput(usd);
  const hasError = Boolean(arsParsed.error || usdParsed.error);

  function onSave() {
    if (hasError) return;
    update.mutate(
      {
        key: addon.key,
        monthly_price_ars: arsParsed.value,
        monthly_price_usd: usdParsed.value,
        is_active: active,
        description,
      },
      {
        onSuccess: () => {
          toast({ title: "Add-on actualizado", variant: "success" });
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
      title={`Editar add-on · ${addon.name}`}
      className="max-w-md"
    >
      <div className="space-y-5">
        <p className="text-sm text-muted-foreground">
          Precio mensual que se suma a la suscripción. ARS para tenants que cobran
          en pesos; USD como fallback para el resto. Vacío = no autogestionable
          (el tenant no puede comprarlo, solo lo regala el staff).
        </p>

        <Input
          label="Precio mensual (ARS)"
          inputMode="numeric"
          value={ars}
          onChange={(e) => setArs(e.target.value)}
          placeholder="Vacío = no cobrable"
          error={arsParsed.error}
        />

        <Input
          label="Precio mensual (USD)"
          inputMode="numeric"
          value={usd}
          onChange={(e) => setUsd(e.target.value)}
          placeholder="Vacío = no cobrable"
          error={usdParsed.error}
        />

        <Input
          label="Descripción"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Qué desbloquea este add-on"
        />

        <div className="flex items-center justify-between rounded-ninjaMd border border-border bg-muted/30 px-4 py-3">
          <div>
            <div className="text-sm font-medium text-foreground">Add-on activo</div>
            <div className="text-xs text-muted-foreground">
              Si se desactiva, no aparece para que el tenant lo contrate.
            </div>
          </div>
          <Switch checked={active} onCheckedChange={setActive} label="Add-on activo" />
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
