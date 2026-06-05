"use client";

import { useState } from "react";
import { FileText, Truck, User } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { SpinnerBlock } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { Money } from "@/components/ui/Typography";
import { cn } from "@/lib/utils/cn";
import { daysUntil, formatDate, formatQty } from "@/lib/utils/format";
import { useDispatchDetail } from "@/modules/dispatch/hooks";
import { generateRemito } from "@/modules/dispatch/remito";
import { getTenantBranding } from "@/modules/planillas/api";

const STATUS_LABELS: Record<string, string> = {
  completed: "Completado",
  voided: "Anulado",
};

// Detalle de un despacho con sus ítems + descarga del remito PDF.
export function DispatchDetailDrawer({
  dispatchId,
  onClose,
}: {
  dispatchId: string | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const { data: detail, isLoading } = useDispatchDetail(dispatchId);
  const [downloading, setDownloading] = useState(false);

  async function handleRemito() {
    if (!detail) return;
    setDownloading(true);
    try {
      const branding = await getTenantBranding();
      await generateRemito(detail, branding);
    } catch (e) {
      toast({
        title: "Error al generar el remito",
        description: e instanceof Error ? e.message : undefined,
        variant: "error",
      });
    } finally {
      setDownloading(false);
    }
  }

  const totalKg =
    detail?.items.reduce((s, it) => s + (it.quantity_kg ?? 0), 0) ?? 0;

  return (
    <Modal
      open={dispatchId !== null}
      onOpenChange={(o) => !o && onClose()}
      title="Detalle del despacho"
      description={
        detail
          ? `${formatDate(detail.dispatch_date)} · ${STATUS_LABELS[detail.status] ?? detail.status}`
          : undefined
      }
      className="max-w-2xl"
    >
      {isLoading || !detail ? (
        <SpinnerBlock />
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="bg-muted/30 rounded-ninjaSm border border-border p-3">
              <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <User size={12} />
                Cliente
              </p>
              <p className="font-medium">{detail.customer?.name ?? "-"}</p>
              <p className="text-xs text-muted-foreground">
                {[detail.customer?.locality, detail.customer?.address]
                  .filter(Boolean)
                  .join(" · ") || "Sin domicilio"}
              </p>
            </div>
            <div className="bg-muted/30 rounded-ninjaSm border border-border p-3">
              <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Truck size={12} />
                Vehículo
              </p>
              <p className="font-medium">
                <Money>{detail.vehicle?.plate ?? "Sin vehículo"}</Money>
              </p>
              <p className="text-xs text-muted-foreground">
                {detail.vehicle
                  ? [
                      detail.vehicle.uta_number
                        ? `UTA ${detail.vehicle.uta_number}`
                        : null,
                      detail.vehicle.ura_number
                        ? `URA ${detail.vehicle.ura_number}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "Sin habilitaciones"
                  : "-"}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-ninjaMd border border-border">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Producto</th>
                  <th className="px-4 py-2.5 font-medium">Lote</th>
                  <th className="px-4 py-2.5 font-medium">Vence</th>
                  <th className="px-4 py-2.5 text-right font-medium">
                    Cantidad
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {detail.items.map((it) => {
                  const d = daysUntil(it.production?.product_expiry_date);
                  return (
                    <tr key={it.id}>
                      <td className="px-4 py-2.5 font-medium">
                        {it.recipe?.commercial_name || it.recipe?.title || "-"}
                      </td>
                      <td className="px-4 py-2.5">
                        {it.production?.product_lot_number ? (
                          <Money className="text-xs">
                            {it.production.product_lot_number}
                          </Money>
                        ) : (
                          <span className="text-xs text-accent">sin lote</span>
                        )}
                      </td>
                      <td
                        className={cn(
                          "px-4 py-2.5 text-muted-foreground",
                          d !== null &&
                            d < 0 &&
                            "font-semibold text-destructive"
                        )}
                      >
                        {formatDate(it.production?.product_expiry_date)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Money>{formatQty(it.quantity_kg)} kg</Money>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-border">
                  <td
                    colSpan={3}
                    className="px-4 py-2.5 text-right text-xs uppercase tracking-wide text-muted-foreground"
                  >
                    Total
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold">
                    <Money>{formatQty(totalKg)} kg</Money>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button variant="secondary" onClick={onClose}>
              Cerrar
            </Button>
            <Button onClick={handleRemito} loading={downloading}>
              <FileText size={16} />
              Remito PDF
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
