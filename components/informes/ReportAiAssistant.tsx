"use client";

import { useState } from "react";
import { ChevronDown, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownLabel,
  DropdownSeparator,
  DropdownTrigger,
} from "@/components/ui/Dropdown";
import { useToast } from "@/components/ui/Toast";
import { sanitizeRichHtml } from "@/lib/utils/sanitizeHtml";
import {
  assistReport,
  REPORT_AI_ACTIONS,
  type ReportAIAction,
} from "@/modules/quality/ai";

// =============================================================================
// ReportAiAssistant — asistente de IA para el editor de informes bromatológicos.
//
// Menú "Asistente IA" (Sparkles) con las 3 acciones (improve · structure ·
// summarize). El resultado NUNCA se aplica solo: abre un modal de confirmación
// con preview del HTML propuesto (render sanitizado) y botones Aplicar /
// Descartar. Al aplicar llama onApply(html) y muestra el aviso de revisión.
//
// Se monta como slot (toolbarExtra) del RichTextEditor genérico: la IA no vive
// dentro del componente reutilizable. Solo se renderiza si el caller decide que
// la IA está habilitada (gating server-side vía /api/ai/status).
// =============================================================================

export function ReportAiAssistant({
  getHtml,
  onApply,
}: {
  /** Devuelve el HTML actual del editor al momento de invocar la acción. */
  getHtml: () => string;
  /** Vuelca el HTML propuesto en el editor (tras confirmar). */
  onApply: (html: string) => void;
}) {
  const { toast } = useToast();
  const [loadingAction, setLoadingAction] = useState<ReportAIAction | null>(null);
  const [proposal, setProposal] = useState<string | null>(null);
  const [proposalAction, setProposalAction] = useState<ReportAIAction | null>(
    null,
  );

  async function run(action: ReportAIAction) {
    const html = getHtml();
    if (html.replace(/<[^>]*>/g, "").trim().length === 0) {
      toast({
        title: "Escribí algo primero",
        description: "El asistente trabaja sobre el contenido del informe.",
        variant: "error",
      });
      return;
    }
    setLoadingAction(action);
    try {
      const result = await assistReport(action, html);
      if (!result.ok) {
        toast({
          title: result.upgrade ? "Función de IA" : "No se pudo generar",
          description: result.error,
          variant: "error",
        });
        return;
      }
      setProposal(result.html);
      setProposalAction(action);
    } finally {
      setLoadingAction(null);
    }
  }

  function discard() {
    setProposal(null);
    setProposalAction(null);
  }

  function apply() {
    if (proposal === null) return;
    onApply(proposal);
    discard();
    toast({
      title: "Generado con IA · revisá antes de guardar",
      description: "El contenido se reemplazó con la propuesta del asistente.",
      variant: "success",
    });
  }

  const busy = loadingAction !== null;
  const actionLabel = proposalAction
    ? REPORT_AI_ACTIONS.find((a) => a.value === proposalAction)?.label
    : null;

  return (
    <>
      <Dropdown>
        <DropdownTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            loading={busy}
            className="h-8 gap-1.5 px-2.5 text-xs text-primary hover:bg-primary/10 hover:text-primary"
          >
            <Sparkles size={14} />
            Asistente IA
            <ChevronDown size={13} className="opacity-60" />
          </Button>
        </DropdownTrigger>
        <DropdownContent align="end" className="min-w-64">
          <DropdownLabel>Asistente de redacción</DropdownLabel>
          <DropdownSeparator />
          {REPORT_AI_ACTIONS.map((a) => (
            <DropdownItem
              key={a.value}
              onSelect={() => void run(a.value)}
              className="flex-col items-start gap-0.5 py-2"
            >
              <span className="flex items-center gap-2 font-medium">
                <Sparkles size={13} className="text-primary" />
                {a.label}
              </span>
              <span className="pl-5 text-xs text-muted-foreground">
                {a.hint}
              </span>
            </DropdownItem>
          ))}
        </DropdownContent>
      </Dropdown>

      {/* Confirmación con preview: NUNCA aplica sin que el humano lo apruebe. */}
      <Modal
        open={proposal !== null}
        onOpenChange={(o) => !o && discard()}
        title="Propuesta del asistente IA"
        description={
          actionLabel
            ? `${actionLabel} · revisá el resultado antes de aplicarlo`
            : "Revisá el resultado antes de aplicarlo"
        }
        className="max-w-2xl"
      >
        <div className="space-y-4">
          <p className="inline-flex items-center gap-1.5 rounded-ninjaFull bg-primary/10 px-3 py-1 text-[11px] font-medium text-primary">
            <Sparkles size={12} />
            Generado con IA · revisá antes de guardar
          </p>
          <p className="text-xs text-muted-foreground">
            La IA puede equivocarse. Verificá que no haya inventado ni cambiado
            datos, valores ni unidades antes de aplicar.
          </p>
          {/*
            Preview del HTML propuesto SIEMPRE sanitizado (misma allowlist del
            editor): el origen es la salida de un LLM, nunca se confía en él
            (defensa en profundidad; el route handler ya sanitizó en el borde).
          */}
          <div
            className="rte-content max-h-[50vh] overflow-y-auto rounded-ninjaMd border border-border bg-card/40 px-4 py-3"
            dangerouslySetInnerHTML={{
              __html: sanitizeRichHtml(proposal ?? ""),
            }}
          />
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="secondary" onClick={discard}>
              Descartar
            </Button>
            <Button type="button" onClick={apply}>
              <Sparkles size={15} />
              Aplicar
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
