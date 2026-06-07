"use client";

import { useState } from "react";
import { Download, FileText, Plus, QrCode, Search, Soup } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SpinnerBlock } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { Eyebrow, Heading, Money } from "@/components/ui/Typography";
import { ProductionFormModal } from "@/components/production/ProductionFormModal";
import { TraceQrModal } from "@/components/production/TraceQrModal";
import { ActivePlantBadge } from "@/components/establishments/ActivePlantBadge";
import { useActiveEstablishment } from "@/modules/establishments/hooks";
import { cn } from "@/lib/utils/cn";
import { daysUntil, formatDate, formatQty } from "@/lib/utils/format";
import { exportToExcel } from "@/lib/utils/xlsx";
import { useProductions } from "@/modules/production/hooks";
import { getRecipe } from "@/modules/recipes/api";
import { generateRecipePdf } from "@/modules/recipes/pdf";
import { useTenantBranding } from "@/modules/planillas/hooks";

const STATUS_LABELS: Record<string, string> = {
  draft: "Borrador",
  completed: "Completada",
  voided: "Anulada",
};

// Producción: historial + alta que consume lotes (corazón de la trazabilidad).
export default function ProduccionPage() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [qr, setQr] = useState<{ slug: string; code: string } | null>(null);
  const [recipePdfBusy, setRecipePdfBusy] = useState<string | null>(null);

  const { activeId } = useActiveEstablishment();
  const { data: productions, isLoading } = useProductions(search, activeId);
  const { data: branding } = useTenantBranding();

  // Descarga la ficha técnica (PDF) de la receta usada en la producción.
  async function handleRecipePdf(productionId: string, recipeId: string) {
    if (!branding) {
      toast({
        title: "No se pudo generar el PDF",
        description: "Datos del establecimiento no disponibles todavía.",
        variant: "error",
      });
      return;
    }
    setRecipePdfBusy(productionId);
    try {
      const recipe = await getRecipe(recipeId);
      await generateRecipePdf(recipe, branding);
    } catch (e) {
      toast({
        title: "No se pudo generar el PDF de la receta",
        description: e instanceof Error ? e.message : undefined,
        variant: "error",
      });
    } finally {
      setRecipePdfBusy(null);
    }
  }

  function handleExport() {
    void exportToExcel({
      filename: "producciones",
      sheetName: "Producciones",
      title: "Historial de producción",
      subtitle: search.trim() ? `Filtro: ${search.trim()}` : undefined,
      columns: [
        { header: "Código", key: "code", width: 16 },
        { header: "Fecha", key: "date", format: "date", width: 14 },
        { header: "Receta", key: "recipe", width: 32 },
        { header: "Cantidad (kg)", key: "kg", format: "number", width: 16 },
        { header: "Lote", key: "lot", width: 22 },
        { header: "Vencimiento", key: "expiry", format: "date", width: 16 },
        { header: "Estado", key: "state", width: 14 },
      ],
      rows: (productions ?? []).map((p) => ({
        code: p.code,
        date: p.production_date,
        recipe: p.recipe?.title ?? "",
        kg: p.quantity_kg,
        lot: p.product_lot_number ?? "",
        expiry: p.product_expiry_date,
        state: STATUS_LABELS[p.status] ?? p.status,
      })),
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Eyebrow>Trazabilidad</Eyebrow>
          <Heading as="h1" className="mt-3">
            Producción
          </Heading>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <p className="text-sm text-muted-foreground">
              Cada producción consume lotes de materia prima y genera el lote
              trazable del producto terminado.
            </p>
            <ActivePlantBadge />
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={handleExport}
            disabled={(productions ?? []).length === 0}
          >
            <Download size={16} />
            Exportar Excel
          </Button>
          <Button onClick={() => setModalOpen(true)}>
            <Plus size={16} />
            Nueva producción
          </Button>
        </div>
      </div>

      {/* Búsqueda */}
      <div className="relative max-w-md">
        <Search
          size={16}
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por código o lote…"
          className="h-11 w-full rounded-lg border border-input bg-background pl-10 pr-4 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </div>

      {/* Listado */}
      {isLoading ? (
        <SpinnerBlock />
      ) : (productions ?? []).length === 0 ? (
        <div className="glass-card flex flex-col items-center gap-3 py-14 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-lg bg-primary/15 text-primary">
            <Soup size={26} />
          </span>
          <div>
            <p className="font-semibold">
              {search ? "Sin resultados" : "Todavía no hay producciones"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {search
                ? "Probá con otro código o lote."
                : "Registrá tu primera producción para generar trazabilidad."}
            </p>
          </div>
          {!search && (
            <Button onClick={() => setModalOpen(true)}>
              <Plus size={16} />
              Nueva producción
            </Button>
          )}
        </div>
      ) : (
        <div className="glass-card overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-muted/60 text-left text-xs uppercase tracking-[0.14em] text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-4 py-3 font-medium">Código</th>
                <th className="px-4 py-3 font-medium">Producto</th>
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 text-right font-medium">Cantidad</th>
                <th className="px-4 py-3 font-medium">Lote</th>
                <th className="px-4 py-3 font-medium">Vence</th>
                <th className="px-4 py-3 font-medium">Traza</th>
                <th className="px-4 py-3 font-medium">Receta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(productions ?? []).map((p) => {
                const d = daysUntil(p.product_expiry_date);
                const slug = p.trace?.[0]?.slug ?? null;
                return (
                  <tr key={p.id} className="transition hover:bg-secondary/40">
                    <td className="px-4 py-3">
                      <Money className="text-xs font-semibold">{p.code}</Money>
                    </td>
                    <td className="px-4 py-3 font-medium">
                      <span className="flex items-center gap-2.5">
                        {p.photo_url && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={p.photo_url}
                            alt=""
                            className="h-9 w-9 shrink-0 rounded-md object-cover ring-1 ring-border"
                          />
                        )}
                        <span className="truncate">
                          {p.recipe?.title ?? "-"}
                        </span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDate(p.production_date)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Money>{formatQty(p.quantity_kg)} kg</Money>
                    </td>
                    <td className="px-4 py-3">
                      <Money className="text-xs">
                        {p.product_lot_number ?? "-"}
                      </Money>
                    </td>
                    <td
                      className={cn(
                        "px-4 py-3 text-muted-foreground",
                        d !== null && d < 0 && "font-semibold text-destructive",
                        d !== null && d >= 0 && d <= 7 && "text-accent",
                      )}
                    >
                      {formatDate(p.product_expiry_date)}
                    </td>
                    <td className="px-4 py-3">
                      {slug ? (
                        <button
                          type="button"
                          onClick={() => setQr({ slug, code: p.code })}
                          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-primary transition hover:bg-primary/10"
                        >
                          <QrCode size={14} />
                          QR
                        </button>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        disabled={recipePdfBusy === p.id}
                        onClick={() => void handleRecipePdf(p.id, p.recipe_id)}
                        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition hover:bg-secondary/60 hover:text-foreground disabled:opacity-50"
                      >
                        <FileText size={14} />
                        {recipePdfBusy === p.id ? "Generando…" : "PDF"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ProductionFormModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        onCompleted={(slug, code) => setQr({ slug, code })}
      />
      <TraceQrModal
        slug={qr?.slug ?? null}
        code={qr?.code ?? null}
        onClose={() => setQr(null)}
      />
    </div>
  );
}
