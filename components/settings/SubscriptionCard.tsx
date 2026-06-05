"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  Check,
  CreditCard,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Segmented } from "@/components/ui/Segmented";
import { useToast } from "@/components/ui/Toast";
import {
  useCancelSubscription,
  useMySubscription,
  usePlans,
  useStartCheckout,
} from "@/modules/billing/hooks";
import type { PlanRow, SubscriptionView } from "@/modules/billing/api";
import type { PlanLimits } from "@/lib/billing/limits";
import type { BillingCycle } from "@/lib/billing/types";
import { formatDate, formatMoney, daysUntil } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

// Suscripción — card premium de la sección Facturación.
// Estado canónico + grid de planes. La UI nunca toca MP: usa los hooks que
// llaman a /api/billing/*. El cobro lo confirma el webhook, nunca el redirect.

const STATUS_META: Record<
  SubscriptionView["status"],
  { label: string; className: string }
> = {
  trial: {
    label: "Prueba",
    className: "bg-ninja-lime/15 text-ninja-lime border-ninja-lime/30",
  },
  active: {
    label: "Activa",
    className: "bg-primary/15 text-primary border-primary/30",
  },
  past_due: {
    label: "Pago pendiente",
    className: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  },
  suspended: {
    label: "Suspendida",
    className: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  },
  cancelled: {
    label: "Cancelada",
    className: "border-destructive/30 bg-destructive/10 text-destructive",
  },
};

const FEATURE_LABELS: { key: keyof PlanLimits; label: string }[] = [
  { key: "max_establishments", label: "Establecimientos" },
  { key: "max_users", label: "Usuarios" },
  { key: "max_recipes", label: "Recetas" },
  { key: "max_productions_per_month", label: "Producciones/mes" },
];

function limitText(value: number | null): string {
  return value === null ? "Ilimitado" : String(value);
}

function priceFor(plan: PlanRow, cycle: BillingCycle): number | null {
  return cycle === "yearly" ? plan.yearly_price_ars : plan.monthly_price_ars;
}

