"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FileText, Mail, Plus, Send, Sheet, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils/cn";
import { blobToAttachment, sendDocumentEmail } from "@/modules/outbound-email/api";
import {
  enforceTypography,
  isTypographyClean,
  isValidEmail,
  MAX_ATTACHMENTS_BYTES,
  MAX_RECIPIENTS,
  normalizeRecipients,
  sendEmailSchema,
  totalAttachmentBytes,
  type EmailAttachment,
} from "@/modules/outbound-email/schemas";

// =============================================================================
// components/emails/SendEmailModal — modal reutilizable "Enviar por email".
//
// Lo usan planillas, remitos, recetas, recall e informes. El documento (PDF o
// Excel) lo genera el caller LAZY: pasa getAttachments() que se invoca al abrir
// el modal (asi el modal sirve para PDF + Excel sin acoplarse a la generacion).
//
// Regla 6 (CLAUDE.md): el asunto y el mensaje los escribe el usuario; el modal
// normaliza em/en-dash a guion simple y bloquea emojis (mismo criterio que el
// schema). Toda la logica de envio vive en modules/outbound-email.
// =============================================================================

/** Un adjunto que el caller genera al abrir el modal. */
export type PreparedAttachment = { blob: Blob; filename: string };

interface SendEmailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Titulo del modal (p. ej. "Enviar planilla por email"). */
  title?: string;
  /** Etiqueta del documento (para el cuerpo por defecto y el log). */
  documentLabel: string;
  /** Asunto prellenado (editable). */
  defaultSubject: string;
  /** Destinatarios sugeridos (chips iniciales, editables). */
  suggestedRecipients?: string[];
  /** Genera los adjuntos al abrir (PDF/Excel ya armados como Blob). */
  getAttachments: () => Promise<PreparedAttachment[]>;
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function mapError(error: string, detail?: string): string {
  switch (error) {
    case "rate_limited":
      return detail ?? "Alcanzaste el limite de envios por hora. Probá mas tarde.";
    case "attachments_too_large":
      return detail ?? "Los adjuntos superan el limite de 5 MB.";
    case "invalid_input":
      return detail ?? "Revisá los datos del email.";
    case "no_tenant":
      return "No se encontró el negocio activo.";
    case "unauthorized":
      return "Tu sesión expiró. Volvé a iniciar sesión.";
    case "send_failed":
      return "No se pudo enviar el email. El envío de emails puede no estar configurado todavía.";
    default:
      return detail ?? "No se pudo enviar. Reintentá en unos segundos.";
  }
}

