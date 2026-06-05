"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Download, Plus, Search, Truck, Users } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  DateRangePicker,
  type DateRange,
} from "@/components/ui/DateRangePicker";
import { SpinnerBlock } from "@/components/ui/Spinner";
import { Eyebrow, Heading, Money } from "@/components/ui/Typography";
import { CustomersModal } from "@/components/despacho/CustomersModal";
import { DispatchDetailDrawer } from "@/components/despacho/DispatchDetailDrawer";
import { DispatchFormModal } from "@/components/despacho/DispatchFormModal";
import { VehiclesModal } from "@/components/despacho/VehiclesModal";
import { cn } from "@/lib/utils/cn";
import { formatDate, formatQty } from "@/lib/utils/format";
import { exportToExcel } from "@/lib/utils/xlsx";
import { useDispatches } from "@/modules/dispatch/hooks";

const STATUS_LABELS: Record<string, string> = {
  completed: "Completado",
  voided: "Anulado",
};

function totalKg(items: { quantity_kg: number }[]): number {
  return items.reduce((s, it) => s + (it.quantity_kg ?? 0), 0);
}

// Despacho: salidas a clientes con vehículo habilitado y lotes trazables (recall).
export default function DespachoPage() {
  const [search, setSearch] = useState("");
  const [range, setRange] = useState<DateRange | undefined>();
  const [formOpen, setFormOpen] = useState(false);
  const [customersOpen, setCustomersOpen] = useState(false);
  const [vehiclesOpen, setVehiclesOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const params = useMemo(
    () => ({
      search,
      from: range?.from ? format(range.from, "yyyy-MM-dd") : null,
      to: range?.to ? format(range.to, "yyyy-MM-dd") : null,
    }),
    [search, range]
  );

  const { data: dispatches, isLoading, isError } = useDispatches(params);
  const rows = dispatches ?? [];

  function handleExport() {
    void exportToExcel({
      filename: "despachos",
      sheetName: "Despachos",
      title: "Historial de despachos",
      subtitle: search.trim() ? `Cliente: ${search.trim()}` : undefined,
      columns: [
        { header: "Fecha", key: "date", format: "date", width: 14 },
        { header: "Cliente", key: "customer", width: 30 },
        { header: "Localidad", key: "locality", width: 22 },
        { header: "Vehículo", key: "vehicle", width: 16 },
        { header: "Ítems", key: "items", format: "number", width: 10 },
        { header: "Total (kg)", key: "kg", format: "number", width: 14 },
        { header: "Estado", key: "state", width: 14 },
      ],
      rows: rows.map((d) => ({
        date: d.dispatch_date,
        customer: d.customer?.name ?? "",
        locality: d.customer?.locality ?? "",
        vehicle: d.vehicle?.plate ?? "",
        items: d.items.length,
        kg: totalKg(d.items),
        state: STATUS_LABELS[d.status] ?? d.status,
      })),
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Eyebrow>Trazabilidad</Eyebrow>
          <Heading as="h1" className="mt-3">
            Despacho
          </Heading>
          <p className="mt-1 text-sm text-muted-foreground">
            Salidas a clientes con vehículo habilitado (UTA/URA) y lotes
            trazables para recall.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setCustomersOpen(true)}>
            <Users size={16} />
            Clientes
          </Button>
          <Button variant="secondary" onClick={() => setVehiclesOpen(true)}>
            <Truck size={16} />
            Vehículos
          </Button>
          <Button
            variant="secondary"
            onClick={handleExport}
            disabled={rows.length === 0}
          >
            <Download size={16} />
            Exportar Excel
          </Button>
          <Button onClick={() => setFormOpen(true)}>
            <Plus size={16} />
            Nuevo despacho
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search
            size={16}
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por cliente…"
            className="focus:ring-primary/20 h-11 w-full rounded-lg border border-input bg-background pl-10 pr-4 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2"
          />
        </div>
        <DateRangePicker value={range} onChange={setRange} />
        {range && (
          <Button variant="ghost" size="sm" onClick={() => setRange(undefined)}>
            Limpiar fechas
          </Button>
        )}
      </div>

      {/* Listado */}
      {isLoading ? (
        <SpinnerBlock />
      ) : isError ? (
        <div className="glass-card flex flex-col items-center gap-2 py-14 text-center">
          <p className="font-semibold text-destructive">
            No se pudieron cargar los despachos
          </p>
          <p className="text-sm text-muted-foreground">
            Reintentá en unos segundos.
          </p>
        </div>
      ) : rows.length === 0 ? (
        <div className="glass-card flex flex-col items-center gap-3 py-14 text-center">
          <span className="bg-primary/15 grid h-14 w-14 place-items-center rounded-ninjaMd text-primary">
            <Truck size={26} />
          </span>
          <div>
            <p className="font-semibold">
              {search || range ? "Sin resultados" : "Todavía no hay despachos"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {search || range
                ? "Probá con otro filtro."
                : "Registrá tu primera salida a un cliente."}
            </p>
          </div>
          {!search && !range && (
            <Button onClick={() => setFormOpen(true)}>
              <Plus size={16} />
              Nuevo despacho
            </Button>
          )}
        </div>
      ) : (
        <div className="glass-card overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Vehículo</th>
                <th className="px-4 py-3 text-right font-medium">Ítems</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
                <th className="px-4 py-3 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((d) => (
                <tr
                  key={d.id}
                  onClick={() => setDetailId(d.id)}
                  className="hover:bg-secondary/40 cursor-pointer transition"
                >
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatDate(d.dispatch_date)}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{d.customer?.name ?? "-"}</p>
                    {d.customer?.locality && (
                      <p className="text-xs text-muted-foreground">
                        {d.customer.locality}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {d.vehicle?.plate ? (
                      <Money className="text-xs">{d.vehicle.plate}</Money>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        Sin vehículo
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">
                    {d.items.length}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Money>{formatQty(totalKg(d.items))} kg</Money>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-medium",
                        d.status === "voided"
                          ? "bg-destructive/15 text-destructive"
                          : "bg-primary/15 text-primary"
                      )}
                    >
                      {STATUS_LABELS[d.status] ?? d.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <DispatchFormModal open={formOpen} onOpenChange={setFormOpen} />
      <CustomersModal open={customersOpen} onOpenChange={setCustomersOpen} />
      <VehiclesModal open={vehiclesOpen} onOpenChange={setVehiclesOpen} />
      <DispatchDetailDrawer
        dispatchId={detailId}
        onClose={() => setDetailId(null)}
      />
    </div>
  );
}
