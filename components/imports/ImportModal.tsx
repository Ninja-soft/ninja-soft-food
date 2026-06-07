"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Download,
  FileSpreadsheet,
  FileWarning,
  UploadCloud,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils/cn";
import {
  downloadRejectsReport,
  downloadTemplate,
  type RejectRow,
} from "@/lib/utils/xlsxImport";
import {
  IMPORT_MODULES,
  type ImportModuleId,
  type RowStatus,
  type ValidatedRow,
} from "@/modules/imports/schemas";
import {
  useConfirmImport,
  useParseAndValidate,
  type ConfirmImportResult,
  type ParseAndValidateResult,
} from "@/modules/imports/hooks";

type Step = "upload" | "preview" | "result";

interface ImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  moduleId: ImportModuleId;
}

const STATUS_META: Record<
  RowStatus,
  { label: string; icon: typeof CheckCircle2; cls: string; dot: string }
> = {
  ok: {
    label: "Válida",
    icon: CheckCircle2,
    cls: "text-emerald-400",
    dot: "bg-emerald-400",
  },
  error: {
    label: "Error",
    icon: XCircle,
    cls: "text-destructive",
    dot: "bg-destructive",
  },
  duplicate: {
    label: "Duplicada",
    icon: Copy,
    cls: "text-amber-400",
    dot: "bg-amber-400",
  },
};

// Modal reutilizable de importación Excel en 3 pasos: subir -> preview con
// validación zod por fila (semáforo) -> resultado + reporte de rechazos.
export function ImportModal({ open, onOpenChange, moduleId }: ImportModalProps) {
  const { toast } = useToast();
  const def = IMPORT_MODULES[moduleId];
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParseAndValidateResult | null>(null);
  const [result, setResult] = useState<ConfirmImportResult | null>(null);

  const parseMut = useParseAndValidate(moduleId);
  const confirmMut = useConfirmImport(moduleId);

  // Reset al cerrar.
  useEffect(() => {
    if (!open) {
      setStep("upload");
      setFileName(null);
      setParsed(null);
      setResult(null);
      parseMut.reset();
      confirmMut.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function handleTemplate() {
    try {
      await downloadTemplate(def.template, def.templateFilename);
    } catch {
      toast({ title: "No se pudo generar la plantilla", variant: "error" });
    }
  }

  async function handleFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      toast({
        title: "Formato inválido",
        description: "Subí un archivo .xlsx (Excel).",
        variant: "error",
      });
      return;
    }
    setFileName(file.name);
    try {
      const res = await parseMut.mutateAsync(file);
      setParsed(res);
      if (res.counts.total === 0) {
        toast({
          title: "El archivo no tiene filas para importar",
          description: "Verificá que los datos estén bajo los encabezados de la plantilla.",
          variant: "error",
        });
        return;
      }
      setStep("preview");
    } catch (e) {
      toast({
        title: "No se pudo leer el archivo",
        description: e instanceof Error ? e.message : undefined,
        variant: "error",
      });
    }
  }

  async function handleConfirm() {
    if (!parsed) return;
    try {
      const res = await confirmMut.mutateAsync(parsed.rows);
      setResult(res);
      setStep("result");
      toast({
        title: `${res.inserted} ${def.label.toLowerCase()} importados`,
        variant: "success",
      });
    } catch (e) {
      toast({
        title: "Error al importar",
        description: e instanceof Error ? e.message : undefined,
        variant: "error",
      });
    }
  }

  async function handleRejects() {
    if (!parsed) return;
    const rejects: RejectRow[] = parsed.rows
      .filter((r) => r.status !== "ok")
      .map((r) => ({
        rowNumber: r.rowNumber,
        values: r.raw,
        error: r.error ?? "Fila rechazada",
      }));
    if (rejects.length === 0) return;
    try {
      await downloadRejectsReport(
        def.template.columns,
        rejects,
        `Rechazos · ${def.label}`,
        `rechazos-${def.id}`,
      );
    } catch {
      toast({ title: "No se pudo generar el reporte", variant: "error" });
    }
  }

  const okCount = parsed?.counts.ok ?? 0;

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={`Importar ${def.label} desde Excel`}
      description="Descargá la plantilla, completala y subila. Validamos cada fila antes de importar."
      className="max-w-3xl"
    >
      {/* Stepper */}
      <Stepper step={step} />

      {step === "upload" && (
        <UploadStep
          onTemplate={handleTemplate}
          onPick={() => fileInputRef.current?.click()}
          onFile={handleFile}
          loading={parseMut.isPending}
          fileName={fileName}
        />
      )}

      {step === "preview" && parsed && (
        <PreviewStep
          parsed={parsed}
          loading={confirmMut.isPending}
          okCount={okCount}
          onBack={() => {
            setStep("upload");
            setParsed(null);
            setFileName(null);
            parseMut.reset();
          }}
          onConfirm={handleConfirm}
          onRejects={handleRejects}
          moduleLabel={def.label}
        />
      )}

      {step === "result" && result && (
        <ResultStep
          result={result}
          moduleLabel={def.label}
          hasRejects={(parsed?.rows.some((r) => r.status !== "ok")) ?? false}
          onRejects={handleRejects}
          onClose={() => onOpenChange(false)}
        />
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
          e.target.value = "";
        }}
      />
    </Modal>
  );
}

