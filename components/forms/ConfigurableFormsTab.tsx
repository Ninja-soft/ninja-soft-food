"use client";

import { useState } from "react";
import {
  ClipboardList,
  FilePlus2,
  History,
  PenLine,
  Plus,
  Printer,
  Search,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { SpinnerBlock } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { FillFormModal } from "@/components/forms/FillFormModal";
import { SubmissionHistoryDrawer } from "@/components/forms/SubmissionHistoryDrawer";
import { TemplateBuilderModal } from "@/components/forms/TemplateBuilderModal";
import {
  MigrationPendingError,
  type FormSubmission,
  type FormTemplate,
} from "@/modules/forms/api";
import { generateBlankFormPdf } from "@/modules/forms/generators";
import { useDeleteTemplate, useTemplates } from "@/modules/forms/hooks";
import { FORM_KIND_LABELS, FREQUENCY_LABELS } from "@/modules/forms/schemas";
import type { TenantBranding } from "@/modules/planillas/api";

// Tab "Configurables": listado de templates + acciones (nueva, completar,
// historial, exportar, PDF en blanco). Si falta la migración 0009, muestra un
// empty state informativo en vez de romper.
export function ConfigurableFormsTab({
  branding,
}: {
  branding: TenantBranding | undefined;
}) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const { data: templates, isLoading, error } = useTemplates(search);
  const deleteMut = useDeleteTemplate();

  const [builderOpen, setBuilderOpen] = useState(false);
  const [editing, setEditing] = useState<FormTemplate | null>(null);
  const [filling, setFilling] = useState<FormTemplate | null>(null);
  const [correcting, setCorrecting] = useState<{
    template: FormTemplate;
    submission: FormSubmission;
  } | null>(null);
  const [history, setHistory] = useState<FormTemplate | null>(null);
  const [toDelete, setToDelete] = useState<FormTemplate | null>(null);
  const [printingId, setPrintingId] = useState<string | null>(null);

  const migrationPending = error instanceof MigrationPendingError;
  const rows = templates ?? [];

  async function handlePrint(t: FormTemplate) {
    if (!branding) return;
    setPrintingId(t.id);
    try {
      await generateBlankFormPdf(t, branding);
    } catch (e) {
      toast({
        title: "No se pudo generar el PDF",
        description: e instanceof Error ? e.message : undefined,
        variant: "error",
      });
    } finally {
      setPrintingId(null);
    }
  }

  async function handleDelete() {
    if (!toDelete) return;
    try {
      await deleteMut.mutateAsync(toDelete.id);
      toast({ title: "Planilla eliminada", variant: "success" });
      setToDelete(null);
    } catch (e) {
      toast({
        title: "No se pudo eliminar",
        description: e instanceof Error ? e.message : undefined,
        variant: "error",
      });
    }
  }

  if (migrationPending) {
    return (
      <div className="flex flex-col items-center gap-3 py-14 text-center">
        <span className="bg-accent/15 grid h-14 w-14 place-items-center rounded-lg text-accent">
          <ClipboardList size={26} />
        </span>
        <div>
          <p className="font-semibold">Pendiente de migración 0009</p>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            El builder de planillas configurables está listo, pero la base de
            datos todavía no tiene las tablas. Aplicá la migración
            <span className="font-price">
              {" "}
              00000000000009_form_builder.sql
            </span>{" "}
            para habilitarlo.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-sm">
          <Search
            size={16}
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar planilla por nombre…"
            className="focus:ring-primary/20 h-11 w-full rounded-lg border border-input bg-background pl-10 pr-4 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2"
          />
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setBuilderOpen(true);
          }}
        >
          <Plus size={16} />
          Nueva planilla
        </Button>
      </div>

      {isLoading ? (
        <SpinnerBlock />
      ) : rows.length === 0 ? (
        <div className="glass-card flex flex-col items-center gap-3 py-14 text-center">
          <span className="bg-primary/15 grid h-14 w-14 place-items-center rounded-lg text-primary">
            <ClipboardList size={26} />
          </span>
          <div>
            <p className="font-semibold">
              {search
                ? "Sin resultados"
                : "Todavía no hay planillas configurables"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {search
                ? "Probá con otro nombre."
                : "Creá planillas BPM/POES/temperatura a medida de tu planta."}
            </p>
          </div>
          {!search && (
            <Button
              onClick={() => {
                setEditing(null);
                setBuilderOpen(true);
              }}
            >
              <Plus size={16} />
              Nueva planilla
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((t) => (
            <div
              key={t.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3"
            >
              <span className="bg-primary/15 grid h-10 w-10 shrink-0 place-items-center rounded-md text-primary">
                <ClipboardList size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{t.name}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                  <span className="bg-muted/60 rounded-full px-2 py-0.5">
                    {FORM_KIND_LABELS[t.kind]}
                  </span>
                  <span>{FREQUENCY_LABELS[t.frequency.type]}</span>
                  <span>·</span>
                  <span>{t.fields.length} campos</span>
                  <span>·</span>
                  <span>
                    {t.requires_signature ? "con firma" : "sin firma"}
                  </span>
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Button size="sm" onClick={() => setFilling(t)}>
                  <PenLine size={14} />
                  Completar
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setHistory(t)}
                >
                  <History size={14} />
                  Historial
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  loading={printingId === t.id}
                  disabled={!branding}
                  onClick={() => handlePrint(t)}
                >
                  <Printer size={14} />
                  PDF
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditing(t);
                    setBuilderOpen(true);
                  }}
                >
                  <FilePlus2 size={14} />
                  Editar
                </Button>
                <button
                  type="button"
                  aria-label="Eliminar planilla"
                  onClick={() => setToDelete(t)}
                  className="hover:bg-destructive/10 grid h-9 w-9 place-items-center rounded-lg text-muted-foreground transition hover:text-destructive"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <TemplateBuilderModal
        open={builderOpen}
        onOpenChange={setBuilderOpen}
        template={editing}
      />

      <FillFormModal
        open={filling !== null}
        onOpenChange={(o) => !o && setFilling(null)}
        template={filling}
      />

      <FillFormModal
        open={correcting !== null}
        onOpenChange={(o) => !o && setCorrecting(null)}
        template={correcting?.template ?? null}
        corrects={correcting?.submission ?? null}
      />

      <SubmissionHistoryDrawer
        template={history}
        onClose={() => setHistory(null)}
        onCorrect={(submission) => {
          if (history) {
            setHistory(null);
            setCorrecting({ template: history, submission });
          }
        }}
      />

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Eliminar planilla"
        description={`Se desactivará "${toDelete?.name}". Los registros firmados se conservan (inmutables).`}
        confirmLabel="Eliminar"
        danger
        loading={deleteMut.isPending}
        onConfirm={handleDelete}
      />
    </div>
  );
}
