"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  BadgeCheck,
  Check,
  Clock,
  FileText,
  Sparkles,
  Stamp,
  Tags,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import {
  useAddonStatus,
  useCancelAddon,
  useStartAddonCheckout,
} from "@/modules/billing/hooks";
import { deriveAddonCardState } from "@/lib/billing/addons";
import { formatMoney } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

// Asistente IA — card de la sección Suscripción del tenant.
// Estado derivado puro (lib/billing/addons.deriveAddonCardState) desde
// {included, addonActive, pending}. El cobro lo confirma el webhook, NUNCA el
// redirect (regla dura 7): tras volver del checkout con ?addon=pending mostramos
// "Pago en proceso" y refrescamos el estado hasta que el webhook active.

// Qué desbloquea el Asistente IA (lista corta con íconos).
const UNLOCKS: { icon: React.ElementType; label: string }[] = [
  { icon: FileText, label: "Tabla nutricional generada por IA" },
  { icon: Stamp, label: "Octógonos y sellos frontales automáticos" },
  { icon: Tags, label: "Rótulo print-ready (próximamente)" },
];

export function AICard() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const { data: status, isLoading, refetch } = useAddonStatus();
  const checkout = useStartAddonCheckout();
  const cancel = useCancelAddon();

  const [cancelOpen, setCancelOpen] = useState(false);

  // ?addon=pending: el tenant volvió del checkout. Hasta que el webhook confirme
  // (status.addonActive), mostramos "Pago en proceso". Reintenta el fetch unas
  // veces por si el webhook tarda un instante.
  const cameBackPending = searchParams.get("addon") === "pending";
  const [pending, setPending] = useState(cameBackPending);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!pending) return;
    // Si ya está activo o incluido, dejamos de mostrar pending.
    if (status?.addonActive || status?.included) {
      setPending(false);
      return;
    }
    // Poll suave: re-consulta el estado cada 4s mientras esté pendiente.
    pollRef.current = setInterval(() => void refetch(), 4000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [pending, status?.addonActive, status?.included, refetch]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-muted-foreground">Cargando Asistente IA…</p>
        </CardContent>
      </Card>
    );
  }

  const state = deriveAddonCardState({
    included: status?.included ?? false,
    addonActive: status?.addonActive ?? false,
    pending,
  });

  async function onSubscribe() {
    try {
      const { init_point } = await checkout.mutateAsync();
      window.location.href = init_point;
    } catch (e) {
      toast({
        title: "No se pudo iniciar el pago",
        description: e instanceof Error ? e.message : undefined,
        variant: "error",
      });
    }
  }

  async function onCancel() {
    try {
      await cancel.mutateAsync();
      toast({ title: "Asistente IA cancelado", variant: "success" });
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

  const sourceLabel =
    status?.addonSource === "granted"
      ? "Cortesía de Ninja-Soft"
      : status?.addonSource === "purchase"
        ? "Contratado por tu negocio"
        : null;

  return (
    <Card className="overflow-hidden">
      <div className="relative">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />
        <CardContent className="relative space-y-5 p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Sparkles size={15} className="text-primary" />
                Add-on
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="font-display text-2xl font-extrabold tracking-tight">
                  Asistente IA
                </h3>
                <StateBadge state={state} />
              </div>
            </div>

            {state === "available" && status?.price && (
              <div className="text-right">
                <div className="price-hl font-price text-2xl font-bold tabular-nums">
                  {formatMoney(status.price.amount, {
                    currency: status.price.currency,
                  })}
                </div>
                <div className="text-xs text-muted-foreground">por mes</div>
              </div>
            )}
          </div>

          <p className="text-sm text-muted-foreground">
            {status?.description ??
              "Generación asistida de rotulado, octógonos/sellos y tabla nutricional en el formato de tu país."}
          </p>

          {/* Qué desbloquea */}
          <ul className="grid gap-2 sm:grid-cols-3">
            {UNLOCKS.map((u) => {
              const Icon = u.icon;
              return (
                <li
                  key={u.label}
                  className="flex items-start gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2.5 text-sm"
                >
                  <Icon size={16} className="mt-0.5 shrink-0 text-primary" />
                  <span className="text-foreground">{u.label}</span>
                </li>
              );
            })}
          </ul>

          {/* Estado / acciones */}
          {state === "included" && (
            <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/[0.06] px-4 py-3 text-sm text-foreground">
              <BadgeCheck size={16} className="text-primary" />
              Tu plan ya incluye el Asistente IA. No tenés que hacer nada más.
            </div>
          )}

          {state === "active" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-300">
                <Check size={16} />
                Asistente IA activo
                {sourceLabel && (
                  <span className="text-emerald-300/80">· {sourceLabel}</span>
                )}
              </div>
              <div className="flex justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCancelOpen(true)}
                  className="text-destructive hover:bg-destructive/10"
                >
                  Cancelar Asistente IA
                </Button>
              </div>
            </div>
          )}

          {state === "pending" && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-300">
              <Clock size={16} />
              Pago en proceso. En cuanto Mercado Pago confirme el cobro,
              activamos el Asistente IA automáticamente.
            </div>
          )}

          {state === "available" && (
            <div className="flex flex-col gap-2">
              {status?.price ? (
                <Button
                  className="w-full sm:w-auto sm:self-start"
                  loading={checkout.isPending}
                  disabled={checkout.isPending}
                  onClick={onSubscribe}
                >
                  <Sparkles size={15} /> Activar Asistente IA
                </Button>
              ) : (
                <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                  El Asistente IA no está disponible para autocontratación en este
                  momento. Escribinos para activarlo.
                </div>
              )}
            </div>
          )}
        </CardContent>
      </div>

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancelar Asistente IA"
        description="Vas a perder las funciones de IA al cancelar. ¿Confirmás?"
        confirmLabel="Sí, cancelar"
        cancelLabel="No, mantener"
        danger
        loading={cancel.isPending}
        onConfirm={() => onCancel()}
      />
    </Card>
  );
}

function StateBadge({
  state,
}: {
  state: ReturnType<typeof deriveAddonCardState>;
}) {
  const meta: Record<
    ReturnType<typeof deriveAddonCardState>,
    { label: string; className: string }
  > = {
    included: {
      label: "Incluido en tu plan",
      className: "border-primary/30 bg-primary/15 text-primary",
    },
    active: {
      label: "Activo",
      className: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
    },
    pending: {
      label: "Pago en proceso",
      className: "border-amber-400/30 bg-amber-400/10 text-amber-300",
    },
    available: {
      label: "Disponible",
      className: "border-border bg-muted text-muted-foreground",
    },
  };
  const m = meta[state];
  return (
    <span
      className={cn(
        "rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        m.className,
      )}
    >
      {m.label}
    </span>
  );
}
