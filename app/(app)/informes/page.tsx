"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Download, FileText, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  DateRangePicker,
  type DateRange,
} from "@/components/ui/DateRangePicker";
import { SpinnerBlock } from "@/components/ui/Spinner";
import { Eyebrow, Heading } from "@/components/ui/Typography";
import { ImportanceBadge } from "@/components/informes/ImportanceBadge";
import { ReportDetailDrawer } from "@/components/informes/ReportDetailDrawer";
import { ReportFormModal } from "@/components/informes/ReportFormModal";
import { formatDate } from "@/lib/utils/format";
import { exportToExcel } from "@/lib/utils/xlsx";
import type { Report } from "@/modules/quality/api";
import { useMembers, useReports } from "@/modules/quality/hooks";
import { htmlExcerpt, importanceCategory } from "@/modules/quality/schemas";

// Informes bromatológicos: documentos enriquecidos con importancia, autor,
// destinatarios y adjuntos. Listado filtrable y exportable (Excel-first).
export default function InformesPage() {
  const [search, setSearch] = useState("");
  const [range, setRange] = useState<DateRange | undefined>();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Report | null>(null);
  const [detail, setDetail] = useState<Report | null>(null);

  const params = useMemo(
    () => ({
      search,
      from: range?.from ? format(range.from, "yyyy-MM-dd") : null,
      to: range?.to ? format(range.to, "yyyy-MM-dd") : null,
    }),
    [search, range]
  );

  const { data: reports, isLoading, isError } = useReports(params);
  const { data: members } = useMembers();
  const rows = reports ?? [];
  const hasFilters = Boolean(search || range);

  function openNew() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(r: Report) {
    setDetail(null);
    setEditing(r);
    setFormOpen(true);
  }

  function handleExport() {
    void exportToExcel({
      filename: "informes-bromatologicos",
      sheetName: "Informes",
      title: "Informes bromatológicos",
      columns: [
        { header: "Fecha", key: "date", format: "date", width: 14 },
        { header: "Extracto", key: "excerpt", width: 60 },
        { header: "Importancia", key: "importance", format: "number", width: 14 },
        { header: "Categoría", key: "category", width: 16 },
        { header: "Autor", key: "author", width: 24 },
        { header: "Adjuntos", key: "attachments", format: "number", width: 12 },
      ],
      rows: rows.map((r) => ({
        date: r.report_date,
        excerpt: htmlExcerpt(r.content_html, 160),
        importance: r.importance,
        category: importanceCategory(r.importance).label,
        author: r.member?.full_name ?? "",
        attachments: r.attachments.length,
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
            Informes bromatológicos
          </Heading>
          <p className="mt-1 text-sm text-muted-foreground">
            Documentos enriquecidos con importancia, destinatarios y adjuntos
            para el aval técnico.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
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
            Nuevo informe
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
            placeholder="Buscar en el contenido…"
            className="focus:ring-primary/20 h-11 w-full rounded-lg border border-input bg-background pl-10 pr-4 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2"
          />
        </div>
        <DateRangePicker value={range} onChange={setRange} />
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch("");
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
            No se pudieron cargar los informes
          </p>
          <p className="text-sm text-muted-foreground">
            Reintentá en unos segundos.
          </p>
        </div>
      ) : rows.length === 0 ? (
        <div className="glass-card flex flex-col items-center gap-3 py-14 text-center">
          <span className="bg-primary/15 grid h-14 w-14 place-items-center rounded-lg text-primary">
            <FileText size={26} />
          </span>
          <div>
            <p className="font-semibold">
              {hasFilters ? "Sin resultados" : "Todavía no hay informes"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {hasFilters
                ? "Probá con otro filtro."
                : "Redactá tu primer informe bromatológico."}
            </p>
          </div>
          {!hasFilters && (
            <Button onClick={openNew}>
              <Plus size={16} />
              Nuevo informe
            </Button>
          )}
        </div>
      ) : (
        <div className="glass-card overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium">Informe</th>
                <th className="px-4 py-3 font-medium">Autor</th>
                <th className="px-4 py-3 text-center font-medium">Adjuntos</th>
                <th className="px-4 py-3 font-medium">Importancia</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => {
                const excerpt = htmlExcerpt(r.content_html, 120);
                return (
                  <tr
                    key={r.id}
                    onClick={() => setDetail(r)}
                    className="hover:bg-secondary/40 cursor-pointer transition"
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {formatDate(r.report_date)}
                    </td>
                    <td className="max-w-md px-4 py-3">
                      <span className="line-clamp-2 text-foreground">
                        {excerpt || (
                          <span className="text-muted-foreground">
                            (sin texto)
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {r.member?.full_name ?? (
                        <span className="text-xs">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center text-muted-foreground">
                      {r.attachments.length || "-"}
                    </td>
                    <td className="px-4 py-3">
                      <ImportanceBadge value={r.importance} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ReportFormModal
        open={formOpen}
        onOpenChange={(o) => {
          setFormOpen(o);
          if (!o) setEditing(null);
        }}
        report={editing}
      />
      <ReportDetailDrawer
        report={detail}
        members={members ?? []}
        onClose={() => setDetail(null)}
        onEdit={openEdit}
      />
    </div>
  );
}
