"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Beaker,
  CalendarClock,
  FileText,
  Package,
  ShieldCheck,
  Soup,
  TrendingDown,
  TrendingUp,
  Truck,
  UtensilsCrossed,
} from "lucide-react";
import { Accent, Display, Eyebrow, Heading, Money } from "@/components/ui/Typography";
import { BarsChart } from "@/components/charts/BarsChart";
import { cn } from "@/lib/utils/cn";
import { formatDate, formatQty } from "@/lib/utils/format";
import type {
  ComplianceCards,
  MonthKpis,
  ProductionMonthPoint,
  RecentActivity,
  StockAlerts,
  VehicleHabilitation,
} from "@/modules/dashboard/api";
import {
  useComplianceCards,
  useMonthKpis,
  useProductionSeries,
  useRecentActivity,
  useStockAlerts,
} from "@/modules/dashboard/hooks";

export function DashboardClient({ tenantName }: { tenantName: string }) {
  const kpis = useMonthKpis();
  const series = useProductionSeries(6);
  const compliance = useComplianceCards();
  const stock = useStockAlerts();
  const activity = useRecentActivity();

  return (
    <div className="space-y-8">
      {/* Saludo */}
      <div>
        <Eyebrow>Panel</Eyebrow>
        <Display className="mt-4 text-3xl md:text-4xl">
          Hola, <Accent>{tenantName}</Accent>.
        </Display>
        <p className="mt-3 text-sm text-muted-foreground">
          Tu centro de control bromatológico. Producción, compliance y alertas
          en un vistazo.
        </p>
      </div>

      {/* Fila de KPIs */}
      <KpiRow data={kpis.data} loading={kpis.isLoading} />

      {/* Gráfico de producción */}
      <ProductionChart data={series.data} loading={series.isLoading} />

      {/* Compliance + Stock */}
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2 grid gap-6 md:grid-cols-2">
          <LatestReportCard
            data={compliance.data}
            loading={compliance.isLoading}
          />
          <AnalysesCard data={compliance.data} loading={compliance.isLoading} />
          <RnpaCard data={compliance.data} loading={compliance.isLoading} />
          <TransportCard data={compliance.data} loading={compliance.isLoading} />
        </div>
        <StockAlertsCard data={stock.data} loading={stock.isLoading} />
      </div>

      {/* Actividad reciente */}
      <RecentActivitySection
        data={activity.data}
        loading={activity.isLoading}
      />
    </div>
  );
}

// ── Card base glass ──────────────────────────────────────────────────────────

function Panel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "glass-card animate-fade-in p-5",
        className,
      )}
    >
      {children}
    </div>
  );
}

function PanelHeader({
  icon: Icon,
  title,
  href,
  hrefLabel,
}: {
  icon: React.ElementType;
  title: string;
  href?: string;
  hrefLabel?: string;
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-2">
      <span className="flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-ninjaSm bg-primary/15 text-primary">
          <Icon size={16} />
        </span>
        <span className="font-display text-sm font-bold tracking-tight">
          {title}
        </span>
      </span>
      {href && (
        <Link
          href={href}
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition hover:text-primary"
        >
          {hrefLabel ?? "Ver"}
          <ArrowRight size={13} />
        </Link>
      )}
    </div>
  );
}

function CardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2.5">
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-3 animate-pulse rounded-full bg-muted"
          style={{ width: `${90 - i * 12}%` }}
        />
      ))}
    </div>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <p className="py-2 text-sm text-muted-foreground">{children}</p>
  );
}

// ── KPIs ─────────────────────────────────────────────────────────────────────

