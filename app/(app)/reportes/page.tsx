"use client";

import { useMemo, useState } from "react";
import {
  endOfMonth,
  format,
  startOfDay,
  startOfMonth,
  subDays,
  subMonths,
} from "date-fns";
import {
  AlertTriangle,
  Download,
  Soup,
  Truck,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SpinnerBlock } from "@/components/ui/Spinner";
import { Eyebrow, Heading, Money } from "@/components/ui/Typography";
import {
  DateRangePicker,
  type DateRange,
} from "@/components/ui/DateRangePicker";
import { BarsChart } from "@/components/charts/BarsChart";
import { cn } from "@/lib/utils/cn";
import { formatMoney, formatQty } from "@/lib/utils/format";
import { exportSheetsToExcel, type ExportToExcelOptions } from "@/lib/utils/xlsx";
import type { ReportRange } from "@/modules/reports-kpi/api";
import {
  useCostReport,
  useDispatchReport,
  useProductionReport,
} from "@/modules/reports-kpi/hooks";

// ── Presets de período (estilo POS) ───────────────────────────────────────────

type PresetKey = "today" | "7d" | "30d" | "month" | "lastMonth" | "custom";

const PRESETS: { key: Exclude<PresetKey, "custom">; label: string }[] = [
  { key: "today", label: "Hoy" },
  { key: "7d", label: "7 días" },
  { key: "30d", label: "30 días" },
  { key: "month", label: "Este mes" },
  { key: "lastMonth", label: "Mes pasado" },
];

function rangeForPreset(key: Exclude<PresetKey, "custom">): DateRange {
  const today = startOfDay(new Date());
  switch (key) {
    case "today":
      return { from: today, to: today };
    case "7d":
      return { from: startOfDay(subDays(today, 6)), to: today };
    case "30d":
      return { from: startOfDay(subDays(today, 29)), to: today };
    case "month":
      return { from: startOfMonth(today), to: today };
    case "lastMonth": {
      const last = subMonths(today, 1);
      return { from: startOfMonth(last), to: endOfMonth(last) };
    }
  }
}

function toReportRange(range: DateRange | undefined): ReportRange {
  const from = startOfDay(range?.from ?? new Date());
  const to = startOfDay(range?.to ?? range?.from ?? new Date());
  return { from: format(from, "yyyy-MM-dd"), to: format(to, "yyyy-MM-dd") };
}

// ── Página ────────────────────────────────────────────────────────────────────

