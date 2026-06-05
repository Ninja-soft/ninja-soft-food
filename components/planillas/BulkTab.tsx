"use client";

import { useMemo, useState } from "react";
import { Check, FileStack, Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SpinnerBlock } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { Money } from "@/components/ui/Typography";
import { cn } from "@/lib/utils/cn";
import { formatDate, formatQty } from "@/lib/utils/format";
import { useProductions } from "@/modules/production/hooks";
import { getProductionDetail, type TenantBranding } from "@/modules/planillas/api";
import { generateBulkProductionPlanillas } from "@/modules/planillas/generators";

// Planilla masiva: seleccioná varias producciones y generá un único PDF
// con una planilla por página.
export function BulkTab({ branding }: { branding: TenantBranding | undefined }) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState(false);

  const { data: productions, isLoading } = useProductions(search);
  const list = useMemo(() => productions ?? [], [productions]);

  const allVisibleSelected = useMemo(
    () => list.length > 0 && list.every((p) => selected.has(p.id)),
    [list, selected],
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) list.forEach((p) => next.delete(p.id));
      else list.forEach((p) => next.add(p.id));
      return next;
    });
  }

  async function handleGenerate() {
    if (selected.size === 0 || !branding) return;
    setGenerating(true);
    try {
      // Respetamos el orden visible de la lista para el PDF.
      const ids = list.filter((p) => selected.has(p.id)).map((p) => p.id);
      const details = await Promise.all(ids.map((id) => getProductionDetail(id)));
      await generateBulkProductionPlanillas(details, branding);
      toast({
        title: `${details.length} planillas generadas`,
        variant: "success",
      });
    } catch (e) {
      toast({
        title: "No se pudieron generar las planillas",
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
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <span className="text-sm text-muted-foreground">
              {selected.size} seleccionada{selected.size === 1 ? "" : "s"}
            </span>
          )}
          <Button
            onClick={handleGenerate}
            loading={generating}
            disabled={selected.size === 0 || !branding}
          >
            <FileStack size={16} />
            Generar PDF
          </Button>
        </div>
      </div>

      {isLoading ? (
        <SpinnerBlock />
      ) : list.length === 0 ? (
        <div className="glass-card flex flex-col items-center gap-2 py-12 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-lg bg-primary/15 text-primary">
            <FileStack size={22} />
          </span>
          <p className="text-sm text-muted-foreground">
            {search
              ? "Sin resultados para esa búsqueda."
              : "Todavía no hay producciones para imprimir."}
          </p>
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={toggleAllVisible}
            className="text-xs font-medium text-primary transition hover:underline"
          >
            {allVisibleSelected
              ? "Deseleccionar todas las visibles"
              : "Seleccionar todas las visibles"}
          </button>
          <div className="max-h-[26rem] space-y-1.5 overflow-y-auto pr-1">
            {list.map((p) => {
              const checked = selected.has(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggle(p.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition",
                    checked
                      ? "border-primary bg-primary/10"
                      : "border-border bg-card hover:border-primary/40",
                  )}
                >
                  <span
                    className={cn(
                      "grid h-5 w-5 shrink-0 place-items-center rounded-md border transition",
                      checked
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background",
                    )}
                  >
                    {checked && <Check size={13} strokeWidth={3} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <Money className="text-xs font-semibold">{p.code}</Money>
                      <span className="truncate text-sm font-medium">
                        {p.recipe?.title ?? "-"}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {formatDate(p.production_date)} ·{" "}
                      {formatQty(p.quantity_kg)} kg
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
