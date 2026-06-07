"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  Download,
  FileText,
  Factory,
  PackageSearch,
  Search,
  Truck,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SpinnerBlock } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { Eyebrow, Heading, Money } from "@/components/ui/Typography";
import { cn } from "@/lib/utils/cn";
import { formatDate, formatQty } from "@/lib/utils/format";
import { useTenantBranding } from "@/modules/planillas/hooks";
import type {
  AffectedCustomer,
  BackwardTrace,
  ForwardTrace,
  LotSearchResult,
  TraceDispatch,
} from "@/modules/trace/api";
import {
  backwardToExport,
  exportRecallExcel,
  forwardToExport,
  generateRecallPdf,
  type RecallExportData,
} from "@/modules/trace/exports";
import {
  useBackwardTrace,
  useForwardTrace,
  useLotSearch,
} from "@/modules/trace/hooks";

type Selection = LotSearchResult | null;

export default function TrazabilidadPage() {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Selection>(null);

  const search = useLotSearch(selected ? "" : query);
  const results = search.data ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Eyebrow>Trazabilidad · Recall</Eyebrow>
        <Heading as="h1" className="mt-3">
          Recall y trazabilidad
        </Heading>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Buscá un lote de materia prima (MP) o de producto terminado (PT) y
          reconstruí la cadena completa en segundos. Conforme CAA Art. 1415.
        </p>
      </div>

      {/* Buscador central */}
      <div className="relative">
        <div className="relative">
          {/* z-10: el backdrop-blur del input crea stacking context y sin esto
              lo pinta por encima del ícono */}
          <Search
            size={20}
            className="pointer-events-none absolute left-5 top-1/2 z-10 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="search"
            value={selected ? selected.lotNumber : query}
            onChange={(e) => {
              setSelected(null);
              setQuery(e.target.value);
            }}
            placeholder="Buscar por número de lote (MP o PT)…"
            className="focus:ring-primary/20 h-14 w-full rounded-lg border border-input bg-card pl-14 pr-4 text-base text-foreground shadow-soft outline-none backdrop-blur-xl transition placeholder:text-muted-foreground focus:border-primary focus:ring-4"
          />
        </div>

        {/* Resultados de búsqueda */}
        {!selected && query.trim().length >= 2 && (
          <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-lg border border-border bg-popover/95 shadow-soft backdrop-blur-xl">
            {search.isLoading ? (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                Buscando…
              </div>
            ) : search.isError ? (
              <div className="px-4 py-6 text-center text-sm text-destructive">
                No se pudo buscar. Reintentá.
              </div>
            ) : results.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                Sin coincidencias para{" "}
                <span className="font-medium text-foreground">
                  {query.trim()}
                </span>
                . Probá con el número de lote exacto (MP o PT).
              </div>
            ) : (
              <ul className="max-h-80 divide-y divide-border overflow-y-auto">
                {results.map((r) => (
                  <li key={`${r.type}-${r.id}`}>
                    <button
                      type="button"
                      onClick={() => setSelected(r)}
                      className="hover:bg-secondary/50 flex w-full items-center gap-3 px-4 py-3 text-left transition"
                    >
                      <TypeBadge type={r.type} />
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 truncate font-medium">
                          <Money className="text-sm">{r.lotNumber}</Money>
                          <span className="truncate text-muted-foreground">
                            · {r.label}
                          </span>
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {[r.detail, r.date ? formatDate(r.date) : null]
                            .filter(Boolean)
                            .join(" · ") || "Sin datos adicionales"}
                        </p>
                      </div>
                      <ArrowRight
                        size={16}
                        className="shrink-0 text-muted-foreground"
                      />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {!selected && query.trim().length > 0 && query.trim().length < 2 && (
          <p className="mt-2 px-1 text-xs text-muted-foreground">
            Escribí al menos 2 caracteres del número de lote.
          </p>
        )}
      </div>

      {/* Cadena */}
      {!selected ? (
        <EmptyState />
      ) : selected.type === "MP" ? (
        <ForwardView
          stockEntryId={selected.id}
          onError={() =>
            toast({ variant: "error", title: "No se pudo cargar la cadena" })
          }
        />
      ) : (
        <BackwardView
          productionId={selected.id}
          onError={() =>
            toast({ variant: "error", title: "No se pudo cargar la cadena" })
          }
        />
      )}
    </div>
  );
}

// ── Badge tipo de lote ────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: "MP" | "PT" }) {
  return (
    <span
      className={cn(
        "grid h-7 w-9 shrink-0 place-items-center rounded-lg text-xs font-bold",
        type === "MP"
          ? "bg-amber-500/15 text-amber-500"
          : "bg-primary/15 text-primary",
      )}
    >
      {type}
    </span>
  );
}

// ── Empty / hint inicial ──────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="glass-card flex flex-col items-center gap-3 py-16 text-center">
      <span className="bg-primary/15 grid h-16 w-16 place-items-center rounded-lg text-primary">
        <PackageSearch size={30} />
      </span>
      <div>
        <p className="font-semibold">Empezá por un lote</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          Buscá el número de lote afectado. Para materia prima vas a ver hacia
          adelante (qué se produjo y a quién se despachó). Para producto
          terminado vas a ver sus insumos y sus clientes.
        </p>
      </div>
    </div>
  );
}

// ── Vista FORWARD (lote MP) ───────────────────────────────────────────────────

function ForwardView({
  stockEntryId,
  onError,
}: {
  stockEntryId: string;
  onError: () => void;
}) {
  const { data, isLoading, isError } = useForwardTrace(stockEntryId);
  const { data: branding } = useTenantBranding();

  if (isLoading) return <SpinnerBlock />;
  if (isError || !data) {
    onError();
    return <ErrorState />;
  }

  const exportData = forwardToExport(data, branding?.locale);

  return (
    <div className="space-y-6">
      <ExportBar data={exportData} locale={branding?.locale} />
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1.2fr]">
        {/* Origen */}
        <ChainColumn icon={<Boxes size={16} />} title="Origen · Materia prima">
          <article className="glass-card space-y-2 p-4">
            <div className="flex items-center justify-between gap-2">
              <TypeBadge type="MP" />
              <Money className="text-sm font-semibold">
                {data.origin.lotNumber}
              </Money>
            </div>
            <p className="font-medium">{data.origin.ingredientName}</p>
            <dl className="space-y-1 text-xs text-muted-foreground">
              <Row label="Proveedor" value={data.origin.supplier?.name ?? "-"} />
              <Row
                label="RNE"
                value={data.origin.supplier?.rneNumber ?? "-"}
              />
              <Row
                label="Ingresado"
                value={`${formatQty(data.origin.quantity)} ${data.origin.unit}`}
              />
              <Row
                label="Restante"
                value={`${formatQty(data.origin.remainingQuantity)} ${data.origin.unit}`}
              />
              <Row
                label="Vence"
                value={formatDate(data.origin.expiryDate)}
              />
            </dl>
            {data.origin.noTraceability && (
              <p className="text-amber-500/90 flex items-center gap-1.5 text-xs">
                <AlertTriangle size={13} /> Sin trazabilidad de origen
              </p>
            )}
          </article>
        </ChainColumn>

        {/* Producción */}
        <ChainColumn icon={<Factory size={16} />} title="Producción · Lote PT">
          {data.productions.length === 0 ? (
            <EmptyColumn text="Este lote todavía no se consumió en ninguna producción." />
          ) : (
            data.productions.map((p) => (
              <article key={p.productionId} className="glass-card space-y-2 p-4">
                <div className="flex items-center justify-between gap-2">
                  <Money className="text-xs font-semibold">{p.code}</Money>
                  <span className="bg-primary/10 rounded-full px-2 py-0.5 text-xs font-medium text-primary">
                    {formatQty(p.consumedQty)} {p.consumedUnit}
                  </span>
                </div>
                <p className="text-sm font-medium">{p.recipeTitle}</p>
                <dl className="space-y-1 text-xs text-muted-foreground">
                  <Row label="Lote PT" value={p.productLotNumber ?? "-"} />
                  <Row label="Producido" value={`${formatQty(p.producedKg)} kg`} />
                  <Row label="Fecha" value={formatDate(p.productionDate)} />
                  <Row label="Vence" value={formatDate(p.productExpiryDate)} />
                </dl>
                {p.isSubstitute && (
                  <p className="text-xs text-muted-foreground">
                    Usado como sustituto
                  </p>
                )}
              </article>
            ))
          )}
        </ChainColumn>

        {/* Despachos */}
        <ChainColumn icon={<Truck size={16} />} title="Despacho · Clientes">
          {data.productions.every((p) => p.dispatches.length === 0) ? (
            <EmptyColumn text="Las producciones de este lote aún no se despacharon." />
          ) : (
            data.productions.flatMap((p) =>
              p.dispatches.map((d) => (
                <DispatchCard key={d.dispatchItemId} dispatch={d} code={p.code} />
              )),
            )
          )}
        </ChainColumn>
      </div>

      <AffectedPanel
        customers={data.affectedCustomers}
        totalKg={data.totalDispatchedKg}
      />
    </div>
  );
}

// ── Vista BACKWARD (lote PT) ──────────────────────────────────────────────────

function BackwardView({
  productionId,
  onError,
}: {
  productionId: string;
  onError: () => void;
}) {
  const { data, isLoading, isError } = useBackwardTrace(productionId);
  const { data: branding } = useTenantBranding();

  if (isLoading) return <SpinnerBlock />;
  if (isError || !data) {
    onError();
    return <ErrorState />;
  }

  const exportData = backwardToExport(data, branding?.locale);

  return (
    <div className="space-y-6">
      <ExportBar data={exportData} locale={branding?.locale} />
      <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr_1.2fr]">
        {/* Insumos (backward) */}
        <ChainColumn
          icon={<Boxes size={16} />}
          title="Origen · Insumos consumidos"
        >
          {data.inputs.length === 0 ? (
            <EmptyColumn text="Sin insumos registrados." />
          ) : (
            data.inputs.map((i) => (
              <article key={i.inputId} className="glass-card space-y-1.5 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-medium">
                    {i.ingredientName}
                  </p>
                  <span className="bg-amber-500/10 text-amber-500 shrink-0 rounded-full px-2 py-0.5 text-xs font-medium">
                    {formatQty(i.takenQty)} {i.unit}
                  </span>
                </div>
                {i.noOriginTrace ? (
                  <p className="text-amber-500/90 flex items-center gap-1.5 text-xs">
                    <AlertTriangle size={13} /> Sin trazabilidad de origen
                  </p>
                ) : (
                  <dl className="space-y-1 text-xs text-muted-foreground">
                    <Row label="Lote" value={i.lotNumber ?? "-"} />
                    <Row label="Proveedor" value={i.supplier?.name ?? "-"} />
                    <Row label="RNE" value={i.supplier?.rneNumber ?? "-"} />
                    <Row label="Vence" value={formatDate(i.expiryDate)} />
                  </dl>
                )}
                {i.isSubstitute && (
                  <p className="text-xs text-muted-foreground">Sustituto</p>
                )}
              </article>
            ))
          )}
        </ChainColumn>

        {/* Producción */}
        <ChainColumn icon={<Factory size={16} />} title="Producción · Lote PT">
          <article className="glass-card space-y-2 p-4">
            <div className="flex items-center justify-between gap-2">
              <TypeBadge type="PT" />
              <Money className="text-sm font-semibold">
                {data.production.productLotNumber ?? data.production.code}
              </Money>
            </div>
            <p className="font-medium">{data.production.recipeTitle}</p>
            <dl className="space-y-1 text-xs text-muted-foreground">
              <Row label="Producción" value={data.production.code} />
              <Row label="RNPA" value={data.production.rnpaNumber ?? "-"} />
              <Row
                label="Producido"
                value={`${formatQty(data.production.quantityKg)} kg`}
              />
              <Row
                label="Fecha"
                value={formatDate(data.production.productionDate)}
              />
              <Row
                label="Vence"
                value={formatDate(data.production.productExpiryDate)}
              />
            </dl>
          </article>
        </ChainColumn>

        {/* Despachos */}
        <ChainColumn icon={<Truck size={16} />} title="Despacho · Clientes">
          {data.dispatches.length === 0 ? (
            <EmptyColumn text="Este lote de producto aún no se despachó." />
          ) : (
            data.dispatches.map((d) => (
              <DispatchCard
                key={d.dispatchItemId}
                dispatch={d}
                code={data.production.code}
              />
            ))
          )}
        </ChainColumn>
      </div>

      <AffectedPanel
        customers={data.affectedCustomers}
        totalKg={data.totalDispatchedKg}
      />
    </div>
  );
}

