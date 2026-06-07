"use client";

import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Download, X } from "lucide-react";
import { Eyebrow, Display, Money } from "@/components/ui/Typography";
import { Button } from "@/components/ui/Button";
import { SpinnerBlock } from "@/components/ui/Spinner";
import {
  DateRangePicker,
  type DateRange,
} from "@/components/ui/DateRangePicker";
import { useInternalAudit, useInternalTenants } from "@/modules/internal/hooks";
import { useAuditFacets } from "@/modules/internal-ops/hooks";
import { formatDate } from "@/lib/utils/format";
import { exportToExcel } from "@/lib/utils/xlsx";

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  if (value == null) return null;
  return (
    <div className="min-w-0 flex-1">
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </div>
      <pre className="max-h-64 overflow-auto rounded-md border border-border bg-background p-3 font-mono text-xs text-foreground">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export default function InternalAuditPage() {
  const [tenantId, setTenantId] = useState("");
  const [entityType, setEntityType] = useState("");
  const [action, setAction] = useState("");
  const [range, setRange] = useState<DateRange | undefined>(undefined);
  const [openId, setOpenId] = useState<string | null>(null);
  const { data: tenants } = useInternalTenants();
  const { data: facets } = useAuditFacets();
  const {
    data: allEntries,
    isLoading,
    isError,
    refetch,
  } = useInternalAudit(tenantId || null);

  const entries = useMemo(() => {
    const from = range?.from ? new Date(range.from).setHours(0, 0, 0, 0) : null;
    const to = range?.to
      ? new Date(range.to).setHours(23, 59, 59, 999)
      : range?.from
        ? new Date(range.from).setHours(23, 59, 59, 999)
        : null;
    return (allEntries ?? []).filter((e) => {
      if (entityType && e.entityType !== entityType) return false;
      if (action && e.action !== action) return false;
      if (from != null || to != null) {
        const t = new Date(e.createdAt).getTime();
        if (from != null && t < from) return false;
        if (to != null && t > to) return false;
      }
      return true;
    });
  }, [allEntries, entityType, action, range]);

  const hasFilters =
    Boolean(entityType) || Boolean(action) || Boolean(range?.from);
  function clearFilters() {
    setEntityType("");
    setAction("");
    setRange(undefined);
  }

  const tenantName = (id: string | null) =>
    id
      ? tenants?.find((t) => t.id === id)?.name ?? id.slice(0, 8)
      : "Sistema";

  function handleExport() {
    void exportToExcel({
      filename: "auditoria",
      sheetName: "Auditoría",
      title: "Auditoría · Panel Ninja-Soft",
      subtitle: `Emitido ${formatDate(new Date())} · ${entries?.length ?? 0} registros`,
      columns: [
        { header: "Fecha", key: "fecha", format: "datetime", width: 18 },
        { header: "Negocio", key: "tenant", width: 22 },
        { header: "Actor", key: "actor", width: 26 },
        { header: "Acción", key: "action", width: 24 },
        { header: "Entidad", key: "entity", width: 18 },
      ],
      rows: (entries ?? []).map((e) => ({
        fecha: e.createdAt,
        tenant: tenantName(e.tenantId),
        actor: e.actorName ?? e.actorEmail ?? "—",
        action: e.action,
        entity: e.entityType,
      })),
    });
  }

  const selectCls =
    "h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-primary";

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Eyebrow>Operaciones</Eyebrow>
          <Display className="mt-3 text-3xl md:text-4xl">Auditoría</Display>
          <p className="mt-2 text-muted-foreground">
            Bitácora administrativa y operativa de todos los negocios. Solo
            lectura (append-only). Últimos 200 registros.
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleExport}
          disabled={!entries || entries.length === 0}
        >
          <Download size={16} /> Excel
        </Button>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <select
          value={tenantId}
          onChange={(e) => setTenantId(e.target.value)}
          className={selectCls}
        >
          <option value="">Todos los negocios</option>
          {(tenants ?? []).map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select
          value={entityType}
          onChange={(e) => setEntityType(e.target.value)}
          className={selectCls}
        >
          <option value="">Toda entidad</option>
          {(facets?.entityTypes ?? []).map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        <select
          value={action}
          onChange={(e) => setAction(e.target.value)}
          className={selectCls}
        >
          <option value="">Toda acción</option>
          {(facets?.actions ?? []).map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        <DateRangePicker value={range} onChange={setRange} className="h-10" />
        {hasFilters && (
          <button
            onClick={clearFilters}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-2 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <X size={13} /> Limpiar
          </button>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {entries.length} de {allEntries?.length ?? 0}
        </span>
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border border-border bg-card shadow-soft backdrop-blur-xl">
        <table className="w-full min-w-[840px] text-sm">
          <thead className="bg-muted text-left text-xs uppercase tracking-[0.14em] text-muted-foreground">
            <tr>
              <th className="w-8 px-2 py-3" />
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Negocio</th>
              <th className="px-4 py-3">Actor</th>
              <th className="px-4 py-3">Acción</th>
              <th className="px-4 py-3">Entidad</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border text-foreground">
            {isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-10">
                  <SpinnerBlock />
                </td>
              </tr>
            )}
            {isError && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-red-300">
                  Error al cargar.{" "}
                  <button onClick={() => refetch()} className="underline">
                    Reintentar
                  </button>
                </td>
              </tr>
            )}
            {!isLoading && !isError && entries?.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-10 text-center text-muted-foreground"
                >
                  Sin registros de auditoría.
                </td>
              </tr>
            )}
            {entries?.map((e) => {
              const open = openId === e.id;
              const hasDetail =
                e.beforeData != null || e.afterData != null || e.reason;
              return (
                <Fragment key={e.id}>
                  <tr
                    className={
                      "transition hover:bg-muted/40" +
                      (hasDetail ? " cursor-pointer" : "")
                    }
                    onClick={() => hasDetail && setOpenId(open ? null : e.id)}
                  >
                    <td className="px-2 py-3 text-muted-foreground">
                      {hasDetail &&
                        (open ? (
                          <ChevronDown size={14} />
                        ) : (
                          <ChevronRight size={14} />
                        ))}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {fmtDateTime(e.createdAt)}
                    </td>
                    <td className="px-4 py-3">{tenantName(e.tenantId)}</td>
                    <td className="px-4 py-3">
                      <div>{e.actorName ?? e.actorEmail ?? "—"}</div>
                      {e.actorName && e.actorEmail && (
                        <div className="text-xs text-muted-foreground">
                          {e.actorEmail}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-full border border-border bg-muted px-2.5 py-0.5 font-mono text-xs">
                        {e.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {e.entityType}
                      {e.entityId && (
                        <Money className="ml-1 text-xs">
                          {e.entityId.slice(0, 8)}
                        </Money>
                      )}
                    </td>
                  </tr>
                  {open && (
                    <tr className="bg-muted/20">
                      <td colSpan={6} className="px-4 py-4">
                        {e.reason && (
                          <p className="mb-3 text-sm">
                            <span className="font-semibold">Motivo:</span>{" "}
                            {e.reason}
                          </p>
                        )}
                        <div className="flex flex-col gap-3 md:flex-row">
                          <JsonBlock label="Antes" value={e.beforeData} />
                          <JsonBlock label="Después" value={e.afterData} />
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
