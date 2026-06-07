"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { CalendarRange, Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  DateRangePicker,
  type DateRange,
} from "@/components/ui/DateRangePicker";
import { Segmented } from "@/components/ui/Segmented";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import {
  SendEmailButton,
  SendEmailModal,
} from "@/components/emails/SendEmailModal";
import { formatDate, formatQty } from "@/lib/utils/format";
import { exportToExcel } from "@/lib/utils/xlsx";
import type { TenantBranding } from "@/modules/planillas/api";
import {
  generateWeeklyProductionPlanilla,
  generateWeeklyStockPlanilla,
} from "@/modules/planillas/generators";
import {
  useProductionsInRange,
  useStockEntriesInRange,
} from "@/modules/planillas/hooks";
import { dateRangeSchema, MAX_RANGE_DAYS } from "@/modules/planillas/schemas";

type Mode = "produccion" | "ingresos";

function toIso(d: Date | undefined): string | null {
  return d ? format(d, "yyyy-MM-dd") : null;
}

// Planilla semanal: rango de fechas + toggle producciones/ingresos.
// Resumen tabular en PDF + exportación a Excel del mismo rango.
export function WeeklyTab({ branding }: { branding: TenantBranding | undefined }) {
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>("produccion");
  const [range, setRange] = useState<DateRange | undefined>();
  const [generating, setGenerating] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);

  const from = toIso(range?.from);
  const to = toIso(range?.to ?? range?.from);

  const rangeError = useMemo(() => {
    if (!from || !to) return null;
    const parsed = dateRangeSchema.safeParse({ from, to });
    if (parsed.success) return null;
    return parsed.error.issues[0]?.message ?? "Rango inválido";
  }, [from, to]);

  const valid = !!from && !!to && !rangeError;

  const productions = useProductionsInRange(
    mode === "produccion" && valid ? from : null,
    mode === "produccion" && valid ? to : null,
  );
  const stock = useStockEntriesInRange(
    mode === "ingresos" && valid ? from : null,
    mode === "ingresos" && valid ? to : null,
  );

  const active = mode === "produccion" ? productions : stock;
  const count =
    mode === "produccion"
      ? (productions.data ?? []).length
      : (stock.data ?? []).length;

  function handlePdf() {
    if (!valid || !branding || !from || !to) return;
    setGenerating(true);
    try {
      if (mode === "produccion") {
        generateWeeklyProductionPlanilla(productions.data ?? [], { from, to }, branding);
      } else {
        generateWeeklyStockPlanilla(stock.data ?? [], { from, to }, branding);
      }
      toast({ title: "Planilla generada", variant: "success" });
    } catch (e) {
      toast({
        title: "No se pudo generar la planilla",
        description: e instanceof Error ? e.message : undefined,
        variant: "error",
      });
    } finally {
      setGenerating(false);
    }
  }

  async function handleExcel() {
    if (!valid || !from || !to) return;
    const subtitle = `${formatDate(from)} al ${formatDate(to)}`;
    try {
      if (mode === "produccion") {
        await exportToExcel({
          filename: `resumen-produccion-${from}_${to}`,
          sheetName: "Producción",
          title: "Resumen de producción",
          subtitle,
          columns: [
            { header: "Fecha", key: "fecha", format: "date", width: 14 },
            { header: "Código", key: "codigo", width: 16 },
            { header: "Receta", key: "receta", width: 32 },
            { header: "Cantidad (kg)", key: "kg", format: "number", width: 16 },
            { header: "Lote producto", key: "lote", width: 18 },
            { header: "Vencimiento", key: "vence", format: "date", width: 14 },
          ],
          rows: (productions.data ?? []).map((p) => ({
            fecha: p.production_date,
            codigo: p.code,
            receta: p.recipe_title,
            kg: p.quantity_kg,
            lote: p.product_lot_number ?? "",
            vence: p.product_expiry_date,
          })),
        });
      } else {
        await exportToExcel({
          filename: `resumen-ingresos-${from}_${to}`,
          sheetName: "Ingresos",
          title: "Resumen de ingresos de stock",
          subtitle,
          columns: [
            { header: "Fecha", key: "fecha", format: "date", width: 14 },
            { header: "Ingrediente", key: "ingrediente", width: 30 },
            { header: "Lote", key: "lote", width: 18 },
            { header: "Proveedor", key: "proveedor", width: 26 },
            { header: "Cantidad", key: "cantidad", format: "number", width: 14 },
            { header: "Unidad", key: "unidad", width: 10 },
            { header: "Vencimiento", key: "vence", format: "date", width: 14 },
          ],
          rows: (stock.data ?? []).map((e) => ({
            fecha: e.created_at,
            ingrediente: e.ingredient_name,
            lote: e.lot_number,
            proveedor: e.supplier_name ?? "",
            cantidad: e.quantity,
            unidad: e.unit,
            vence: e.expiry_date,
          })),
        });
      }
      toast({ title: "Excel exportado", variant: "success" });
    } catch (e) {
      toast({
        title: "No se pudo exportar a Excel",
        description: e instanceof Error ? e.message : undefined,
        variant: "error",
      });
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented<Mode>
          value={mode}
          onChange={setMode}
          options={[
            { value: "produccion", label: "Producciones" },
            { value: "ingresos", label: "Ingresos de stock" },
          ]}
        />
        <DateRangePicker value={range} onChange={setRange} />
      </div>

      {rangeError && (
        <p className="text-sm text-destructive">{rangeError}</p>
      )}
      {!range?.from && (
        <p className="text-xs text-muted-foreground">
          Elegí un rango de fechas (máximo {MAX_RANGE_DAYS} días) para generar el
          resumen.
        </p>
      )}

      {/* Preview / conteo */}
      {valid && (
        <div className="glass-card flex items-center justify-between gap-4 p-4">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-lg bg-primary/15 text-primary">
              <CalendarRange size={20} />
            </span>
            <div>
              {active.isLoading ? (
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Spinner size={14} />
                  Cargando…
                </span>
              ) : (
                <p className="text-sm font-semibold">
                  {count}{" "}
                  {mode === "produccion"
                    ? count === 1
                      ? "producción"
                      : "producciones"
                    : count === 1
                      ? "ingreso"
                      : "ingresos"}{" "}
                  en el rango
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                {formatDate(from)} al {formatDate(to)}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={handleExcel}
              disabled={active.isLoading || count === 0}
            >
              <Download size={16} />
              Excel
            </Button>
            <SendEmailButton
              onClick={() => setEmailOpen(true)}
              disabled={active.isLoading || count === 0 || !branding}
            />
            <Button
              onClick={handlePdf}
              loading={generating}
              disabled={active.isLoading || count === 0 || !branding}
            >
              <FileText size={16} />
              Generar PDF
            </Button>
          </div>
        </div>
      )}

      {valid && from && to && branding && (
        <SendEmailModal
          open={emailOpen}
          onOpenChange={setEmailOpen}
          title="Enviar resumen por email"
          documentLabel={
            mode === "produccion"
              ? "Resumen de producción"
              : "Resumen de ingresos de stock"
          }
          defaultSubject={`${
            mode === "produccion"
              ? "Resumen de producción"
              : "Resumen de ingresos de stock"
          } · ${formatDate(from)} al ${formatDate(to)}`}
          getAttachments={async () => {
            const result =
              mode === "produccion"
                ? generateWeeklyProductionPlanilla(
                    productions.data ?? [],
                    { from, to },
                    branding,
                    "blob",
                  )
                : generateWeeklyStockPlanilla(
                    stock.data ?? [],
                    { from, to },
                    branding,
                    "blob",
                  );
            return [result];
          }}
        />
      )}

      {/* Tabla de preview */}
      {valid && !active.isLoading && count > 0 && (
        <div className="glass-card overflow-x-auto">
          {mode === "produccion" ? (
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Fecha</th>
                  <th className="px-4 py-3 font-medium">Código</th>
                  <th className="px-4 py-3 font-medium">Receta</th>
                  <th className="px-4 py-3 text-right font-medium">Cantidad</th>
                  <th className="px-4 py-3 font-medium">Lote</th>
                  <th className="px-4 py-3 font-medium">Vence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(productions.data ?? []).map((p) => (
                  <tr key={p.id} className="transition hover:bg-secondary/40">
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {formatDate(p.production_date)}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs">{p.code}</td>
                    <td className="px-4 py-2.5 font-medium">{p.recipe_title}</td>
                    <td className="px-4 py-2.5 text-right">
                      {formatQty(p.quantity_kg)} kg
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs">
                      {p.product_lot_number ?? "-"}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {formatDate(p.product_expiry_date)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Fecha</th>
                  <th className="px-4 py-3 font-medium">Ingrediente</th>
                  <th className="px-4 py-3 font-medium">Lote</th>
                  <th className="px-4 py-3 font-medium">Proveedor</th>
                  <th className="px-4 py-3 text-right font-medium">Cantidad</th>
                  <th className="px-4 py-3 font-medium">Vence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(stock.data ?? []).map((e) => (
                  <tr key={e.id} className="transition hover:bg-secondary/40">
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {formatDate(e.created_at)}
                    </td>
                    <td className="px-4 py-2.5 font-medium">
                      {e.ingredient_name}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs">
                      {e.lot_number}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {e.supplier_name ?? "-"}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {formatQty(e.quantity)} {e.unit}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {formatDate(e.expiry_date)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {valid && !active.isLoading && count === 0 && (
        <div className="glass-card flex flex-col items-center gap-2 py-12 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-lg bg-primary/15 text-primary">
            <CalendarRange size={22} />
          </span>
          <p className="text-sm text-muted-foreground">
            No hay {mode === "produccion" ? "producciones" : "ingresos"} en ese
            rango.
          </p>
        </div>
      )}
    </div>
  );
}
