"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  Download,
  Package,
  Plus,
  Search,
  Snowflake,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Segmented } from "@/components/ui/Segmented";
import { SpinnerBlock } from "@/components/ui/Spinner";
import { Eyebrow, Heading, Money } from "@/components/ui/Typography";
import { AdjustEntryModal } from "@/components/stock/AdjustEntryModal";
import { StockEntryFormModal } from "@/components/stock/StockEntryFormModal";
import { cn } from "@/lib/utils/cn";
import { daysUntil, formatDate, formatQty } from "@/lib/utils/format";
import { exportToExcel } from "@/lib/utils/xlsx";
import type { StockEntry } from "@/modules/stock/api";
import { useAvailableEntries, useEntryHistory } from "@/modules/stock/hooks";
import {
  EXPIRING_SOON_DAYS,
  GLOBAL_LOW_STOCK_THRESHOLD,
} from "@/modules/stock/schemas";

type Tab = "stock" | "ingresos";

type StockRow = {
  ingredientId: string;
  name: string;
  imageUrl: string | null;
  unit: string;
  total: number;
  lots: StockEntry[];
  nextExpiry: string | null;
  lowThreshold: number;
};

// Inventario: stock actual agregado por ingrediente + historial de ingresos.
export default function InventarioPage() {
  const [tab, setTab] = useState<Tab>("stock");
  const [search, setSearch] = useState("");
  const [entryModalOpen, setEntryModalOpen] = useState(false);
  const [adjustTarget, setAdjustTarget] = useState<StockEntry | null>(null);
  const [expandedIngredient, setExpandedIngredient] = useState<string | null>(
    null,
  );

  const { data: available, isLoading: loadingStock } = useAvailableEntries();
  const { data: history, isLoading: loadingHistory } = useEntryHistory(
    tab === "ingresos" ? search : "",
  );

  // Agregado por ingrediente (los lotes ya vienen FEFO: vence antes primero)
  const rows = useMemo<StockRow[]>(() => {
    const map = new Map<string, StockRow>();
    for (const e of available ?? []) {
      const key = e.ingredient_id;
      const row = map.get(key) ?? {
        ingredientId: key,
        name: e.ingredient?.name ?? "(sin nombre)",
        imageUrl: e.ingredient?.image_url ?? null,
        unit: e.unit,
        total: 0,
        lots: [],
        nextExpiry: null,
        lowThreshold:
          e.ingredient?.low_stock_threshold ?? GLOBAL_LOW_STOCK_THRESHOLD,
      };
      row.total += e.remaining_quantity;
      row.lots.push(e);
      if (e.expiry_date && (!row.nextExpiry || e.expiry_date < row.nextExpiry))
        row.nextExpiry = e.expiry_date;
      map.set(key, row);
    }
    let list = [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
    if (tab === "stock" && search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((r) => r.name.toLowerCase().includes(q));
    }
    return list;
  }, [available, search, tab]);

  const alerts = useMemo(() => {
    let low = 0;
    let expiring = 0;
    for (const r of rows) {
      if (r.total < r.lowThreshold) low++;
      const d = daysUntil(r.nextExpiry);
      if (d !== null && d <= EXPIRING_SOON_DAYS) expiring++;
    }
    return { low, expiring };
  }, [rows]);

  const historyRows = history ?? [];
  const canExport =
    tab === "stock" ? rows.length > 0 : historyRows.length > 0;

  function handleExport() {
    if (tab === "stock") {
      void exportToExcel({
        filename: "stock-actual",
        sheetName: "Stock",
        title: "Stock actual",
        subtitle: search.trim() ? `Filtro: ${search.trim()}` : undefined,
        columns: [
          { header: "Ingrediente", key: "name", width: 32 },
          { header: "Disponible", key: "total", format: "number", width: 16 },
          { header: "Unidad", key: "unit", width: 10 },
          { header: "Lotes", key: "lots", format: "number", width: 10 },
          { header: "Próx. vencimiento", key: "expiry", format: "date", width: 18 },
          { header: "Stock mínimo", key: "threshold", format: "number", width: 14 },
          { header: "Estado", key: "state", width: 14 },
        ],
        rows: rows.map((r) => {
          const d = daysUntil(r.nextExpiry);
          const isLow = r.total < r.lowThreshold;
          const isExpiring = d !== null && d <= EXPIRING_SOON_DAYS;
          return {
            name: r.name,
            total: r.total,
            unit: r.unit,
            lots: r.lots.length,
            expiry: r.nextExpiry,
            threshold: r.lowThreshold,
            state: isLow ? "Stock bajo" : isExpiring ? "Por vencer" : "OK",
          };
        }),
      });
    } else {
      void exportToExcel({
        filename: "ingresos-stock",
        sheetName: "Ingresos",
        title: "Historial de ingresos",
        subtitle: search.trim() ? `Lote: ${search.trim()}` : undefined,
        columns: [
          { header: "Fecha", key: "date", format: "datetime", width: 18 },
          { header: "Ingrediente", key: "name", width: 30 },
          { header: "Lote", key: "lot", width: 22 },
          { header: "Ingresado", key: "quantity", format: "number", width: 14 },
          { header: "Restante", key: "remaining", format: "number", width: 14 },
          { header: "Unidad", key: "unit", width: 10 },
          { header: "Vence", key: "expiry", format: "date", width: 14 },
          { header: "Proveedor", key: "supplier", width: 26 },
        ],
        rows: historyRows.map((e) => ({
          date: e.created_at,
          name: e.ingredient?.name ?? "",
          lot: e.lot_number,
          quantity: e.quantity,
          remaining: e.remaining_quantity,
          unit: e.unit,
          expiry: e.expiry_date,
          supplier: e.supplier?.name ?? "",
        })),
      });
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Eyebrow>Stock</Eyebrow>
          <Heading as="h1" className="mt-3">
            Inventario
          </Heading>
          <p className="mt-1 text-sm text-muted-foreground">
            Lotes disponibles con trazabilidad desde el ingreso.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={handleExport}
            disabled={!canExport}
          >
            <Download size={16} />
            Exportar Excel
          </Button>
          <Button onClick={() => setEntryModalOpen(true)}>
            <Plus size={16} />
            Nuevo ingreso
          </Button>
        </div>
      </div>

      {/* Alertas */}
      {(alerts.low > 0 || alerts.expiring > 0) && (
        <div className="flex flex-wrap gap-2">
          {alerts.low > 0 && (
            <span className="inline-flex items-center gap-2 rounded-full border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive">
              <AlertTriangle size={13} />
              {alerts.low} con stock bajo
            </span>
          )}
          {alerts.expiring > 0 && (
            <span className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent">
              <CalendarClock size={13} />
              {alerts.expiring} por vencer (≤{EXPIRING_SOON_DAYS} días)
            </span>
          )}
        </div>
      )}

      {/* Tabs + búsqueda */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: "stock", label: "Stock actual" },
            { value: "ingresos", label: "Ingresos" },
          ]}
        />
        <div className="relative w-full max-w-xs">
          <Search
            size={16}
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              tab === "stock" ? "Buscar ingrediente…" : "Buscar por lote…"
            }
            className="h-10 w-full rounded-lg border border-input bg-background pl-10 pr-4 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </div>

      {/* Contenido */}
      {tab === "stock" ? (
        loadingStock ? (
          <SpinnerBlock />
        ) : rows.length === 0 ? (
          <EmptyState onNew={() => setEntryModalOpen(true)} search={search} />
        ) : (
          <div className="glass-card overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Ingrediente</th>
                  <th className="px-4 py-3 text-right font-medium">
                    Disponible
                  </th>
                  <th className="px-4 py-3 text-right font-medium">Lotes</th>
                  <th className="px-4 py-3 font-medium">Próx. vencimiento</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => {
                  const d = daysUntil(r.nextExpiry);
                  const isLow = r.total < r.lowThreshold;
                  const isExpiring = d !== null && d <= EXPIRING_SOON_DAYS;
                  const expanded = expandedIngredient === r.ingredientId;
                  return (
                    <StockRowGroup
                      key={r.ingredientId}
                      row={r}
                      d={d}
                      isLow={isLow}
                      isExpiring={isExpiring}
                      expanded={expanded}
                      onToggle={() =>
                        setExpandedIngredient(expanded ? null : r.ingredientId)
                      }
                      onAdjust={setAdjustTarget}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      ) : loadingHistory ? (
        <SpinnerBlock />
      ) : (history ?? []).length === 0 ? (
        <EmptyState onNew={() => setEntryModalOpen(true)} search={search} />
      ) : (
        <div className="glass-card overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium">Ingrediente</th>
                <th className="px-4 py-3 font-medium">Lote</th>
                <th className="px-4 py-3 text-right font-medium">Ingresado</th>
                <th className="px-4 py-3 text-right font-medium">Restante</th>
                <th className="px-4 py-3 font-medium">Vence</th>
                <th className="px-4 py-3 font-medium">Proveedor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(history ?? []).map((e) => (
                <tr key={e.id} className="transition hover:bg-secondary/40">
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatDate(e.created_at)}
                  </td>
                  <td className="px-4 py-3 font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      {e.ingredient?.name}
                      {e.is_frozen && (
                        <Snowflake size={12} className="text-primary" />
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Money className="text-xs">{e.lot_number}</Money>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Money>
                      {formatQty(e.quantity)} {e.unit}
                    </Money>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Money
                      className={cn(
                        e.remaining_quantity === 0 && "text-muted-foreground",
                      )}
                    >
                      {formatQty(e.remaining_quantity)} {e.unit}
                    </Money>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatDate(e.expiry_date)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {e.supplier?.name ?? "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <StockEntryFormModal
        open={entryModalOpen}
        onOpenChange={setEntryModalOpen}
      />
      <AdjustEntryModal
        entry={adjustTarget}
        onClose={() => setAdjustTarget(null)}
      />
    </div>
  );
}

function StockRowGroup({
  row,
  d,
  isLow,
  isExpiring,
  expanded,
  onToggle,
  onAdjust,
}: {
  row: StockRow;
  d: number | null;
  isLow: boolean;
  isExpiring: boolean;
  expanded: boolean;
  onToggle: () => void;
  onAdjust: (e: StockEntry) => void;
}) {
  return (
    <>
      <tr
        className="cursor-pointer transition hover:bg-secondary/40"
        onClick={onToggle}
      >
        <td className="px-4 py-3">
          <span className="flex items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-md bg-muted/60 text-muted-foreground">
              {row.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={row.imageUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <Package size={16} />
              )}
            </span>
            <span className="font-medium">{row.name}</span>
          </span>
        </td>
        <td className="px-4 py-3 text-right">
          <Money className={cn("font-semibold", isLow && "text-destructive")}>
            {formatQty(row.total)} {row.unit}
          </Money>
        </td>
        <td className="px-4 py-3 text-right text-muted-foreground">
          {row.lots.length}
        </td>
        <td className="px-4 py-3 text-muted-foreground">
          {row.nextExpiry ? (
            <span
              className={cn(
                isExpiring && "font-semibold text-accent",
                d !== null && d < 0 && "font-semibold text-destructive",
              )}
            >
              {formatDate(row.nextExpiry)}
              {d !== null && (
                <span className="ml-1 text-xs">
                  ({d < 0 ? `vencido hace ${-d}d` : `${d}d`})
                </span>
              )}
            </span>
          ) : (
            "-"
          )}
        </td>
        <td className="px-4 py-3">
          <span className="flex gap-1.5">
            {isLow && (
              <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-medium text-destructive">
                Stock bajo
              </span>
            )}
            {isExpiring && (
              <span className="rounded-full bg-accent/15 px-2 py-0.5 text-xs font-medium text-accent">
                Por vencer
              </span>
            )}
            {!isLow && !isExpiring && (
              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">
                OK
              </span>
            )}
          </span>
        </td>
      </tr>
      {expanded &&
        row.lots.map((lot) => {
          const ld = daysUntil(lot.expiry_date);
          return (
            <tr key={lot.id} className="bg-muted/20">
              <td className="px-4 py-2 pl-16 text-xs text-muted-foreground">
                Lote <Money>{lot.lot_number}</Money>
                {lot.is_frozen && (
                  <Snowflake size={11} className="ml-1.5 inline text-primary" />
                )}
                {lot.is_internal_use && (
                  <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5">
                    uso interno
                  </span>
                )}
              </td>
              <td className="px-4 py-2 text-right text-xs">
                <Money>
                  {formatQty(lot.remaining_quantity)} {lot.unit}
                </Money>
              </td>
              <td className="px-4 py-2 text-right text-xs text-muted-foreground">
                {lot.supplier?.name ?? ""}
              </td>
              <td
                className={cn(
                  "px-4 py-2 text-xs text-muted-foreground",
                  ld !== null && ld < 0 && "font-semibold text-destructive",
                )}
              >
                {formatDate(lot.expiry_date)}
              </td>
              <td className="px-4 py-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAdjust(lot);
                  }}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground"
                >
                  <Wrench size={12} />
                  Ajustar
                </button>
              </td>
            </tr>
          );
        })}
    </>
  );
}

function EmptyState({
  onNew,
  search,
}: {
  onNew: () => void;
  search: string;
}) {
  return (
    <div className="glass-card flex flex-col items-center gap-3 py-14 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-lg bg-primary/15 text-primary">
        <Package size={26} />
      </span>
      <div>
        <p className="font-semibold">
          {search ? "Sin resultados" : "Todavía no hay stock"}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {search
            ? "Probá con otra búsqueda."
            : "Registrá tu primer ingreso con lote y vencimiento."}
        </p>
      </div>
      {!search && (
        <Button onClick={onNew}>
          <Plus size={16} />
          Nuevo ingreso
        </Button>
      )}
    </div>
  );
}
