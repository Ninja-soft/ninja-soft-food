"use client";

import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { FileText, Paperclip, Trash2, X } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { ConformityBadge } from "@/components/analisis/ConformityBadge";
import { cn } from "@/lib/utils/cn";
import type { Analysis, AnalysisAttachment } from "@/modules/quality/api";
import {
  useCreateAnalysis,
  useCreateLaboratory,
  useDeleteAttachment,
  useLaboratories,
  useUpdateAnalysis,
  useUploadAttachment,
} from "@/modules/quality/hooks";
import {
  analysisSchema,
  ANALYSIS_TYPES,
  type AnalysisInput,
} from "@/modules/quality/schemas";

const selectCls =
  "h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20";

function formatSize(bytes: number | null): string {
  if (bytes === null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Nuevo/editar análisis de laboratorio: tipo, fecha, conformidad (slider + badge
// en vivo), muestra, laboratorio (+alta inline), observaciones y adjuntos.
export function AnalysisFormModal({
  open,
  onOpenChange,
  analysis,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  analysis: Analysis | null;
}) {
  const { toast } = useToast();
  const { data: labs } = useLaboratories();
  const createMut = useCreateAnalysis();
  const updateMut = useUpdateAnalysis();
  const createLabMut = useCreateLaboratory();
  const uploadMut = useUploadAttachment();
  const deleteAttachMut = useDeleteAttachment();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Adjuntos en staging para análisis nuevos (se suben tras crear el registro).
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [showNewLab, setShowNewLab] = useState(false);
  const [newLabName, setNewLabName] = useState("");

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<AnalysisInput>({
    resolver: zodResolver(analysisSchema),
    defaultValues: {
      type: "alimentos",
      analysis_date: format(new Date(), "yyyy-MM-dd"),
      conformity: 90,
      sample_code: null,
      laboratory_id: null,
      observations_html: null,
    },
  });

  const conformity = watch("conformity");

  useEffect(() => {
    if (!open) return;
    setPendingFiles([]);
    setShowNewLab(false);
    setNewLabName("");
    reset({
      type: analysis?.type ?? "alimentos",
      analysis_date: analysis?.analysis_date ?? format(new Date(), "yyyy-MM-dd"),
      conformity: analysis?.conformity ?? 90,
      sample_code: analysis?.sample_code ?? null,
      laboratory_id: analysis?.laboratory_id ?? null,
      observations_html: analysis?.observations_html ?? null,
    });
  }, [open, analysis, reset]);

  async function handleCreateLab() {
    const name = newLabName.trim();
    if (name.length < 1) return;
    try {
      const created = await createLabMut.mutateAsync({
        name,
        contact: { phone: null, email: null },
      });
      setValue("laboratory_id", created.id);
      setShowNewLab(false);
      setNewLabName("");
      toast({ title: "Laboratorio creado", variant: "success" });
    } catch (e) {
      toast({
        title: "Error al crear laboratorio",
        description: e instanceof Error ? e.message : undefined,
        variant: "error",
      });
    }
  }

  function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    if (picked.length === 0) return;
    if (analysis) {
      // Edición: el análisis ya existe → subimos en el acto.
      void Promise.all(
        picked.map((file) =>
          uploadMut.mutateAsync({ analysisId: analysis.id, file })
        )
      )
        .then(() => toast({ title: "Adjuntos cargados", variant: "success" }))
        .catch((err) =>
          toast({
            title: "Error al subir adjunto",
            description: err instanceof Error ? err.message : undefined,
            variant: "error",
          })
        );
    } else {
      setPendingFiles((prev) => [...prev, ...picked]);
    }
    e.target.value = "";
  }

  async function removeExisting(att: AnalysisAttachment) {
    try {
      await deleteAttachMut.mutateAsync({ id: att.id, url: att.url });
    } catch (e) {
      toast({
        title: "Error al eliminar adjunto",
        description: e instanceof Error ? e.message : undefined,
        variant: "error",
      });
    }
  }

  const onSubmit = handleSubmit(async (values) => {
    try {
      if (analysis) {
        await updateMut.mutateAsync({ id: analysis.id, input: values });
        toast({ title: "Análisis actualizado", variant: "success" });
      } else {
        const created = await createMut.mutateAsync(values);
        // Subimos los adjuntos en staging contra el registro recién creado.
        for (const file of pendingFiles) {
          await uploadMut.mutateAsync({ analysisId: created.id, file });
        }
        toast({ title: "Análisis registrado", variant: "success" });
      }
      onOpenChange(false);
    } catch (e) {
      toast({
        title: "Error al guardar el análisis",
        description: e instanceof Error ? e.message : undefined,
        variant: "error",
      });
    }
  });

  const existing = analysis?.attachments ?? [];

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={analysis ? "Editar análisis" : "Nuevo análisis"}
      description="Resultado de laboratorio por tipo, con conformidad y adjuntos."
      className="max-w-2xl"
    >
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <div className="grid grid-cols-2 gap-3">
          {/* Tipo */}
          <div>
            <label className="mb-2 block text-sm font-medium text-muted-foreground">
              Tipo de análisis
            </label>
            <select className={selectCls} {...register("type")}>
              {ANALYSIS_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            {errors.type && (
              <p className="mt-2 text-sm text-destructive">
                {errors.type.message}
              </p>
            )}
          </div>

          {/* Fecha */}
          <Input
            label="Fecha del análisis"
            type="date"
            error={errors.analysis_date?.message}
            {...register("analysis_date")}
          />
        </div>

        {/* Conformidad */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-medium text-muted-foreground">
              Conformidad
            </label>
            <ConformityBadge value={conformity ?? 0} />
          </div>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={conformity ?? 0}
              onChange={(e) =>
                setValue("conformity", Number(e.target.value), {
                  shouldValidate: true,
                })
              }
              aria-label="Conformidad 0 a 100"
              className="accent-primary h-2 flex-1 cursor-pointer"
            />
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              className="h-11 w-20 rounded-lg border border-input bg-background px-3 text-right text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              {...register("conformity", {
                setValueAs: (v) => (v === "" ? NaN : Number(v)),
              })}
            />
          </div>
          {errors.conformity && (
            <p className="mt-2 text-sm text-destructive">
              {errors.conformity.message}
            </p>
          )}
        </div>

        {/* Muestra + Laboratorio */}
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Código de muestra"
            placeholder="Opcional"
            error={errors.sample_code?.message}
            {...register("sample_code", {
              setValueAs: (v) => (v === "" ? null : v),
            })}
          />
          <div>
            <label className="mb-2 block text-sm font-medium text-muted-foreground">
              Laboratorio
            </label>
            {showNewLab ? (
              <div className="flex gap-2">
                <input
                  value={newLabName}
                  onChange={(e) => setNewLabName(e.target.value)}
                  placeholder="Nombre del laboratorio"
                  className="focus:ring-primary/20 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2"
                />
                <Button
                  type="button"
                  variant="secondary"
                  loading={createLabMut.isPending}
                  onClick={handleCreateLab}
                >
                  Crear
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowNewLab(false)}
                >
                  <X size={16} />
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <select
                  className={selectCls}
                  {...register("laboratory_id", {
                    setValueAs: (v) => (v === "" ? null : v),
                  })}
                >
                  <option value="">Sin laboratorio</option>
                  {(labs ?? []).map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowNewLab(true)}
                >
                  Nuevo
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Observaciones */}
        <div>
          <label className="mb-2 block text-sm font-medium text-muted-foreground">
            Observaciones
          </label>
          <textarea
            rows={4}
            placeholder="Resultados, conclusiones, recomendaciones…"
            className="focus:ring-primary/20 w-full rounded-lg border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2"
            {...register("observations_html", {
              setValueAs: (v) => (v === "" ? null : v),
            })}
          />
        </div>

        {/* Adjuntos */}
        <div className="space-y-2">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Adjuntos
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip size={14} />
              Agregar
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={onPickFiles}
            />
          </div>

          {existing.length === 0 && pendingFiles.length === 0 ? (
            <p className="py-2 text-xs text-muted-foreground">
              Sin adjuntos. Sumá PDF, imágenes o planillas del laboratorio.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {existing.map((att) => (
                <li
                  key={att.id}
                  className="bg-muted/30 flex items-center justify-between gap-3 rounded-ninjaSm border border-border px-3 py-2"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <FileText size={15} className="shrink-0 text-primary" />
                    <span className="truncate text-sm">{att.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatSize(att.size)}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => removeExisting(att)}
                    aria-label={`Eliminar ${att.name}`}
                    className="hover:bg-destructive/10 rounded-md p-1.5 text-muted-foreground transition hover:text-destructive"
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
              {pendingFiles.map((file, i) => (
                <li
                  key={`${file.name}-${i}`}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-ninjaSm border border-dashed border-border px-3 py-2"
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Paperclip
                      size={15}
                      className="shrink-0 text-muted-foreground"
                    />
                    <span className="truncate text-sm">{file.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatSize(file.size)} · se sube al guardar
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setPendingFiles((prev) =>
                        prev.filter((_, idx) => idx !== i)
                      )
                    }
                    aria-label={`Quitar ${file.name}`}
                    className="hover:bg-destructive/10 rounded-md p-1.5 text-muted-foreground transition hover:text-destructive"
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            loading={
              createMut.isPending || updateMut.isPending || uploadMut.isPending
            }
          >
            {analysis ? "Guardar cambios" : "Registrar análisis"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
