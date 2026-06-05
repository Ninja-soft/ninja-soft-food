"use client";

import { useState } from "react";
import { FileText, FlaskConical, Pencil, User } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { Money } from "@/components/ui/Typography";
import { ConformityBadge } from "@/components/analisis/ConformityBadge";
import { formatDate } from "@/lib/utils/format";
import { getAttachmentUrl, type Analysis } from "@/modules/quality/api";
import { ANALYSIS_TYPE_LABELS } from "@/modules/quality/schemas";

// Detalle de un análisis: metadatos, conformidad, observaciones y adjuntos
// (descarga vía signed URL del bucket privado).
export function AnalysisDetailDrawer({
  analysis,
  onClose,
  onEdit,
}: {
  analysis: Analysis | null;
  onClose: () => void;
  onEdit: (a: Analysis) => void;
}) {
  const { toast } = useToast();
  const [openingId, setOpeningId] = useState<string | null>(null);

  async function openAttachment(path: string, id: string) {
    setOpeningId(id);
    try {
      const url = await getAttachmentUrl(path);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast({
        title: "No se pudo abrir el adjunto",
        description: e instanceof Error ? e.message : undefined,
        variant: "error",
      });
    } finally {
      setOpeningId(null);
    }
  }

  return (
    <Modal
      open={analysis !== null}
      onOpenChange={(o) => !o && onClose()}
      title="Detalle del análisis"
      description={
        analysis
          ? `${ANALYSIS_TYPE_LABELS[analysis.type]} · ${formatDate(analysis.analysis_date)}`
          : undefined
      }
      className="max-w-2xl"
    >
      {!analysis ? null : (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="bg-muted/30 rounded-ninjaSm border border-border p-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Conformidad
              </p>
              <ConformityBadge value={analysis.conformity} />
            </div>
            <div className="bg-muted/30 rounded-ninjaSm border border-border p-3">
              <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <FlaskConical size={12} />
                Laboratorio
              </p>
              <p className="font-medium">
                {analysis.laboratory?.name ?? "Sin laboratorio"}
              </p>
            </div>
            <div className="bg-muted/30 rounded-ninjaSm border border-border p-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Muestra
              </p>
              <p className="font-medium">
                {analysis.sample_code ? (
                  <Money>{analysis.sample_code}</Money>
                ) : (
                  <span className="text-muted-foreground">-</span>
                )}
              </p>
            </div>
          </div>

          {analysis.member?.full_name && (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <User size={13} />
              Registrado por {analysis.member.full_name}
            </p>
          )}

          {analysis.observations_html && (
            <div className="rounded-ninjaSm border border-border p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Observaciones
              </p>
              <p className="whitespace-pre-wrap text-sm text-foreground">
                {analysis.observations_html}
              </p>
            </div>
          )}

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Adjuntos ({analysis.attachments.length})
            </p>
            {analysis.attachments.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin adjuntos.</p>
            ) : (
              <ul className="space-y-1.5">
                {analysis.attachments.map((att) => (
                  <li
                    key={att.id}
                    className="bg-muted/30 flex items-center justify-between gap-3 rounded-ninjaSm border border-border px-3 py-2"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <FileText size={15} className="shrink-0 text-primary" />
                      <span className="truncate text-sm">{att.name}</span>
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      loading={openingId === att.id}
                      onClick={() => openAttachment(att.url, att.id)}
                    >
                      Abrir
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button variant="secondary" onClick={onClose}>
              Cerrar
            </Button>
            <Button onClick={() => onEdit(analysis)}>
              <Pencil size={16} />
              Editar
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