function KpiRow({
  data,
  loading,
}: {
  data: MonthKpis | undefined;
  loading: boolean;
}) {
  if (loading || !data) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Panel key={i}>
            <div className="h-3 w-24 animate-pulse rounded-full bg-muted" />
            <div className="mt-3 h-8 w-32 animate-pulse rounded-lg bg-muted" />
          </Panel>
        ))}
      </div>
    );
  }

  const delta = data.kgDeltaPct;
  const positive = delta !== null && delta >= 0;

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Panel className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-brand-gradient opacity-10 blur-2xl"
          aria-hidden
        />
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Producción del mes
        </p>
        <p className="mt-2 flex items-baseline gap-1.5">
          <Money className="text-3xl font-black text-foreground">
            {formatQty(data.kgThisMonth, { maximumFractionDigits: 1 })}
          </Money>
          <span className="text-sm text-muted-foreground">kg</span>
        </p>
        {delta !== null ? (
          <span
            className={cn(
              "mt-2 inline-flex items-center gap-1 rounded-ninjaFull px-2 py-0.5 text-xs font-medium",
              positive
                ? "bg-primary/15 text-primary"
                : "bg-destructive/15 text-destructive",
            )}
          >
            {positive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {positive ? "+" : ""}
            {delta.toFixed(0)}% vs mes anterior
          </span>
        ) : (
          <span className="mt-2 inline-block text-xs text-muted-foreground">
            Sin base de comparación
          </span>
        )}
      </Panel>

      <KpiSimple
        label="Producciones"
        value={String(data.productionsThisMonth)}
        hint="completadas este mes"
        icon={Soup}
      />
      <KpiSimple
        label="Despachos"
        value={String(data.dispatchesThisMonth)}
        hint="este mes"
        icon={Truck}
      />
      <KpiSimple
        label="Conformidad"
        value={
          data.conformityAvg !== null
            ? `${data.conformityAvg.toFixed(0)}`
            : "-"
        }
        suffix={data.conformityAvg !== null ? "/100" : undefined}
        hint={`${data.analysesThisMonth} análisis este mes`}
        icon={Beaker}
        tone={
          data.conformityAvg === null
            ? "muted"
            : data.conformityAvg >= 80
              ? "ok"
              : data.conformityAvg >= 60
                ? "warn"
                : "bad"
        }
      />
    </div>
  );
}

function KpiSimple({
  label,
  value,
  suffix,
  hint,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string;
  suffix?: string;
  hint: string;
  icon: React.ElementType;
  tone?: "default" | "ok" | "warn" | "bad" | "muted";
}) {
  const toneClass =
    tone === "ok"
      ? "text-primary"
      : tone === "warn"
        ? "text-accent"
        : tone === "bad"
          ? "text-destructive"
          : "text-foreground";
  return (
    <Panel>
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <Icon size={15} className="text-muted-foreground" />
      </div>
      <p className="mt-2 flex items-baseline gap-1">
        <Money className={cn("text-3xl font-black", toneClass)}>{value}</Money>
        {suffix && (
          <span className="text-sm text-muted-foreground">{suffix}</span>
        )}
      </p>
      <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
    </Panel>
  );
}

// ── Gráfico de producción (barras CSS, sin librerías) ────────────────────────
// Mismo enfoque que el reporte del POS (DayBars): flex items-end + alturas en %,
// degradé de marca y tooltip nativo. Cero dependencias de charts.

