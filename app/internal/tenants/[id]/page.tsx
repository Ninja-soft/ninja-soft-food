"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CalendarPlus,
  Package,
  Soup,
  Truck,
  Users,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Display, Heading, Money } from "@/components/ui/Typography";
import { SpinnerBlock } from "@/components/ui/Spinner";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { StatusBadge, TENANT_STATUS_LABELS } from "@/components/internal/StatusBadge";
import { useTenantDetail, useTenantActions } from "@/modules/internal/hooks";
import { formatDate, formatMoney } from "@/lib/utils/format";

const INDUSTRY_LABELS: Record<string, string> = {
  frigorifico: "Frigorífico",
  panaderia: "Panadería",
  lacteos: "Lácteos",
  conservas: "Conservas",
  catering: "Catering",
  otro: "Otro",
};

const STATUS_OPTIONS = ["trial", "active", "past_due", "suspended", "cancelled"];

export default function InternalTenantDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { toast } = useToast();
  const { data, isLoading } = useTenantDetail(params.id);
  const actions = useTenantActions(params.id);
  const [extendOpen, setExtendOpen] = useState(false);
  const [statusValue, setStatusValue] = useState("");

  function onExtend() {
    actions.extendTrial.mutate(undefined, {
      onSuccess: () => {
        toast({ title: "Trial extendido +14 días", variant: "success" });
        setExtendOpen(false);
      },
      onError: (e) =>
        toast({
          title: "No se pudo extender",
          description: e instanceof Error ? e.message : undefined,
          variant: "error",
        }),
    });
  }

  function onSetStatus(next: string) {
    actions.setStatus.mutate(next, {
      onSuccess: () => {
        toast({ title: "Estado actualizado", variant: "success" });
        setStatusValue("");
      },
      onError: (e) =>
        toast({
          title: "No se pudo cambiar el estado",
          description: e instanceof Error ? e.message : undefined,
          variant: "error",
        }),
    });
  }

  if (isLoading) {
    return (
      <>
        <BackLink />
        <SpinnerBlock />
      </>
    );
  }

  if (!data) {
    return (
      <>
        <BackLink />
        <p className="mt-8 text-muted-foreground">Negocio no encontrado.</p>
      </>
    );
  }

  const { tenant, subscription, counts } = data;
  const effectiveStatus = subscription?.status ?? tenant.status;

  return (
    <>
      <BackLink />

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Display className="text-3xl md:text-4xl">{tenant.name}</Display>
        <StatusBadge status={effectiveStatus} />
      </div>
      <p className="mt-1.5 text-sm text-muted-foreground">
        {tenant.slug} · {INDUSTRY_LABELS[tenant.industry] ?? tenant.industry} ·{" "}
        {tenant.country}
      </p>

      {/* ── Info + counts ── */}
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <Heading as="h2" className="text-base">
              Información
            </Heading>
            <dl className="mt-3 space-y-2 text-sm">
              <Row label="CUIT" value={tenant.cuit ?? "—"} mono />
              <Row label="Alta" value={formatDate(tenant.createdAt)} />
              <Row
                label="Fin de trial"
                value={tenant.trialEndsAt ? formatDate(tenant.trialEndsAt) : "—"}
              />
            </dl>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardContent className="p-5">
            <Heading as="h2" className="text-base">
              Actividad
            </Heading>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <CountTile
                label="Usuarios"
                value={counts.users}
                icon={<Users size={16} />}
              />
              <CountTile
                label="Recetas"
                value={counts.recipes}
                icon={<Soup size={16} />}
              />
              <CountTile
                label="Producciones (mes)"
                value={counts.productionsThisMonth}
                icon={<Package size={16} />}
              />
              <CountTile
                label="Despachos (mes)"
                value={counts.dispatchesThisMonth}
                icon={<Truck size={16} />}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Suscripción ── */}
      <Heading as="h2" className="mt-8 text-lg">
        Suscripción
      </Heading>
      <Card className="mt-3">
        <CardContent className="p-5">
          {subscription ? (
            <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
              <Row
                label="Plan"
                value={`${subscription.planName ?? "—"}${
                  subscription.monthlyPriceArs
                    ? ` · ${formatMoney(subscription.monthlyPriceArs)}/mes`
                    : ""
                }`}
              />
              <Row
                label="Estado"
                valueNode={<StatusBadge status={subscription.status} />}
              />
              <Row
                label="Ciclo"
                value={
                  subscription.billingCycle === "yearly" ? "Anual" : "Mensual"
                }
              />
              <Row label="Pasarela" value={subscription.provider} mono />
              <Row
                label="Período desde"
                value={
                  subscription.periodStart
                    ? formatDate(subscription.periodStart)
                    : "—"
                }
              />
              <Row
                label="Período hasta"
                value={
                  subscription.periodEnd
                    ? formatDate(subscription.periodEnd)
                    : "—"
                }
              />
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">
              Este negocio no tiene suscripción registrada.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Acciones de staff ── */}
      <Heading as="h2" className="mt-8 text-lg">
        Acciones de staff
      </Heading>
      <Card className="mt-3">
        <CardContent className="space-y-5 p-5">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="secondary"
              onClick={() => setExtendOpen(true)}
              disabled={actions.extendTrial.isPending}
            >
              <CalendarPlus size={16} /> Extender trial +14 días
            </Button>
            <p className="text-xs text-muted-foreground">
              Pasa la suscripción a estado prueba y suma 14 días al período
              vigente.
            </p>
          </div>

          <div className="border-t border-border pt-5">
            <label className="mb-2 block text-sm font-medium text-muted-foreground">
              Cambiar estado
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={statusValue}
                onChange={(e) => setStatusValue(e.target.value)}
                className="h-11 rounded-lg border border-input bg-background px-4 text-sm text-foreground outline-none focus:border-primary"
              >
                <option value="">Seleccionar estado…</option>
                {STATUS_OPTIONS.filter((s) => s !== effectiveStatus).map((s) => (
                  <option key={s} value={s}>
                    {TENANT_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
              <span className="text-xs text-muted-foreground">
                Actual: {TENANT_STATUS_LABELS[effectiveStatus] ?? effectiveStatus}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Confirms ── */}
      <ConfirmDialog
        open={extendOpen}
        onOpenChange={setExtendOpen}
        title="Extender trial"
        description={`Sumar 14 días de prueba a ${tenant.name}. La acción queda registrada en auditoría.`}
        confirmLabel="Extender +14 días"
        loading={actions.extendTrial.isPending}
        onConfirm={onExtend}
      />
      <ConfirmDialog
        open={statusValue !== ""}
        onOpenChange={(o) => !o && setStatusValue("")}
        title="Cambiar estado del negocio"
        description={`Cambiar el estado de ${tenant.name} a "${
          TENANT_STATUS_LABELS[statusValue] ?? statusValue
        }". Sincroniza tenant y suscripción. Queda registrado en auditoría.`}
        confirmLabel="Confirmar cambio"
        danger={statusValue === "suspended" || statusValue === "cancelled"}
        loading={actions.setStatus.isPending}
        onConfirm={() => onSetStatus(statusValue)}
      />
    </>
  );
}

function BackLink() {
  return (
    <Link
      href="/internal/tenants"
      className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground"
    >
      <ArrowLeft size={15} /> Volver a negocios
    </Link>
  );
}

function Row({
  label,
  value,
  valueNode,
  mono,
}: {
  label: string;
  value?: string;
  valueNode?: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium text-foreground">
        {valueNode ?? (mono ? <Money>{value}</Money> : value)}
      </dd>
    </div>
  );
}

function CountTile({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-ninjaMd border border-border bg-muted/40 p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-[11px] uppercase tracking-[0.1em]">{label}</span>
      </div>
      <p className="mt-1 font-price text-2xl font-black tabular-nums text-foreground">
        {value}
      </p>
    </div>
  );
}