// ── Stepper ────────────────────────────────────────────────────────────────────

function Stepper({ step }: { step: Step }) {
  const steps: Array<{ id: Step; label: string }> = [
    { id: "upload", label: "Subir" },
    { id: "preview", label: "Revisar" },
    { id: "result", label: "Resultado" },
  ];
  const activeIdx = steps.findIndex((s) => s.id === step);
  return (
    <ol className="mb-6 flex items-center gap-2 text-xs">
      {steps.map((s, i) => {
        const done = i < activeIdx;
        const active = i === activeIdx;
        return (
          <li key={s.id} className="flex items-center gap-2">
            <span
              className={cn(
                "grid h-6 w-6 place-items-center rounded-full border text-[11px] font-bold transition",
                active && "border-primary bg-primary/15 text-primary",
                done && "border-primary bg-primary text-white",
                !active && !done && "border-border text-muted-foreground",
              )}
            >
              {done ? <CheckCircle2 size={13} /> : i + 1}
            </span>
            <span
              className={cn(
                "font-medium",
                active ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {s.label}
            </span>
            {i < steps.length - 1 && (
              <span className="mx-1 h-px w-6 bg-border" aria-hidden />
            )}
          </li>
        );
      })}
    </ol>
  );
}

// ── Paso 1: subir ────────────────────────────────────────────────────────────

function UploadStep({
  onTemplate,
  onPick,
  onFile,
  loading,
  fileName,
}: {
  onTemplate: () => void;
  onPick: () => void;
  onFile: (file: File) => void;
  loading: boolean;
  fileName: string | null;
}) {
  const [dragOver, setDragOver] = useState(false);
  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-border bg-muted/40 p-4">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-primary/15 text-primary">
            <FileSpreadsheet size={18} />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">Paso 1: descargá la plantilla</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Tiene los encabezados, ejemplos y una hoja de instrucciones. Completala
              y volvé acá para subirla.
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={onTemplate} className="shrink-0">
            <Download size={15} />
            Plantilla
          </Button>
        </div>
      </div>

      <button
        type="button"
        onClick={onPick}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) onFile(f);
        }}
        disabled={loading}
        className={cn(
          "flex w-full flex-col items-center gap-3 rounded-lg border-2 border-dashed py-10 text-center transition",
          dragOver
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50 hover:bg-muted/30",
          loading && "pointer-events-none opacity-70",
        )}
      >
        {loading ? (
          <span
            className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"
            aria-hidden
          />
        ) : (
          <span className="grid h-12 w-12 place-items-center rounded-full bg-primary/15 text-primary">
            <UploadCloud size={24} />
          </span>
        )}
        <div>
          <p className="text-sm font-semibold">
            {loading
              ? "Leyendo y validando…"
              : fileName ?? "Soltá tu archivo .xlsx o hacé clic para elegirlo"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Solo archivos Excel (.xlsx)
          </p>
        </div>
      </button>
    </div>
  );
}

// ── Paso 2: preview ──────────────────────────────────────────────────────────