export function SendEmailModal({
  open,
  onOpenChange,
  title = "Enviar por email",
  documentLabel,
  defaultSubject,
  suggestedRecipients = [],
  getAttachments,
}: SendEmailModalProps) {
  const { toast } = useToast();

  const [recipients, setRecipients] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [subject, setSubject] = useState(defaultSubject);
  const [message, setMessage] = useState("");
  const [attachments, setAttachments] = useState<EmailAttachment[] | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [prepareError, setPrepareError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);

  // Al abrir: hidratamos los chips sugeridos, reseteamos el asunto y generamos
  // los adjuntos del documento (lazy).
  useEffect(() => {
    if (!open) return;
    setRecipients(normalizeRecipients(suggestedRecipients));
    setDraft("");
    setSubject(defaultSubject);
    setMessage("");
    setAttachments(null);
    setPrepareError(null);

    let cancelled = false;
    setPreparing(true);
    getAttachments()
      .then(async (prepared) => {
        if (cancelled) return;
        const built = await Promise.all(
          prepared.map((p) => blobToAttachment(p.blob, p.filename)),
        );
        if (!cancelled) setAttachments(built);
      })
      .catch((e) => {
        if (!cancelled)
          setPrepareError(
            e instanceof Error ? e.message : "No se pudo generar el documento",
          );
      })
      .finally(() => {
        if (!cancelled) setPreparing(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const attachmentsBytes = useMemo(
    () => (attachments ? totalAttachmentBytes(attachments) : 0),
    [attachments],
  );
  const tooLarge = attachmentsBytes > MAX_ATTACHMENTS_BYTES;

  function commitDraft(value: string) {
    // Permite pegar varios separados por coma / espacio / salto de linea.
    const pieces = value.split(/[\s,;]+/).map((p) => p.trim()).filter(Boolean);
    if (pieces.length === 0) return;
    setRecipients((prev) => normalizeRecipients([...prev, ...pieces]));
    setDraft("");
  }

  function removeRecipient(email: string) {
    setRecipients((prev) => prev.filter((r) => r !== email));
  }

  function handleDraftKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === "," || e.key === " " || e.key === ";") {
      e.preventDefault();
      commitDraft(draft);
    } else if (e.key === "Backspace" && draft === "" && recipients.length > 0) {
      removeRecipient(recipients[recipients.length - 1]);
    }
  }

  const invalidRecipient = recipients.find((r) => !isValidEmail(r)) ?? null;
  const subjectDirty = subject.length > 0 && !isTypographyClean(subject);
  const messageDirty = message.length > 0 && !isTypographyClean(message);

  async function handleSend() {
    if (sendingRef.current) return;
    // Si quedo texto sin confirmar en el input, lo tomamos igual.
    const finalRecipients =
      draft.trim().length > 0
        ? normalizeRecipients([...recipients, ...draft.split(/[\s,;]+/)])
        : recipients;

    const parsed = sendEmailSchema.safeParse({
      to: finalRecipients,
      subject,
      message,
      documentLabel,
    });
    if (!parsed.success) {
      toast({
        title: parsed.error.issues[0]?.message ?? "Revisá los datos",
        variant: "error",
      });
      return;
    }
    if (!attachments || attachments.length === 0) {
      toast({ title: "El documento todavía se está generando", variant: "info" });
      return;
    }
    if (tooLarge) {
      toast({ title: "Los adjuntos superan el limite de 5 MB", variant: "error" });
      return;
    }

    sendingRef.current = true;
    setSending(true);
    try {
      const result = await sendDocumentEmail({
        input: parsed.data,
        attachments,
      });
      if (result.ok) {
        toast({
          title:
            result.sent === 1
              ? "Email enviado"
              : `Email enviado a ${result.sent} destinatarios`,
          variant: "success",
        });
        onOpenChange(false);
      } else {
        toast({
          title: mapError(result.error, result.detail),
          variant: "error",
        });
      }
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  const canSend =
    !sending &&
    !preparing &&
    !prepareError &&
    !tooLarge &&
    !subjectDirty &&
    !messageDirty &&
    !invalidRecipient &&
    (recipients.length > 0 || draft.trim().length > 0) &&
    subject.trim().length > 0;

  return (
    <Modal
      open={open}
      onOpenChange={(o) => !sending && onOpenChange(o)}
      title={title}
      description="Adjunta el documento generado. El envío usa la identidad de tu negocio."
      className="max-w-lg"
    >
      <div className="space-y-5">
        {/* Destinatarios */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">
            Destinatarios
          </label>
          <div className="flex flex-wrap gap-1.5 rounded-lg border border-input bg-background p-2">
            {recipients.map((r) => {
              const valid = isValidEmail(r);
              return (
                <span
                  key={r}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs",
                    valid
                      ? "bg-primary/10 text-primary"
                      : "bg-destructive/10 text-destructive",
                  )}
                >
                  {r}
                  <button
                    type="button"
                    onClick={() => removeRecipient(r)}
                    aria-label={`Quitar ${r}`}
                    className="transition hover:opacity-70"
                  >
                    <X size={12} />
                  </button>
                </span>
              );
            })}
            <input
              type="email"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleDraftKey}
              onBlur={() => draft.trim() && commitDraft(draft)}
              placeholder={
                recipients.length === 0 ? "cliente@ejemplo.com" : "Agregar otro…"
              }
              className="min-w-[140px] flex-1 bg-transparent px-1.5 py-1 text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>
          {invalidRecipient && (
            <p className="text-xs text-destructive">
              Hay un email inválido: {invalidRecipient}
            </p>
          )}
          {recipients.length >= MAX_RECIPIENTS && (
            <p className="text-xs text-muted-foreground">
              Máximo {MAX_RECIPIENTS} destinatarios por envío.
            </p>
          )}
        </div>

        {/* Asunto */}
        <Input
          label="Asunto"
          value={subject}
          onChange={(e) => setSubject(enforceTypography(e.target.value))}
          error={subjectDirty ? "Sin emojis ni guiones largos" : undefined}
          maxLength={200}
        />

        {/* Mensaje */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-muted-foreground">
            Mensaje (opcional)
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(enforceTypography(e.target.value))}
            rows={4}
            placeholder="Escribí un mensaje para acompañar el documento…"
            className={cn(
              "w-full rounded-lg border bg-background p-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/20",
              messageDirty
                ? "border-destructive focus:border-destructive"
                : "border-input focus:border-primary",
            )}
          />
          {messageDirty && (
            <p className="text-xs text-destructive">
              Sin emojis ni guiones largos (usá guion simple o el punto medio ·).
            </p>
          )}
        </div>

        {/* Preview de adjuntos */}
        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Adjunto
          </p>
          {preparing ? (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
              <Spinner size={14} />
              Generando el documento…
            </div>
          ) : prepareError ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
              {prepareError}
            </p>
          ) : attachments && attachments.length > 0 ? (
            <ul className="space-y-1.5">
              {attachments.map((a) => {
                const isExcel = a.filename.toLowerCase().endsWith(".xlsx");
                return (
                  <li
                    key={a.filename}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      {isExcel ? (
                        <Sheet size={15} className="shrink-0 text-primary" />
                      ) : (
                        <FileText size={15} className="shrink-0 text-primary" />
                      )}
                      <span className="truncate text-sm">{a.filename}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {humanSize(
                        Math.floor((a.content.replace(/=+$/, "").length * 3) / 4),
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Sin adjunto.</p>
          )}
          {tooLarge && (
            <p className="text-xs text-destructive">
              Los adjuntos pesan {humanSize(attachmentsBytes)} (máximo 5 MB).
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={sending}
          >
            Cancelar
          </Button>
          <Button onClick={handleSend} loading={sending} disabled={!canSend}>
            <Send size={16} />
            Enviar
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** Botón disparador "Enviar por email" reutilizable (ícono Mail). */
export function SendEmailButton({
  onClick,
  label = "Enviar por email",
  variant = "secondary",
  size,
  disabled,
  className,
}: {
  onClick: () => void;
  label?: string;
  variant?: "primary" | "secondary" | "ghost" | "destructive";
  size?: "sm" | "md" | "lg" | "icon";
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Button
      variant={variant}
      size={size}
      onClick={onClick}
      disabled={disabled}
      className={className}
    >
      <Mail size={16} />
      {label}
    </Button>
  );
}
