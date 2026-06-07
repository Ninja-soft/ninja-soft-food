"use client";

import { useMemo, useState } from "react";
import { FileText, Search, Soup } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SpinnerBlock } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { Money } from "@/components/ui/Typography";
import {
  SendEmailButton,
  SendEmailModal,
} from "@/components/emails/SendEmailModal";
import { cn } from "@/lib/utils/cn";
import { formatDate, formatQty } from "@/lib/utils/format";
import { useProductions } from "@/modules/production/hooks";
import { getProductionDetail, type TenantBranding } from "@/modules/planillas/api";
import { generateProductionPlanilla } from "@/modules/planillas/generators";

// Planilla individual: elegí una producción y generá su planilla de 1 página.
export function IndividualTab({ branding }: { branding: TenantBranding | undefined }) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);

  const { data: productions, isLoading } = useProductions(search);

  const selected = useMemo(
    () => (productions ?? []).find((p) => p.id === selectedId) ?? null,
    [productions, selectedId],
  );

  async function handleGenerate() {
    if (!selectedId || !branding) return;
    setGenerating(true);
    try {
      const detail = await getProductionDetail(selectedId);
      await generateProductionPlanilla(detail, branding);
      toast({ title: "Planilla generada", variant: "success" });
    } catch (e) {
      toast({
        title: "No se pudo generar la planilla",
        description: e instanceof Error ? e.message : undefined,
        variant: "error",
      });
    } finally {
      setGenerating(false);
    }
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
            placeholder="Buscar producción por código o lote…"
            className="h-11 w-full rounded-lg border border-input bg-background pl-10 pr-4 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <div className="flex gap-2">
          <SendEmailButton
            onClick={() => setEmailOpen(true)}
            disabled={!selectedId || !branding}
          />
          <Button
            onClick={handleGenerate}
            loading={generating}
            disabled={!selectedId || !branding}
          >
            <FileText size={16} />
            Generar PDF
          </Button>
        </div>
      </div>

      {selected && branding && (
        <SendEmailModal
          open={emailOpen}
          onOpenChange={setEmailOpen}
          title="Enviar planilla por email"
          documentLabel={`Planilla de producción ${selected.code}`}
          defaultSubject={`Planilla de producción ${selected.code}`}
          getAttachments={async () => {
            const detail = await getProductionDetail(selected.id);
            const { blob, filename } = await generateProductionPlanilla(
              detail,
              branding,
              "blob",
            );
            return [{ blob, filename }];
          }}
        />
      )}

      {isLoading ? (
        <SpinnerBlock />
      ) : (productions ?? []).length === 0 ? (
        <EmptyHint
          text={
            search
              ? "Sin resultados para esa búsqueda."
              : "Todavía no hay producciones para imprimir."
          }
        />
      ) : (
        <div className="max-h-[28rem] space-y-1.5 overflow-y-auto pr-1">
          {(productions ?? []).map((p) => {
            const active = p.id === selectedId;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedId(p.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition",
                  active
                    ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                    : "border-border bg-card hover:border-primary/40",
                )}
              >
                <span
                  className={cn(
                    "grid h-9 w-9 shrink-0 place-items-center rounded-md",
                    active
                      ? "bg-primary/20 text-primary"
                      : "bg-muted/60 text-muted-foreground",
                  )}
                >
                  <Soup size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <Money className="text-xs font-semibold">{p.code}</Money>
                    <span className="truncate text-sm font-medium">
                      {p.recipe?.title ?? "-"}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {formatDate(p.production_date)} · {formatQty(p.quantity_kg)} kg
                    {p.product_lot_number ? ` · lote ${p.product_lot_number}` : ""}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="glass-card flex flex-col items-center gap-2 py-12 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-lg bg-primary/15 text-primary">
        <FileText size={22} />
      </span>
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