function PreviewStep({
  parsed,
  loading,
  okCount,
  onBack,
  onConfirm,
  onRejects,
  moduleLabel,
}: {
  parsed: ParseAndValidateResult;
  loading: boolean;
  okCount: number;
  onBack: () => void;
  onConfirm: () => void;
  onRejects: () => void;
  moduleLabel: string;
}) {
  const { counts, rows } = parsed;
  const hasRejects = counts.error > 0 || counts.duplicate > 0;
  const previewRows = useMemo(() => rows.slice(0, 200), [rows]);

  return (
    <div className="space-y-4">
      {/* Resumen semáforo */}
      <div className="grid grid-cols-3 gap-2">
        <SummaryCard
          label="Válidas"
          value={counts.ok}
          tone="ok"
          icon={CheckCircle2}
        />
        <SummaryCard
          label="Con error"
          value={counts.error}
          tone="error"
          icon={AlertTriangle}
        />
        <SummaryCard
          label="Duplicadas"
          value={counts.duplicate}
          tone="dup"
          icon={Copy}
        />
      </div>

      {/* Tabla de filas */}
      <div className="max-h-[40dvh] overflow-auto rounded-lg border border-border">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 z-10 bg-card">
            <tr className="border-b border-border text-muted-foreground">
              <th className="px-3 py-2 font-medium">Fila</th>
              <th className="px-3 py-2 font-medium">Estado</th>
              <th className="px-3 py-2 font-medium">Detalle</th>
            </tr>
          </thead>
          <tbody>
            {previewRows.map((r) => (
              <PreviewRow key={r.rowNumber} row={r} />
            ))}
          </tbody>
        </table>
        {rows.length > previewRows.length && (
          <p className="border-t border-border px-3 py-2 text-center text-[11px] text-muted-foreground">
            Mostrando {previewRows.length} de {rows.length} filas. Se importarán todas
            las válidas.
          </p>
        )}
      </div>

      {/* Acciones */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onBack} disabled={loading}>
            Volver
          </Button>
          {hasRejects && (
            <Button variant="ghost" onClick={onRejects} disabled={loading}>
              <FileWarning size={15} />
              Reporte de rechazos
            </Button>
          )}
        </div>
        <Button onClick={onConfirm} loading={loading} disabled={okCount === 0}>
          Importar {okCount} {moduleLabel.toLowerCase()}
        </Button>
      </div>
      {okCount === 0 && (
        <p className="text-center text-xs text-destructive">
          No hay filas válidas para importar. Corregí los errores en el archivo y volvé
          a subirlo.
        </p>
      )}
    </div>
  );
}

function PreviewRow({ row }: { row: ValidatedRow<unknown> }) {
  const meta = STATUS_META[row.status];
  const Icon = meta.icon;
  // Resumen legible de la fila: primer valor no vacío (suele ser el nombre).
  const summary =
    Object.values(row.raw).find((v) => v !== null && v !== "") ?? "(vacía)";
  return (
    <tr className="border-b border-border/60 last:border-0">
      <td className="px-3 py-2 font-mono text-muted-foreground">{row.rowNumber}</td>
      <td className="px-3 py-2">
        <span className={cn("inline-flex items-center gap-1.5 font-medium", meta.cls)}>
          <Icon size={13} />
          {meta.label}
        </span>
      </td>
      <td className="px-3 py-2 text-foreground">
        {row.status === "ok" ? (
          <span className="text-muted-foreground">{String(summary)}</span>
        ) : (
          <span>
            <span className="font-medium">{String(summary)}</span>
            <span className="text-muted-foreground"> • {row.error}</span>
          </span>
        )}
      </td>
    </tr>
  );
}

function SummaryCard({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string;
  value: number;
  tone: "ok" | "error" | "dup";
  icon: typeof CheckCircle2;
}) {
  const cls =
    tone === "ok"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
      : tone === "error"
        ? "border-destructive/30 bg-destructive/10 text-destructive"
        : "border-amber-500/30 bg-amber-500/10 text-amber-400";
  return (
    <div className={cn("flex items-center gap-2.5 rounded-lg border px-3 py-2.5", cls)}>
      <Icon size={18} />
      <div>
        <p className="text-lg font-bold leading-none">{value}</p>
        <p className="mt-0.5 text-[11px] opacity-80">{label}</p>
      </div>
    </div>
  );
}

// ── Paso 3: resultado ────────────────────────────────────────────────────────

function ResultStep({
  result,
  moduleLabel,
  hasRejects,
  onRejects,
  onClose,
}: {
  result: ConfirmImportResult;
  moduleLabel: string;
  hasRejects: boolean;
  onRejects: () => void;
  onClose: () => void;
}) {
  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-emerald-500/15 text-emerald-400">
          <CheckCircle2 size={28} />
        </span>
        <div>
          <p className="text-lg font-bold">Importación completada</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Se importaron <span className="font-semibold text-foreground">{result.inserted}</span>{" "}
            {moduleLabel.toLowerCase()}
            {result.rejected > 0 && (
              <>
                {" "}y se omitieron{" "}
                <span className="font-semibold text-foreground">{result.rejected}</span> por error
                o duplicado
              </>
            )}
            .
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
        {hasRejects ? (
          <Button variant="secondary" onClick={onRejects}>
            <FileWarning size={15} />
            Descargar rechazos
          </Button>
        ) : (
          <span />
        )}
        <Button onClick={onClose}>Listo</Button>
      </div>
    </div>
  );
}