function ProductionChart({
  data,
  loading,
}: {
  data: ProductionMonthPoint[] | undefined;
  loading: boolean;
}) {
  const points = data ?? [];
  const totalKg = points.reduce((a, p) => a + p.kg, 0);
  const hasData = totalKg > 0;

  return (
    <Panel>
      <PanelHeader
        icon={Soup}
        title="Producción · últimos 6 meses (kg)"
        href="/produccion"
        hrefLabel="Ver producción"
      />
      {loading ? (
        <div className="flex h-44 items-end gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex-1 animate-pulse rounded-t-md bg-muted"
              style={{ height: `${30 + ((i * 37) % 60)}%` }}
            />
          ))}
        </div>
      ) : !hasData ? (
        <div className="flex h-44 flex-col items-center justify-center gap-2 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-ninjaMd bg-primary/10 text-primary">
            <Soup size={22} />
          </span>
          <p className="text-sm font-medium">Todavía no hay producción</p>
          <p className="text-xs text-muted-foreground">
            Cuando completes producciones vas a ver la evolución acá.
          </p>
        </div>
      ) : (
        <BarsChart
          capitalizeLabels
          points={points.map((p) => ({
            key: p.key,
            label: p.label,
            value: p.kg,
            hoverLabel: formatQty(p.kg, { maximumFractionDigits: 0 }),
            title: `${p.label}: ${formatQty(p.kg, {
              maximumFractionDigits: 1,
            })} kg · ${p.count} producción${p.count === 1 ? "" : "es"}`,
          }))}
        />
      )}
    </Panel>
  );
}

// ── Compliance: último informe ───────────────────────────────────────────────

function importanceTone(importance: number): {
  label: string;
  cls: string;
} {
  if (importance >= 80)
    return { label: "Crítico", cls: "bg-destructive/15 text-destructive" };
  if (importance >= 50)
    return { label: "Importante", cls: "bg-accent/15 text-accent" };
  return { label: "Informativo", cls: "bg-primary/15 text-primary" };
}

