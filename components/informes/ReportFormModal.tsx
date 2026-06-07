"use client";

import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { Check, FileText, Paperclip, Trash2, Users } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { useToast } from "@/components/ui/Toast";
import { ImportanceBadge } from "@/components/informes/ImportanceBadge";
import { ReportAiAssistant } from "@/components/informes/ReportAiAssistant";
import { cn } from "@/lib/utils/cn";
import { useAiStatus } from "@/modules/ai/hooks";
import type { Report, ReportAttachment } from "@/modules/quality/api";
import {
  useCreateReport,
  useDeleteReportAttachment,
  useMembers,
  useUpdateReport,
  useUploadReportAttachment,
} from "@/modules/quality/hooks";
import { reportSchema, type ReportInput } from "@/modules/quality/schemas";

function formatSize(bytes: number | null): string {
  if (bytes === null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Nuevo/editar informe bromatológico: fecha, editor enriquecido, importancia
// (slider + badge en vivo), miembros a notificar (chips) y adjuntos.
export function ReportFormModal({
  open,
  onOpenChange,
  report,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  report: Report | null;
}) {
  const { toast } = useToast();
  const { data: members } = useMembers();
  // Gating de IA por tenant. Gobierna la aparición del asistente en el editor.
  // Los informes (reports) NO tienen estado finalizado/inmutable: son editables
  // como borrador (docs/03 §2/§3 reserva la inmutabilidad a form_submissions),
  // así que el asistente está disponible siempre que la IA esté habilitada.
  const { data: aiStatus } = useAiStatus();
  const aiEnabled = aiStatus?.enabled === true;
  const createMut = useCreateReport();
  const updateMut = useUpdateReport();
  const uploadMut = useUploadReportAttachment();
  const deleteAttachMut = useDeleteReportAttachment();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Adjuntos en staging para informes nuevos (se suben tras crear el registro).
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  const {
    handleSubmit,
    reset,
    watch,
    setValue,
    register,
    formState: { errors },
  } = useForm<ReportInput>({
    resolver: zodResolver(reportSchema),
    defaultValues: {
      report_date: format(new Date(), "yyyy-MM-dd"),
      content_html: "",
      importance: 50,
      notify_member_ids: [],
    },
  });

  const importance = watch("importance");
  const contentHtml = watch("content_html");
  const notifyIds = watch("notify_member_ids");

  useEffect(() => {
    if (!open) return;
    setPendingFiles([]);
    reset({
      report_date: report?.report_date ?? format(new Date(), "yyyy-MM-dd"),
      content_html: report?.content_html ?? "",
      importance: report?.importance ?? 50,
      notify_member_ids: report?.notify_member_ids ?? [],
    });
  }, [open, report, reset]);

  function toggleMember(id: string) {
    const current = notifyIds ?? [];
    const next = current.includes(id)
      ? current.filter((m) => m !== id)
      : [...current, id];
    setValue("notify_member_ids", next, { shouldDirty: true });
  }

  function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    if (picked.length === 0) return;
    if (report) {
      // Edición: el informe ya existe → subimos en el acto.
      void Promise.all(
        picked.map((file) =>
          uploadMut.mutateAsync({ reportId: report.id, file })
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

  async function removeExisting(att: ReportAttachment) {
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
      if (report) {
        await updateMut.mutateAsync({ id: report.id, input: values });
        toast({ title: "Informe actualizado", variant: "success" });
      } else {
        const created = await createMut.mutateAsync(values);
        for (const file of pendingFiles) {
          await uploadMut.mutateAsync({ reportId: created.id, file });
        }
        toast({ title: "Informe creado", variant: "success" });
      }
      onOpenChange(false);
    } catch (e) {
      toast({
        title: "Error al guardar el informe",
        description: e instanceof Error ? e.message : undefined,
        variant: "error",
      });
    }
  });

  const existing = report?.attachments ?? [];
  const selectedSet = new Set(notifyIds ?? []);

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={report ? "Editar informe" : "Nuevo informe"}
      description="Informe bromatológico con editor enriquecido, importancia y adjuntos."
      className="max-w-3xl"
    >
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        {/* Fecha + importancia */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Fecha del informe"
            type="date"
            error={errors.report_date?.message}
            {...register("report_date")}
          />
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-medium text-muted-foreground">
                Importancia
              </label>
              <ImportanceBadge value={importance ?? 0} />
            </div>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={importance ?? 0}
                onChange={(e) =>
                  setValue("importance", Number(e.target.value), {
                    shouldValidate: true,
                  })
                }
                aria-label="Importancia 0 a 100"
                className="accent-primary h-2 flex-1 cursor-pointer"
              />
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={Number.isFinite(importance) ? importance : 0}
                onChange={(e) =>
                  setValue(
                    "importance",
                    e.target.value === "" ? NaN : Number(e.target.value),
                    { shouldValidate: true }
                  )
                }
                aria-label="Importancia (número)"
                className="h-11 w-20 rounded-lg border border-input bg-background px-3 text-right text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>
        </div>
        {errors.importance && (
          <p className="-mt-2 text-sm text-destructive">
            {errors.importance.message}
          </p>
        )}

        {/* Editor enriquecido */}
        <div>
          <label className="mb-2 block text-sm font-medium text-muted-foreground">
            Contenido del informe
          </label>
          <RichTextEditor
            value={contentHtml ?? ""}
            onChange={(html) =>
              setValue("content_html", html, { shouldValidate: true })
            }
            placeholder="Hallazgos, conclusiones, recomendaciones…"
            toolbarExtra={
              aiEnabled ? (
                <ReportAiAssistant
                  getHtml={() => watch("content_html") ?? ""}
                  onApply={(html) =>
                    setValue("content_html", html, { shouldValidate: true })
                  }
                />
              ) : undefined
            }
          />
          {errors.content_html && (
            <p className="mt-2 text-sm text-destructive">
              {errors.content_html.message}
            </p>
          )}
        </div>

        {/* Miembros a notificar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              <Users size={13} />
              Notificar a
            </p>
            <span className="text-xs text-muted-foreground">
              {selectedSet.size} seleccionados
            </span>
          </div>
          {(members ?? []).length === 0 ? (
            <p className="py-2 text-xs text-muted-foreground">
              No hay operarios cargados todavía.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {(members ?? []).map((m) => {
                const active = selectedSet.has(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggleMember(m.id)}
                    aria-pressed={active}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition",
                      active
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                    )}
                  >
                    {active && <Check size={13} />}
                    {m.full_name}
                  </button>
                );
              })}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Al crear el informe se envía un email a los operarios elegidos que
            tengan correo cargado.
          </p>
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
              Sin adjuntos. Sumá PDF, imágenes o planillas de respaldo.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {existing.map((att) => (
                <li
                  key={att.id}
                  className="bg-muted/30 flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
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
                  className="flex items-center justify-between gap-3 rounded-md border border-dashed border-border px-3 py-2"
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
            {report ? "Guardar cambios" : "Crear informe"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