export default function ReportesPage() {
  const [preset, setPreset] = useState<PresetKey>("30d");
  const [range, setRange] = useState<DateRange | undefined>(() =>
    rangeForPreset("30d"),
  );

  const reportRange = useMemo(() => toReportRange(range), [range]);

  const production = useProductionReport(reportRange);
  const cost = useCostReport(reportRange);
  const dispatch = useDispatchReport(reportRange);

  function applyPreset(key: Exclude<PresetKey, "custom">) {
    setPreset(key);
    setRange(rangeForPreset(key));
  }

  function handleRangeChange(next: DateRange | undefined) {
    setPreset("custom");
    setRange(next);
  }

  const rangeLabel = `${format(
    range?.from ?? new Date(),
    "dd/MM/yyyy",
  )} - ${format(range?.to ?? range?.from ?? new Date(), "dd/MM/yyyy")}`;

  async function exportAll() {
    const sheets: ExportToExcelOptions[] = [];

    if (production.data) {
      sheets.push({
        filename: "",
        sheetName: "Producción",
        title: "Producción por período",
        subtitle: rangeLabel,
        columns: [
          {
            header: production.data.bucketing === "day" ? "Día" : "Semana",
            key: "label",
            width: 16,
          },
          { header: "Kg producidos", key: "kg", format: "number", width: 16 },
          { header: "Producciones", key: "count", format: "number", width: 14 },
        ],
        rows: production.data.buckets.map((b) => ({
          label: b.label,
          kg: b.kg,
          count: b.count,
        })),
      });
    }

    if (cost.data) {
      sheets.push({
        filename: "",
        sheetName: "Costos por receta",
        title: "Costos de insumos por receta",
        subtitle: rangeLabel,
        columns: [
          { header: "Receta", key: "recipe", width: 34 },
          { header: "Kg", key: "kg", format: "number", width: 14 },
          { header: "Costo total", key: "total", format: "currency", width: 18 },
          { header: "$/kg", key: "perKg", format: "currency", width: 16 },
          { header: "Cobertura %", key: "coverage", format: "number", width: 14 },
        ],
        rows: cost.data.rows.map((r) => ({
          recipe: r.recipeName,
          kg: r.kg,
          total: r.totalCost,
          perKg: r.costPerKg,
          coverage: r.coveragePct,
        })),
      });
    }

    if (dispatch.data) {
      sheets.push({
        filename: "",
        sheetName: "Despachos por cliente",
        title: "Despachos por cliente",
        subtitle: rangeLabel,
        columns: [
          { header: "Cliente", key: "customer", width: 34 },
          { header: "Kg despachados", key: "kg", format: "number", width: 16 },
          { header: "Despachos", key: "count", format: "number", width: 14 },
        ],
        rows: dispatch.data.rows.map((r) => ({
          customer: r.customerName,
          kg: r.kg,
          count: r.dispatches,
        })),
      });
    }

    if (sheets.length === 0) return;
    const tag = `${reportRange.from}_${reportRange.to}`;
    await exportSheetsToExcel(`reportes-${tag}`, sheets);
  }

  const anyLoaded = !!(production.data || cost.data || dispatch.data);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Eyebrow>Información</Eyebrow>
          <Heading as="h1" className="mt-3">
            Reportes y costos
          </Heading>
          <p className="mt-1 text-sm text-muted-foreground">
            Producción, costo de insumos por receta y despachos del período.
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={exportAll}
          disabled={!anyLoaded}
        >
          <Download size={16} />
          Exportar Excel
        </Button>
      </div>

      {/* Selector de período */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Período
          </label>
          <DateRangePicker value={range} onChange={handleRangeChange} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Rápido
          </label>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => applyPreset(p.key)}
                className={cn(
                  "rounded-lg border px-3 py-2.5 text-xs font-medium transition",
                  preset === p.key
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-input bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <ProductionSection
        data={production.data}
        loading={production.isLoading}
        error={production.isError}
      />

      <CostSection
        data={cost.data}
        loading={cost.isLoading}
        error={cost.isError}
      />

      <DispatchSection
        data={dispatch.data}
        loading={dispatch.isLoading}
        error={dispatch.isError}
      />
    </div>
  );
}

// ── Sección base ──────────────────────────────────────────────────────────────

function SectionShell({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ElementType;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="glass-card animate-fade-in p-5 sm:p-6">
      <div className="mb-5 flex items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-ninjaSm bg-primary/15 text-primary">
          <Icon size={18} />
        </span>
        <div>
          <h2 className="font-display text-base font-bold tracking-tight">
            {title}
          </h2>
          {subtitle && (
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
      </div>
      {children}
    </section>
  );
}

function SectionError() {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-destructive">
      <AlertTriangle size={16} />
      No se pudo cargar la información.
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="py-10 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function StatTile({
  label,
  value,
  suffix,
}: {
  label: string;
  value: string;
  suffix?: string;
}) {
  return (
    <div className="rounded-ninjaMd border border-border bg-background/40 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1.5 flex items-baseline gap-1">
        <Money className="text-2xl font-black text-foreground">{value}</Money>
        {suffix && (
          <span className="text-sm text-muted-foreground">{suffix}</span>
        )}
      </p>
    </div>
  );
}

// ── Sección Producción ────────────────────────────────────────────────────────

function ProductionSection({
  data,
  loading,
  error,
}: {
  data: ReturnType<typeof useProductionReport>["data"];
  loading: boolean;
  error: boolean;
}) {
  const bucketLabel = data?.bucketing === "week" ? "semana" : "día";
  return (
    <SectionShell
      icon={Soup}
      title="Producción"
      subtitle={
        data
          ? `Agrupada por ${bucketLabel} · kg producidos`
          : "kg producidos por período"
      }
    >
      {loading ? (
        <SpinnerBlock />
      ) : error ? (
        <SectionError />
      ) : !data || data.totalCount === 0 ? (
        <EmptyState>No hubo producciones completadas en el período.</EmptyState>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-3">
            <StatTile
              label="Total producido"
              value={formatQty(data.totalKg, { maximumFractionDigits: 1 })}
              suffix="kg"
            />
            <StatTile
              label="Producciones"
              value={String(data.totalCount)}
            />
            <StatTile
              label={`Promedio por ${bucketLabel}`}
              value={
                data.avgKgPerBucket !== null
                  ? formatQty(data.avgKgPerBucket, { maximumFractionDigits: 1 })
                  : "-"
              }
              suffix={data.avgKgPerBucket !== null ? "kg" : undefined}
            />
          </div>

          <BarsChart
            points={data.buckets.map((b) => ({
              key: b.key,
              label: b.label,
              value: b.kg,
              hoverLabel: formatQty(b.kg, { maximumFractionDigits: 0 }),
              title: `${b.label}: ${formatQty(b.kg, {
                maximumFractionDigits: 1,
              })} kg · ${b.count} producción${b.count === 1 ? "" : "es"}`,
            }))}
          />
        </div>
      )}
    </SectionShell>
  );
}

// ── Sección Costos ────────────────────────────────────────────────────────────

function CostSection({
  data,
  loading,
  error,
}: {
  data: ReturnType<typeof useCostReport>["data"];
  loading: boolean;
  error: boolean;
}) {
  return (
    <SectionShell
      icon={Wallet}
      title="Costos por receta"
      subtitle="Costo de insumos consumidos y costo por kg producido"
    >
      {loading ? (
        <SpinnerBlock />
      ) : error ? (
        <SectionError />
      ) : !data || data.rows.length === 0 ? (
        <EmptyState>
          No hubo producciones con insumos cargados en el período.
        </EmptyState>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <StatTile
              label="Costo total insumos"
              value={formatMoney(data.totalCost)}
            />
            <StatTile
              label="Costo por kg global"
              value={
                data.costPerKg !== null ? formatMoney(data.costPerKg) : "-"
              }
            />
            <StatTile
              label="Cobertura de costos"
              value={
                data.coveragePct !== null
                  ? `${data.coveragePct.toFixed(0)}`
                  : "-"
              }
              suffix={data.coveragePct !== null ? "%" : undefined}
            />
          </div>

          {data.uncoveredInputs > 0 && (
            <p className="flex items-center gap-2 rounded-ninjaMd border border-accent/30 bg-accent/10 px-3 py-2 text-xs text-accent">
              <AlertTriangle size={14} className="shrink-0" />
              {data.uncoveredInputs} insumo
              {data.uncoveredInputs === 1 ? "" : "s"} sin costo unitario cargado.
              El costo mostrado es parcial.
            </p>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2.5 font-medium">Receta</th>
                  <th className="px-3 py-2.5 text-right font-medium">Kg</th>
                  <th className="px-3 py-2.5 text-right font-medium">
                    Costo total
                  </th>
                  <th className="px-3 py-2.5 text-right font-medium">$/kg</th>
                  <th className="px-3 py-2.5 text-right font-medium">
                    Cobertura
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.rows.map((r) => (
                  <tr
                    key={r.recipeId}
                    className="transition hover:bg-secondary/40"
                  >
                    <td className="px-3 py-2.5 font-medium">{r.recipeName}</td>
                    <td className="px-3 py-2.5 text-right">
                      <Money>{formatQty(r.kg, { maximumFractionDigits: 1 })}</Money>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <Money>{formatMoney(r.totalCost)}</Money>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <Money>
                        {r.costPerKg !== null ? formatMoney(r.costPerKg) : "-"}
                      </Money>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <CoverageBadge pct={r.coveragePct} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border font-semibold">
                  <td className="px-3 py-2.5">Total</td>
                  <td className="px-3 py-2.5 text-right">
                    <Money>
                      {formatQty(data.totalKg, { maximumFractionDigits: 1 })}
                    </Money>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <Money>{formatMoney(data.totalCost)}</Money>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <Money>
                      {data.costPerKg !== null
                        ? formatMoney(data.costPerKg)
                        : "-"}
                    </Money>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <CoverageBadge pct={data.coveragePct} />
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </SectionShell>
  );
}

function CoverageBadge({ pct }: { pct: number | null }) {
  if (pct === null)
    return <span className="text-xs text-muted-foreground">-</span>;
  const full = pct >= 99.5;
  return (
    <span
      className={cn(
        "inline-flex rounded-ninjaFull px-2 py-0.5 text-xs font-medium",
        full
          ? "bg-primary/15 text-primary"
          : pct >= 50
            ? "bg-accent/15 text-accent"
            : "bg-destructive/15 text-destructive",
      )}
    >
      {pct.toFixed(0)}%
    </span>
  );
}

// ── Sección Despachos ─────────────────────────────────────────────────────────

function DispatchSection({
  data,
  loading,
  error,
}: {
  data: ReturnType<typeof useDispatchReport>["data"];
  loading: boolean;
  error: boolean;
}) {
  return (
    <SectionShell
      icon={Truck}
      title="Despachos por cliente"
      subtitle="Kg despachados y cantidad de despachos del período"
    >
      {loading ? (
        <SpinnerBlock />
      ) : error ? (
        <SectionError />
      ) : !data || data.rows.length === 0 ? (
        <EmptyState>No hubo despachos en el período.</EmptyState>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <StatTile
              label="Total despachado"
              value={formatQty(data.totalKg, { maximumFractionDigits: 1 })}
              suffix="kg"
            />
            <StatTile
              label="Despachos"
              value={String(data.totalDispatches)}
            />
          </div>

          <DispatchBars rows={data.rows} totalKg={data.totalKg} />
        </div>
      )}
    </SectionShell>
  );
}

function DispatchBars({
  rows,
  totalKg,
}: {
  rows: { customerName: string; kg: number; dispatches: number }[];
  totalKg: number;
}) {
  const top = rows.slice(0, 8);
  const maxKg = Math.max(1, ...top.map((r) => r.kg));
  return (
    <ul className="space-y-3">
      {top.map((r) => {
        const widthPct = Math.max(2, (r.kg / maxKg) * 100);
        const sharePct = totalKg > 0 ? (r.kg / totalKg) * 100 : 0;
        return (
          <li key={r.customerName} className="space-y-1.5">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0 truncate font-medium">
                {r.customerName}
              </span>
              <span className="flex shrink-0 items-center gap-3">
                <Money className="font-medium">
                  {formatQty(r.kg, { maximumFractionDigits: 1 })} kg
                </Money>
                <span className="text-xs text-muted-foreground">
                  {sharePct.toFixed(0)}%
                </span>
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-ninjaFull bg-muted">
              <div
                className="h-full rounded-ninjaFull bg-brand-gradient"
                style={{ width: `${widthPct}%` }}
                title={`${r.customerName}: ${formatQty(r.kg, {
                  maximumFractionDigits: 1,
                })} kg · ${r.dispatches} despacho${r.dispatches === 1 ? "" : "s"}`}
              />
            </div>
          </li>
        );
      })}
      {rows.length > top.length && (
        <li className="pt-1 text-xs text-muted-foreground">
          +{rows.length - top.length} cliente
          {rows.length - top.length === 1 ? "" : "s"} más
        </li>
      )}
    </ul>
  );
}
