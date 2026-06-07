"use client";

import { useState } from "react";
import { Lock, Pencil } from "lucide-react";
import { Eyebrow, Display, Money } from "@/components/ui/Typography";
import { SpinnerBlock } from "@/components/ui/Spinner";
import { Button } from "@/components/ui/Button";
import { PlanEditorModal } from "@/components/internal/PlanEditorModal";
import { useInternalPlans } from "@/modules/internal/hooks";
import type { InternalPlan } from "@/modules/internal/api";
import { canEditPlans, limitsIncludeAI } from "@/modules/internal/plans";
import { formatMoney } from "@/lib/utils/format";
import { AddonsCard } from "@/components/internal/AddonsCard";

// Tabla de planes del panel staff. Solo admin edita precios (canEditPlans);
// editor/viewer ven todo en lectura con una nota. Estética consola staff
// (mismas cards/tabla que /internal/tenants). Tokens only.

/** Resumen corto de plans.limits para la columna de límites. */
function summarizeLimits(limits: InternalPlan["limits"]): string {
  if (!limits || typeof limits !== "object" || Array.isArray(limits)) {
    return "—";
  }
  const o = limits as Record<string, unknown>;
  const lim = (v: unknown): string =>
    v === null || v === undefined ? "∞" : String(v);
  const parts = [
    `${lim(o.max_establishments)} est.`,
    `${lim(o.max_users)} usr.`,
    `${lim(o.max_recipes)} rec.`,
    `${lim(o.max_productions_per_month)} prod./mes`,
  ];
  return parts.join(" · ");
}

function priceCell(value: number | null): React.ReactNode {
  if (value === null) {
    return <span className="text-muted-foreground">A medida</span>;
  }
  return <Money>{formatMoney(value)}</Money>;
}

export function PlansTable({ level }: { level: string | null }) {
  const { data: plans, isLoading } = useInternalPlans();
  const [editing, setEditing] = useState<InternalPlan | null>(null);
  const canEdit = canEditPlans(level);

  return (
    <>
      <div>
        <Eyebrow>Comercial</Eyebrow>
        <Display className="mt-3 text-3xl md:text-4xl">Planes y precios</Display>
        <p className="mt-2 text-muted-foreground">
          Precios de los planes en pesos. La tabla de planes es la fuente de
          verdad: la card de suscripción de cada negocio lee estos valores. Sin
          precio en ARS, el plan queda{" "}
          <span className="font-medium text-foreground">a medida</span> (no
          autogestionable).
        </p>
      </div>

      {!canEdit && (
        <div className="mt-5 flex items-start gap-3 rounded-ninjaMd border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
          <Lock size={16} className="mt-0.5 shrink-0" />
          <span>
            Solo lectura. Editar precios de planes requiere nivel{" "}
            <span className="font-medium text-foreground">Admin</span>.
          </span>
        </div>
      )}

      <div className="mt-6 overflow-x-auto rounded-ninjaMd border border-border bg-card shadow-soft backdrop-blur-xl">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-muted text-left text-xs uppercase tracking-[0.14em] text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">ARS mensual</th>
              <th className="px-4 py-3">ARS anual</th>
              <th className="px-4 py-3">USD mensual</th>
              <th className="px-4 py-3">Límites</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3 text-right">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border text-foreground">
            {isLoading && (
              <tr>
                <td colSpan={7} className="px-4 py-10">
                  <SpinnerBlock />
                </td>
              </tr>
            )}
            {!isLoading && (plans?.length ?? 0) === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-10 text-center text-muted-foreground"
                >
                  No hay planes cargados.
                </td>
              </tr>
            )}
            {(plans ?? []).map((p) => {
              const selfService = p.monthlyPriceArs !== null;
              const withAI = limitsIncludeAI(p.limits);
              return (
                <tr key={p.id} className="transition hover:bg-muted/40">
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">{p.name}</div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-price text-xs uppercase tracking-wide text-muted-foreground">
                        {p.key}
                      </span>
                      {!selfService && (
                        <span className="inline-flex items-center whitespace-nowrap rounded-full border border-border bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Sin precio · no self-service
                        </span>
                      )}
                      {withAI && (
                        <span className="inline-flex items-center whitespace-nowrap rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                          IA incluida
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">{priceCell(p.monthlyPriceArs)}</td>
                  <td className="px-4 py-3">{priceCell(p.yearlyPriceArs)}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {p.monthlyPriceUsd !== null ? (
                      <Money>
                        {formatMoney(p.monthlyPriceUsd, { currency: "USD" })}
                      </Money>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {summarizeLimits(p.limits)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        p.isActive
                          ? "inline-flex items-center whitespace-nowrap rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-300"
                          : "inline-flex items-center whitespace-nowrap rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground"
                      }
                    >
                      {p.isActive ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {canEdit ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setEditing(p)}
                      >
                        <Pencil size={14} /> Editar
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-10">
        <AddonsCard canEdit={canEdit} />
      </div>

      {canEdit && editing && (
        <PlanEditorModal
          plan={editing}
          open={editing !== null}
          onOpenChange={(o) => !o && setEditing(null)}
        />
      )}
    </>
  );
}