// ── Bloques compartidos ───────────────────────────────────────────────────────

function ChainColumn({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <span className="bg-secondary/60 grid h-7 w-7 place-items-center rounded-lg text-primary">
          {icon}
        </span>
        {title}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt>{label}</dt>
      <dd className="truncate text-right font-medium text-foreground">
        {value}
      </dd>
    </div>
  );
}

function EmptyColumn({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-xs text-muted-foreground">
      {text}
    </div>
  );
}

function DispatchCard({
  dispatch: d,
  code,
}: {
  dispatch: TraceDispatch;
  code: string;
}) {
  const flagged = d.voided || d.deleted;
  return (
    <article
      className={cn(
        "glass-card space-y-1.5 p-4",
        flagged && "ring-destructive/30 ring-1",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-sm font-medium">
          {d.customer?.name ?? "(cliente sin datos)"}
        </p>
        <span className="bg-primary/10 shrink-0 rounded-full px-2 py-0.5 text-xs font-medium text-primary">
          {formatQty(d.quantityKg)} kg
        </span>
      </div>
      <dl className="space-y-1 text-xs text-muted-foreground">
        <Row label="Localidad" value={d.customer?.locality ?? "-"} />
        <Row label="Fecha" value={formatDate(d.dispatchDate)} />
        <Row label="Desde" value={code} />
      </dl>
      {flagged && (
        <p className="flex items-center gap-1.5 text-xs font-medium text-destructive">
          <AlertTriangle size={13} />
          {d.deleted ? "Despacho borrado" : "Despacho anulado"} · mercadería
          salida
        </p>
      )}
    </article>
  );
}

function AffectedPanel({
  customers,
  totalKg,
}: {
  customers: AffectedCustomer[];
  totalKg: number;
}) {
  return (
    <section className="rounded-lg border border-destructive/30 bg-destructive/5 p-5 backdrop-blur-xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="bg-destructive/15 grid h-9 w-9 place-items-center rounded-lg text-destructive">
            <Users size={18} />
          </span>
          <div>
            <h2 className="font-semibold text-foreground">Clientes afectados</h2>
            <p className="text-xs text-muted-foreground">
              Contacto completo para coordinar el retiro de mercado.
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Total despachado
          </p>
          <Money className="text-lg font-bold text-destructive">
            {formatQty(totalKg)} kg
          </Money>
        </div>
      </div>

      {customers.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-destructive/30 bg-background/40 px-4 py-6 text-center text-sm text-muted-foreground">
          No hay clientes afectados: este lote todavía no salió a despacho.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-lg border border-border bg-card/60">
          <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Contacto</th>
                <th className="px-4 py-3 text-right font-medium">Despachos</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {customers.map((c) => (
                <tr key={c.id ?? c.name}>
                  <td className="px-4 py-3">
                    <p className="font-medium">{c.name}</p>
                    {c.locality && (
                      <p className="text-xs text-muted-foreground">
                        {c.locality}
                      </p>
                    )}
                    {c.hasVoidedOrDeleted && (
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-destructive">
                        <AlertTriangle size={11} /> Incluye despacho
                        anulado/borrado
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {[c.phone, c.email, c.address]
                      .filter(Boolean)
                      .join(" · ") || "Sin datos de contacto"}
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">
                    {c.dispatchCount}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Money className="font-semibold">
                      {formatQty(c.totalKg)} kg
                    </Money>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ExportBar({
  data,
  locale,
}: {
  data: RecallExportData;
  locale?: string;
}) {
  const { toast } = useToast();
  const { data: branding } = useTenantBranding();
  const [busy, setBusy] = useState(false);

  async function handleExcel() {
    setBusy(true);
    try {
      await exportRecallExcel(data, locale);
    } catch {
      toast({ variant: "error", title: "No se pudo exportar el Excel" });
    } finally {
      setBusy(false);
    }
  }

  function handlePdf() {
    if (!branding) {
      toast({ variant: "info", title: "Cargando datos de la empresa…" });
      return;
    }
    try {
      generateRecallPdf(data, branding);
    } catch {
      toast({ variant: "error", title: "No se pudo generar el acta" });
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground">
        Lote{" "}
        <Money className="font-semibold text-foreground">
          {data.affectedLot}
        </Money>{" "}
        ({data.affectedType}) ·{" "}
        <span className="font-medium text-foreground">{data.affectedLabel}</span>
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={handleExcel} loading={busy}>
          <Download size={16} />
          Exportar Excel
        </Button>
        <Button variant="destructive" onClick={handlePdf}>
          <FileText size={16} />
          PDF de recall
        </Button>
      </div>
    </div>
  );
}

function ErrorState() {
  return (
    <div className="glass-card flex flex-col items-center gap-2 py-14 text-center">
      <p className="font-semibold text-destructive">
        No se pudo reconstruir la cadena
      </p>
      <p className="text-sm text-muted-foreground">Reintentá en unos segundos.</p>
    </div>
  );
}
