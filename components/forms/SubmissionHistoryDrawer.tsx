"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ChevronDown, ChevronRight, Download, Wrench } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  DateRangePicker,
  type DateRange,
} from "@/components/ui/DateRangePicker";
import { Modal } from "@/components/ui/Modal";
import { SpinnerBlock } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { Money } from "@/components/ui/Typography";
import { cn } from "@/lib/utils/cn";
import { formatDate } from "@/lib/utils/format";
import { useSubmissions } from "@/modules/forms/hooks";
import type { FormSubmission, FormTemplate } from "@/modules/forms/api";
import { exportSubmissionsToExcel } from "@/modules/forms/generators";
import type { FieldValue, SubmissionStatus } from "@/modules/forms/schemas";

const STATUS_STYLE: Record<SubmissionStatus, { label: string; cls: string }> = {
  ok: { label: "OK", cls: "bg-emerald-500/15 text-emerald-500" },
  fail: { label: "Desvío", cls: "bg-destructive/15 text-destructive" },
  corrected: { label: "Corregido", cls: "bg-primary/15 text-primary" },
};

function fmtValue(value: FieldValue | undefined): string {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "boolean") return value ? "Sí" : "No";
  return String(value);
}

// Historial de registros de un template: filtro por fechas, valores expandibles,
// export Excel y botón "Corregir" en los desvíos.
export function SubmissionHistoryDrawer({
  template,
  onClose,
  onCorrect,
}: {
  template: FormTemplate | null;
  onClose: () => void;
  onCorrect: (submission: FormSubmission) => void;
}) {
  const { toast } = useToast();
  const [range, setRange] = useState<DateRange | undefined>();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const params = useMemo(
    () => ({
      templateId: template?.id ?? null,
      from: range?.from ? format(range.from, "yyyy-MM-dd") : null,
      to: range?.to ? format(range.to, "yyyy-MM-dd") : null,
    }),
    [template?.id, range]
  );

  const { data: submissions, isLoading } = useSubmissions(params);
  const rows = submissions ?? [];

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleExport() {
    if (!template) return;
    void exportSubmissionsToExcel(template, rows).catch((e) =>
      toast({
        title: "No se pudo exportar",
        description: e instanceof Error ? e.message : undefined,
        variant: "error",
      })
    );
  }

  return (
    <Modal
      open={template !== null}
      onOpenChange={(o) => !o && onClose()}
      title={template ? `Historial · ${template.name}` : "Historial"}
      description="Registros firmados (inmutables). Las correcciones se agregan como filas nuevas."
      className="max-w-3xl"
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <DateRangePicker value={range} onChange={setRange} />
            {range && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setRange(undefined)}
              >
                Limpiar
              </Button>
            )}
          </div>
          <Button
            variant="secondary"
            onClick={handleExport}
            disabled={rows.length === 0}
          >
            <Download size={16} />
            Exportar Excel
          </Button>
        </div>

        {isLoading ? (
          <SpinnerBlock />
        ) : rows.length === 0 ? (
          <div className="bg-muted/20 rounded-lg border border-border py-12 text-center text-sm text-muted-foreground">
            Sin registros para el filtro elegido.
          </div>
        ) : (
          <div className="space-y-1.5">
            {rows.map((s) => {
              const open = expanded.has(s.id);
              const style = STATUS_STYLE[s.status];
              return (
                <div
                  key={s.id}
                  className="rounded-md border border-border bg-card"
                >
                  <button
                    type="button"
                    onClick={() => toggle(s.id)}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
                  >
                    {open ? (
                      <ChevronDown
                        size={16}
                        className="text-muted-foreground"
                      />
                    ) : (
                      <ChevronRight
                        size={16}
                        className="text-muted-foreground"
                      />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <Money className="text-xs">
                          {format(new Date(s.submitted_at), "dd/MM/yyyy HH:mm")}
                        </Money>
                        <span className="text-sm">
                          {s.member?.full_name ?? "Sin firma"}
                        </span>
                      </span>
                    </span>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-medium",
                        style.cls
                      )}
                    >
                      {style.label}
                    </span>
                    {s.status === "fail" && template && (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          onCorrect(s);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.stopPropagation();
                            onCorrect(s);
                          }
                        }}
                        className="hover:border-primary/40 inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground transition hover:text-primary"
                      >
                        <Wrench size={12} />
                        Corregir
                      </span>
                    )}
                  </button>

                  {open && template && (
                    <div className="border-t border-border px-3 py-3">
                      <dl className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
                        {template.fields.map((f) => (
                          <div
                            key={f.key}
                            className="flex justify-between gap-2 text-sm"
                          >
                            <dt className="text-muted-foreground">{f.label}</dt>
                            <dd className="font-medium">
                              {fmtValue(s.values?.[f.key])}
                              {f.unit && s.values?.[f.key] != null
                                ? ` ${f.unit}`
                                : ""}
                            </dd>
                          </div>
                        ))}
                      </dl>
                      {s.corrective_action && (
                        <div className="border-accent/30 bg-accent/10 mt-3 rounded-md border px-3 py-2 text-xs text-accent">
                          <span className="font-semibold">
                            Acción correctiva:
                          </span>{" "}
                          {s.corrective_action}
                        </div>
                      )}
                      {s.corrects_submission_id && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Corrige un registro previo del{" "}
                          {formatDate(s.submitted_at)}.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}
