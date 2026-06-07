"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Download, FlaskConical, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  DateRangePicker,
  type DateRange,
} from "@/components/ui/DateRangePicker";
import { SpinnerBlock } from "@/components/ui/Spinner";
import { Eyebrow, Heading, Money } from "@/components/ui/Typography";
import { AnalysisDetailDrawer } from "@/components/analisis/AnalysisDetailDrawer";
import { AnalysisFormModal } from "@/components/analisis/AnalysisFormModal";
import { ConformityBadge } from "@/components/analisis/ConformityBadge";
import { LaboratoriesModal } from "@/components/analisis/LaboratoriesModal";
import { formatDate } from "@/lib/utils/format";
import { exportToExcel } from "@/lib/utils/xlsx";
import type { Analysis } from "@/modules/quality/api";
import { useAnalyses } from "@/modules/quality/hooks";
import {
  ANALYSIS_TYPE_LABELS,
  ANALYSIS_TYPES,
  conformityCategory,
  type AnalysisType,
} from "@/modules/quality/schemas";

const selectCls =
  "h-11 rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20";

// Análisis de laboratorio: resultados por tipo con conformidad, laboratorio y
// adjuntos. Listado filtrable y exportable (Excel-first).
export default function AnalisisPage() {
  const [search, setSearch] = useState("");
  const [type, setType] = useState<AnalysisType | "">("");
  const [range, setRange] = useState<DateRange | undefined>();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Analysis | null>(null);
  const [labsOpen, setLabsOpen] = useState(false);
  const [detail, setDetail] = useState<Analysis | null>(null);

  const params = useMemo(
    () => ({
      search,
      type: type || null,
      from: range?.from ? format(range.from, "yyyy-MM-dd") : null,
      to: range?.to ? format(range.to, "yyyy-MM-dd") : null,
    }),
    [search, type, range]
  );

  const { data: analyses, isLoading, isError } = useAnalyses(params);
  const rows = analyses ?? [];
  const hasFilters = Boolean(search || type || range);

  function openNew() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(a: Analysis) {
    setDetail(null);
    setEditing(a);
    setFormOpen(true);
  }

  function handleExport() {
    void exportToExcel({
      filename: "analisis-laboratorio",
      sheetName: "Análisis",
      title: "Análisis de laboratorio",
      subtitle: type ? `Tipo: ${ANALYSIS_TYPE_LABELS[type]}` : undefined,
      columns: [
        { header: "Fecha", key: "date", format: "date", width: 14 },
        { header: "Tipo", key: "type", width: 18 },
        { header: "Muestra", key: "sample", width: 18 },
        { header: "Laboratorio", key: "lab", width: 26 },
        { header: "Conformidad", key: "conformity", format: "number", width: 14 },
        { header: "Categoría", key: "category", width: 14 },
      ],
      rows: rows.map((a) => ({
        date: a.analysis_date,
        type: ANALYSIS_TYPE_LABELS[a.type],
        sample: a.sample_code ?? "",
        lab: a.laboratory?.name ?? "",
        conformity: a.conformity,
        category: conformityCategory(a.conformity).label,
      })),
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Eyebrow>Calidad</Eyebrow>
          <Heading as="h1" className="mt-3">
            Análisis de laboratorio
          </Heading>
          <p className="mt-1 text-sm text-muted-foreground">
            Resultados por tipo de muestra con conformidad, laboratorio y
            adjuntos para el aval técnico.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setLabsOpen(true)}>
            <FlaskConical size={16} />
            Laboratorios
          </Button>
          <Button
            variant="secondary"
            onClick={handleExport}
            disabled={rows.length === 0}
          >
            <Download size={16} />
            Exportar Excel
          </Button>
          <Button onClick={openNew}>
            <Plus size={16} />
            Nuevo análisis
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
            placeholder="Buscar por muestra u observación…"
            className="h-11 w-full rounded-lg border border-input bg-background pl-10 pr-4 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <select
          aria-label="Filtrar por tipo"
          value={type}
          onChange={(e) => setType(e.target.value as AnalysisType | "")}
          className={selectCls}
        >
          <option value="">Todos los tipos</option>
          {ANALYSIS_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <DateRangePicker value={range} onChange={setRange} />
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch("");
              setType("");
              setRange(undefined);
            }}
          >
            Limpiar
          </Button>
        )}
      </div>

      {/* Listado */}
      {isLoading ? (
        <SpinnerBlock />
      ) : isError ? (
        <div className="glass-card flex flex-col items-center gap-2 py-14 text-center">
          <p className="font-semibold text-destructive">
            No se pudieron cargar los análisis
          </p>
          <p className="text-sm text-muted-foreground">
            Reintentá en unos segundos.
          </p>
        </div>
      ) : rows.length === 0 ? (
        <div className="glass-card flex flex-col items-center gap-3 py-14 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-lg bg-primary/15 text-primary">
            <FlaskConical size={26} />
          </span>
          <div>
            <p className="font-semibold">
              {hasFilters ? "Sin resultados" : "Todavía no hay análisis"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {hasFilters
                ? "Probá con otro filtro."
                : "Cargá tu primer resultado de laboratorio."}
            </p>
          </div>
          {!hasFilters && (
            <Button onClick={openNew}>
              <Plus size={16} />
              Nuevo análisis
            </Button>
          )}
        </div>
      ) : (
        <div className="glass-card overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-muted/60 text-left text-xs uppercase tracking-[0.14em] text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 font-medium">Muestra</th>
                <th className="px-4 py-3 font-medium">Laboratorio</th>
                <th className="px-4 py-3 text-center font-medium">Adjuntos</th>
                <th className="px-4 py-3 font-medium">Conformidad</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((a) => (
                <tr
                  key={a.id}
                  onClick={() => setDetail(a)}
                  className="cursor-pointer transition hover:bg-secondary/40"
                >
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatDate(a.analysis_date)}
                  </td>
                  <td className="px-4 py-3 font-medium">
                    {ANALYSIS_TYPE_LABELS[a.type]}
                  </td>
                  <td className="px-4 py-3">
                    {a.sample_code ? (
                      <Money className="text-xs">{a.sample_code}</Money>
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {a.laboratory?.name ?? (
                      <span className="text-xs">Sin laboratorio</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center text-muted-foreground">
                    {a.attachments.length || "-"}
                  </td>
                  <td className="px-4 py-3">
                    <ConformityBadge value={a.conformity} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AnalysisFormModal
        open={formOpen}
        onOpenChange={(o) => {
          setFormOpen(o);
          if (!o) setEditing(null);
        }}
        analysis={editing}
      />
      <LaboratoriesModal open={labsOpen} onOpenChange={setLabsOpen} />
      <AnalysisDetailDrawer
        analysis={detail}
        onClose={() => setDetail(null)}
        onEdit={openEdit}
      />
    </div>
  );
}
