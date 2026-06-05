"use client";

import { useState } from "react";
import { FileText, Pencil, User, Users } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { ImportanceBadge } from "@/components/informes/ImportanceBadge";
import { formatDate } from "@/lib/utils/format";
import { sanitizeRichHtml } from "@/lib/utils/sanitizeHtml";
import {
  getAttachmentUrl,
  type Member,
  type Report,
} from "@/modules/quality/api";

// Detalle de un informe: importancia, autor, contenido enriquecido, destinatarios
// y adjuntos (descarga vía signed URL del bucket privado).
export function ReportDetailDrawer({
  report,
  members,
  onClose,
  onEdit,
}: {
  report: Report | null;
  members: Member[];
  onClose: () => void;
  onEdit: (r: Report) => void;
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

  const notified = report
    ? members.filter((m) => report.notify_member_ids.includes(m.id))
    : [];

  return (
    <Modal
      open={report !== null}
      onOpenChange={(o) => !o && onClose()}
      title="Detalle del informe"
      description={report ? `Fecha · ${formatDate(report.report_date)}` : undefined}
      className="max-w-3xl"
    >
      {!report ? null : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <ImportanceBadge value={report.importance} />
            {report.member?.full_name && (
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <User size={13} />
                {report.member.full_name}
              </span>
            )}
          </div>

          {/*
            Render del HTML del informe SIEMPRE sanitizado (allowlist de tags
            del editor, cero atributos salvo href http(s)). El editor Tiptap es
            el camino feliz, pero cualquier miembro del tenant puede escribir
            content_html por el cliente Supabase directo: nunca se confía en el
            origen (stored XSS). La clase `.rte-content` aplica la tipografía.
          */}
          <div
            className="rte-content rounded-ninjaSm border border-border bg-card/40 px-4 py-3"
            dangerouslySetInnerHTML={{
              __html: sanitizeRichHtml(report.content_html),
            }}
          />

          {notified.length > 0 && (
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                <Users size={13} />
                Notificados ({notified.length})
              </p>
              <div className="flex flex-wrap gap-2">
                {notified.map((m) => (
                  <span
                    key={m.id}
                    className="bg-secondary/50 inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-sm"
                  >
                    {m.full_name}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Adjuntos ({report.attachments.length})
            </p>
            {report.attachments.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin adjuntos.</p>
            ) : (
              <ul className="space-y-1.5">
                {report.attachments.map((att) => (
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
            <Button onClick={() => onEdit(report)}>
              <Pencil size={16} />
              Editar
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