function LatestReportCard({
  data,
  loading,
}: {
  data: ComplianceCards | undefined;
  loading: boolean;
}) {
  return (
    <Panel>
      <PanelHeader
        icon={FileText}
        title="Último informe"
        href="/informes"
        hrefLabel="Ver informes"
      />
      {loading ? (
        <CardSkeleton lines={2} />
      ) : !data?.latestReport ? (
        <EmptyHint>Todavía no cargaste informes bromatológicos.</EmptyHint>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">
              {formatDate(data.latestReport.report_date)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Importancia{" "}
              <Money className="text-foreground">
                {data.latestReport.importance}
              </Money>
              /100
            </p>
          </div>
          <span
            className={cn(
              "shrink-0 rounded-ninjaFull px-3 py-1 text-xs font-semibold",
              importanceTone(data.latestReport.importance).cls,
            )}
          >
            {importanceTone(data.latestReport.importance).label}
          </span>
        </div>
      )}
    </Panel>
  );
}

// ── Compliance: análisis del mes ─────────────────────────────────────────────

function AnalysesCard({
  data,
  loading,
}: {
  data: ComplianceCards | undefined;
  loading: boolean;
}) {
  return (
    <Panel>
      <PanelHeader
        icon={Beaker}
        title="Análisis del mes"
        href="/analisis"
        hrefLabel="Ver análisis"
      />
      {loading ? (
        <CardSkeleton lines={2} />
      ) : !data || data.analysesThisMonth === 0 ? (
        <EmptyHint>No hay análisis cargados este mes.</EmptyHint>
      ) : (
        <div className="flex items-end justify-between gap-3">
          <div>
            <Money className="text-3xl font-black">
              {data.analysesThisMonth}
            </Money>
            <p className="mt-1 text-xs text-muted-foreground">
              análisis registrados
            </p>
          </div>
          {data.conformityAvg !== null && (
            <div className="text-right">
              <p className="text-xs text-muted-foreground">
                Conformidad prom.
              </p>
              <Money
                className={cn(
                  "text-xl font-bold",
                  data.conformityAvg >= 80
                    ? "text-primary"
                    : data.conformityAvg >= 60
                      ? "text-accent"
                      : "text-destructive",
                )}
              >
                {data.conformityAvg.toFixed(0)}/100
              </Money>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

// ── Compliance: RNPA por vencer ──────────────────────────────────────────────

function expiryPill(days: number) {
  if (days < 0)
    return {
      cls: "bg-destructive/15 text-destructive",
      text: `vencido hace ${-days}d`,
    };
  if (days <= 60)
    return { cls: "bg-accent/15 text-accent", text: `${days}d` };
  return { cls: "bg-muted text-muted-foreground", text: `${days}d` };
}

function RnpaCard({
  data,
  loading,
}: {
  data: ComplianceCards | undefined;
  loading: boolean;
}) {
  const list = data?.expiringRnpa ?? [];
  return (
    <Panel>
      <PanelHeader
        icon={UtensilsCrossed}
        title="RNPA por vencer"
        href="/recetas"
        hrefLabel="Ver recetas"
      />
      {loading ? (
        <CardSkeleton />
      ) : list.length === 0 ? (
        <EmptyHint>Ningún RNPA vence en los próximos 90 días.</EmptyHint>
      ) : (
        <ul className="space-y-2">
          {list.slice(0, 4).map((r) => {
            const pill = expiryPill(r.days);
            return (
              <li
                key={r.id}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <span className="min-w-0 truncate">
                  {r.commercial_name || r.title}
                  {r.rnpa_number && (
                    <Money className="ml-1.5 text-xs text-muted-foreground">
                      {r.rnpa_number}
                    </Money>
                  )}
                </span>
                <span
                  className={cn(
                    "shrink-0 rounded-ninjaFull px-2 py-0.5 text-xs font-medium",
                    pill.cls,
                  )}
                >
                  {pill.text}
                </span>
              </li>
            );
          })}
          {list.length > 4 && (
            <li className="pt-1 text-xs text-muted-foreground">
              +{list.length - 4} más
            </li>
          )}
        </ul>
      )}
    </Panel>
  );
}

// ── Compliance: transporte UTA/URA ───────────────────────────────────────────

const VEHICLE_STATUS_META: Record<
  VehicleHabilitation["status"],
  { label: string; cls: string }
> = {
  expired: { label: "Vencido", cls: "bg-destructive/15 text-destructive" },
  soon: { label: "Por vencer", cls: "bg-accent/15 text-accent" },
  missing: { label: "Sin datos", cls: "bg-muted text-muted-foreground" },
  ok: { label: "Vigente", cls: "bg-primary/15 text-primary" },
};

function TransportCard({
  data,
  loading,
}: {
  data: ComplianceCards | undefined;
  loading: boolean;
}) {
  const vehicles = data?.vehicles ?? [];
  return (
    <Panel>
      <PanelHeader
        icon={Truck}
        title="Transporte (UTA/URA)"
        href="/despacho"
        hrefLabel="Ver despacho"
      />
      {loading ? (
        <CardSkeleton />
      ) : vehicles.length === 0 ? (
        <EmptyHint>Todavía no registraste vehículos.</EmptyHint>
      ) : (
        <ul className="space-y-2">
          {vehicles.slice(0, 4).map((v) => {
            const meta = VEHICLE_STATUS_META[v.status];
            return (
              <li
                key={v.id}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <Money className="font-medium">{v.plate}</Money>
                <span
                  className={cn(
                    "shrink-0 rounded-ninjaFull px-2 py-0.5 text-xs font-medium",
                    meta.cls,
                  )}
                >
                  {meta.label}
                </span>
              </li>
            );
          })}
          {vehicles.length > 4 && (
            <li className="pt-1 text-xs text-muted-foreground">
              +{vehicles.length - 4} más
            </li>
          )}
        </ul>
      )}
    </Panel>
  );
}

// ── Alertas de stock ─────────────────────────────────────────────────────────

function StockAlertsCard({
  data,
  loading,
}: {
  data: StockAlerts | undefined;
  loading: boolean;
}) {
  const hasAlerts =
    data && (data.lowCount > 0 || data.expiringCount > 0);

  return (
    <Panel className="flex flex-col">
      <PanelHeader
        icon={Package}
        title="Alertas de stock"
        href="/inventario"
        hrefLabel="Ir a inventario"
      />
      {loading ? (
        <CardSkeleton lines={4} />
      ) : !hasAlerts ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-4 text-center">
          <span className="grid h-11 w-11 place-items-center rounded-ninjaMd bg-primary/10 text-primary">
            <ShieldCheck size={20} />
          </span>
          <p className="text-sm font-medium">Todo en orden</p>
          <p className="text-xs text-muted-foreground">
            Sin stock bajo ni lotes próximos a vencer.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {data.low.length > 0 && (
            <div>
              <p className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-destructive">
                <AlertTriangle size={13} /> Stock bajo ({data.lowCount})
              </p>
              <ul className="space-y-1.5">
                {data.low.slice(0, 4).map((a) => (
                  <li
                    key={a.ingredientId}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <span className="min-w-0 truncate">{a.name}</span>
                    <Money className="shrink-0 text-xs font-medium text-destructive">
                      {formatQty(a.total)} {a.unit}
                    </Money>
                  </li>
                ))}
                {data.low.length > 4 && (
                  <li className="text-xs text-muted-foreground">
                    +{data.low.length - 4} más
                  </li>
                )}
              </ul>
            </div>
          )}

          {data.expiring.length > 0 && (
            <div>
              <p className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-accent">
                <CalendarClock size={13} /> Por vencer ({data.expiringCount})
              </p>
              <ul className="space-y-1.5">
                {data.expiring.slice(0, 4).map((a) => (
                  <li
                    key={a.ingredientId}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <span className="min-w-0 truncate">{a.name}</span>
                    <span
                      className={cn(
                        "shrink-0 text-xs font-medium",
                        a.expiryDays !== null && a.expiryDays < 0
                          ? "text-destructive"
                          : "text-accent",
                      )}
                    >
                      {a.expiryDays !== null && a.expiryDays < 0
                        ? `vencido hace ${-a.expiryDays}d`
                        : `${a.expiryDays}d`}
                    </span>
                  </li>
                ))}
                {data.expiring.length > 4 && (
                  <li className="text-xs text-muted-foreground">
                    +{data.expiring.length - 4} más
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

// ── Actividad reciente ───────────────────────────────────────────────────────

function RecentActivitySection({
  data,
  loading,
}: {
  data: RecentActivity | undefined;
  loading: boolean;
}) {
  return (
    <div>
      <Heading as="h2" className="mb-4 text-lg">
        Actividad reciente
      </Heading>
      <div className="grid gap-6 md:grid-cols-2">
        <Panel>
          <PanelHeader
            icon={Soup}
            title="Últimas producciones"
            href="/produccion"
          />
          {loading ? (
            <CardSkeleton lines={5} />
          ) : !data || data.productions.length === 0 ? (
            <EmptyHint>Todavía no completaste producciones.</EmptyHint>
          ) : (
            <ul className="divide-y divide-border">
              {data.productions.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-2 py-2.5 text-sm"
                >
                  <span className="min-w-0">
                    <Money className="text-xs text-primary">{p.code}</Money>
                    <span className="ml-2 truncate">{p.recipeTitle}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    {p.kg !== null && (
                      <Money className="font-medium">
                        {formatQty(p.kg, { maximumFractionDigits: 1 })} kg
                      </Money>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {formatDate(p.date)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel>
          <PanelHeader
            icon={Truck}
            title="Últimos despachos"
            href="/despacho"
          />
          {loading ? (
            <CardSkeleton lines={5} />
          ) : !data || data.dispatches.length === 0 ? (
            <EmptyHint>Todavía no registraste despachos.</EmptyHint>
          ) : (
            <ul className="divide-y divide-border">
              {data.dispatches.map((d) => (
                <li
                  key={d.id}
                  className="flex items-center justify-between gap-2 py-2.5 text-sm"
                >
                  <span className="min-w-0 truncate font-medium">
                    {d.customerName}
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <Money className="font-medium">
                      {formatQty(d.kg, { maximumFractionDigits: 1 })} kg
                    </Money>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(d.date)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