export function SubscriptionCard() {
  const { toast } = useToast();
  const { data: sub, isLoading } = useMySubscription();
  const { data: plans } = usePlans();
  const checkout = useStartCheckout();
  const cancel = useCancelSubscription();

  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [pendingPlan, setPendingPlan] = useState<string | null>(null);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-muted-foreground">Cargando suscripción…</p>
        </CardContent>
      </Card>
    );
  }

  const status = sub?.status ?? "trial";
  const meta = STATUS_META[status];
  const isActive = status === "active";
  const isTrial = status === "trial";
  const trialDays =
    isTrial && sub?.trialEndsAt ? daysUntil(sub.trialEndsAt) : null;
  const currentLimits: PlanLimits | null = sub?.plan?.limits ?? null;

  async function onSubscribe(planKey: string) {
    setPendingPlan(planKey);
    try {
      const { init_point } = await checkout.mutateAsync({ planKey, cycle });
      window.location.href = init_point;
    } catch (e) {
      toast({
        title: "No se pudo iniciar el pago",
        description: e instanceof Error ? e.message : undefined,
        variant: "error",
      });
      setPendingPlan(null);
    }
  }

  async function onCancel() {
    try {
      await cancel.mutateAsync();
      toast({
        title: "Suscripción cancelada",
        description: "Conservás el acceso hasta el fin del período pagado.",
        variant: "success",
      });
    } catch (e) {
      toast({
        title: "No se pudo cancelar",
        description: e instanceof Error ? e.message : undefined,
        variant: "error",
      });
    } finally {
      setCancelOpen(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Estado actual */}
      <Card className="overflow-hidden">
        <div className="relative">
          <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />
          <CardContent className="relative space-y-5 p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CreditCard size={15} />
                  Plan actual
                </div>
                <div className="flex items-center gap-3">
                  <h3 className="font-display text-2xl font-extrabold tracking-tight">
                    {sub?.plan?.name ?? "Sin plan"}
                  </h3>
                  <span
                    className={cn(
                      "rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                      meta.className,
                    )}
                  >
                    {meta.label}
                  </span>
                </div>
              </div>

              {sub?.plan && (sub.plan.monthly_price_ars || sub.plan.yearly_price_ars) ? (
                <div className="text-right">
                  <div className="price-hl font-price text-2xl font-bold tabular-nums">
                    {formatMoney(
                      sub.billingCycle === "yearly"
                        ? sub.plan.yearly_price_ars
                        : sub.plan.monthly_price_ars,
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {sub.billingCycle === "yearly" ? "por año" : "por mes"}
                  </div>
                </div>
              ) : null}
            </div>

            {/* Trial / período */}
            {isTrial && trialDays !== null && (
              <div className="flex items-center gap-2 rounded-lg border border-ninja-lime/30 bg-ninja-lime/5 px-4 py-3 text-sm">
                <Sparkles size={16} className="text-ninja-lime" />
                <span>
                  {trialDays > 0 ? (
                    <>
                      Te quedan{" "}
                      <strong className="text-foreground">{trialDays} días</strong>{" "}
                      de prueba · vence el {formatDate(sub?.trialEndsAt)}
                    </>
                  ) : (
                    <>Tu período de prueba venció el {formatDate(sub?.trialEndsAt)}</>
                  )}
                </span>
              </div>
            )}

            {isActive && sub?.currentPeriodEnd && (
              <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                <CalendarClock size={16} />
                {sub.cancelAtPeriodEnd ? (
                  <span>
                    Cancela al finalizar el período · acceso hasta el{" "}
                    {formatDate(sub.currentPeriodEnd)}
                  </span>
                ) : (
                  <span>
                    Próxima renovación · {formatDate(sub.currentPeriodEnd)}
                  </span>
                )}
              </div>
            )}

            {status === "past_due" && (
              <div className="flex items-center gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-300">
                <AlertTriangle size={16} />
                Tu último pago no se acreditó. Reintentá para no perder acceso.
              </div>
            )}

            {/* Límites del plan */}
            {currentLimits && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {FEATURE_LABELS.map((f) => (
                  <div
                    key={f.key}
                    className="rounded-lg border border-border bg-muted/20 px-3 py-2.5"
                  >
                    <div className="text-xs text-muted-foreground">{f.label}</div>
                    <div className="font-price text-base font-bold tabular-nums">
                      {limitText(currentLimits[f.key] as number | null)}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {isActive && !sub?.cancelAtPeriodEnd && (
              <div className="flex justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCancelOpen(true)}
                  className="text-destructive hover:bg-destructive/10"
                >
                  Cancelar suscripción
                </Button>
              </div>
            )}
          </CardContent>
        </div>
      </Card>

      {/* Grid de planes (cambiar plan / suscribir) */}
      <Card>
        <CardContent className="space-y-5 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold tracking-tight">
                {isActive ? "Cambiar de plan" : "Elegí tu plan"}
              </h3>
              <p className="text-sm text-muted-foreground">
                Cobramos con Mercado Pago. Podés cancelar cuando quieras.
              </p>
            </div>
            <Segmented
              value={cycle}
              onChange={(v) => setCycle(v as BillingCycle)}
              options={[
                { value: "monthly", label: "Mensual" },
                { value: "yearly", label: "Anual" },
              ]}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {(plans ?? []).map((plan) => {
              const price = priceFor(plan, cycle);
              const isCurrent = sub?.plan?.key === plan.key && isActive;
              const selfService = price !== null && price > 0;
              const busy = checkout.isPending && pendingPlan === plan.key;
              return (
                <div
                  key={plan.id}
                  className={cn(
                    "flex flex-col rounded-lg border p-5 transition",
                    isCurrent
                      ? "border-primary bg-primary/[0.06] ring-1 ring-primary/30"
                      : "border-border bg-muted/10 hover:border-primary/40",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-display text-lg font-bold tracking-tight">
                      {plan.name}
                    </span>
                    {isCurrent && (
                      <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">
                        Actual
                      </span>
                    )}
                  </div>

                  <div className="mt-3">
                    {selfService ? (
                      <>
                        <span className="price-hl font-price text-2xl font-bold tabular-nums">
                          {formatMoney(price)}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {cycle === "yearly" ? " /año" : " /mes"}
                        </span>
                      </>
                    ) : (
                      <span className="text-base font-semibold text-muted-foreground">
                        A medida
                      </span>
                    )}
                  </div>

                  <ul className="mt-4 space-y-1.5 text-sm">
                    {FEATURE_LABELS.map((f) => (
                      <li
                        key={f.key}
                        className="flex items-center gap-2 text-muted-foreground"
                      >
                        <Check size={14} className="shrink-0 text-primary" />
                        {f.label}:{" "}
                        <span className="font-medium text-foreground">
                          {limitText(plan.limits[f.key] as number | null)}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-5 pt-1">
                    {isCurrent ? (
                      <Button variant="secondary" size="sm" disabled className="w-full">
                        Tu plan
                      </Button>
                    ) : selfService ? (
                      <Button
                        size="sm"
                        className="w-full"
                        loading={busy}
                        disabled={checkout.isPending}
                        onClick={() => onSubscribe(plan.key)}
                      >
                        {isActive ? "Cambiar a este plan" : "Suscribirme"}
                      </Button>
                    ) : (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="w-full"
                        onClick={() =>
                          (window.location.href =
                            "mailto:hola@ninjasoft.app?subject=Plan%20Corporativo%20Ninja%20Food")
                        }
                      >
                        Contactar ventas
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancelar suscripción"
        description="Conservás el acceso hasta el final del período ya pagado. Después, la cuenta pasa a modo lectura. ¿Confirmás?"
        confirmLabel="Sí, cancelar"
        cancelLabel="No, mantener"
        danger
        loading={cancel.isPending}
        onConfirm={() => onCancel()}
      />
    </div>
  );
}
