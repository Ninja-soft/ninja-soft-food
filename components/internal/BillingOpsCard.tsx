"use client";

import { useState } from "react";
import {
  CalendarPlus,
  Copy,
  CreditCard,
  ExternalLink,
  Gift,
  Infinity as InfinityIcon,
  Link2,
  Receipt,
  Sparkles,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Heading } from "@/components/ui/Typography";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { SpinnerBlock } from "@/components/ui/Spinner";
import { StatusBadge } from "@/components/internal/StatusBadge";
import { useInternalPlans } from "@/modules/internal/hooks";
import {
  useBillingActions,
  useBillingDetail,
} from "@/modules/internal-billing/hooks";
import { formatDate, formatMoney } from "@/lib/utils/format";

const BILLING_MODE_LABELS: Record<string, string> = {
  automatic: "Automático (MP)",
  manual: "Manual (transferencia)",
  comp: "Cortesía",
};

const METHOD_LABELS: Record<string, string> = {
  transfer: "Transferencia",
  cash: "Efectivo",
  other: "Otro",
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function BillingOpsCard({
  tenantId,
  tenantName,
}: {
  tenantId: string;
  tenantName: string;
}) {
  const { toast } = useToast();
  const { data: detail, isLoading } = useBillingDetail(tenantId);
  const { data: plans } = useInternalPlans();
  const actions = useBillingActions(tenantId);

  const [planValue, setPlanValue] = useState("");
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [courtesyOpen, setCourtesyOpen] = useState(false);
  const [lifetimeOpen, setLifetimeOpen] = useState(false);
  const [extendOpen, setExtendOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkResult, setLinkResult] = useState<string | null>(null);

  function ok(title: string) {
    toast({ title, variant: "success" });
  }
  function fail(title: string, e: unknown) {
    toast({
      title,
      description: e instanceof Error ? e.message : undefined,
      variant: "error",
    });
  }

  if (isLoading) {
    return (
      <Card className="mt-3">
        <CardContent className="p-5">
          <SpinnerBlock />
        </CardContent>
      </Card>
    );
  }

  const sub = detail?.subscription ?? null;
  if (!sub) {
    return (
      <Card className="mt-3">
        <CardContent className="p-5">
          <p className="text-sm text-muted-foreground">
            Este negocio no tiene suscripción registrada.
          </p>
        </CardContent>
      </Card>
    );
  }

  const activePlans = (plans ?? []).filter((p) => p.isActive);

  function onChangePlan() {
    if (!planValue) return;
    actions.changePlan.mutate(planValue, {
      onSuccess: () => {
        ok("Plan actualizado");
        setPlanValue("");
      },
      onError: (e) => fail("No se pudo cambiar el plan", e),
    });
  }

  function onPaymentLink() {
    actions.paymentLink.mutate(
      { planId: planValue || undefined },
      {
        onSuccess: (res) => {
          setLinkResult(res.init_point);
          ok("Link de pago generado");
        },
        onError: (e) => fail("No se pudo generar el link", e),
      },
    );
  }

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      ok("Link copiado");
    } catch {
      toast({ title: "No se pudo copiar", variant: "error" });
    }
  }

  return (
    <>
      <Card className="mt-3">
        <CardContent className="space-y-5 p-5">
          {/* Estado de cobro */}
          <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
            <Row
              label="Plan"
              value={`${sub.planName ?? "—"}${
                sub.monthlyPriceArs
                  ? ` · ${formatMoney(sub.monthlyPriceArs)}/mes`
                  : ""
              }`}
            />
            <Row
              label="Estado"
              valueNode={<StatusBadge status={sub.status} />}
            />
            <Row
              label="Modo de cobro"
              value={BILLING_MODE_LABELS[sub.billingMode] ?? sub.billingMode}
            />
            <Row
              label="Vitalicio"
              valueNode={
                sub.isLifetime ? (
                  <span className="inline-flex items-center gap-1 text-emerald-300">
                    <InfinityIcon size={14} /> Sí
                  </span>
                ) : (
                  <span className="text-muted-foreground">No</span>
                )
              }
            />
            <Row
              label="Período hasta"
              value={
                sub.isLifetime
                  ? "Sin vencimiento"
                  : sub.currentPeriodEnd
                    ? formatDate(sub.currentPeriodEnd)
                    : "—"
              }
            />
            <Row label="Pasarela" value={sub.provider} mono />
          </dl>

          {/* Cambiar plan */}
          <div className="border-t border-border pt-5">
            <label className="mb-2 block text-sm font-medium text-muted-foreground">
              Cambiar plan
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={planValue}
                onChange={(e) => setPlanValue(e.target.value)}
                className="h-11 rounded-lg border border-input bg-background px-4 text-sm text-foreground outline-none focus:border-primary"
              >
                <option value="">Seleccionar plan…</option>
                {activePlans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.key === sub.planKey ? " (actual)" : ""}
                  </option>
                ))}
              </select>
              <Button
                variant="secondary"
                disabled={
                  !planValue ||
                  planValue === sub.planId ||
                  actions.changePlan.isPending
                }
                onClick={onChangePlan}
              >
                Aplicar plan
              </Button>
            </div>
          </div>

          {/* Acciones de cobro */}
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-5">
            <Button variant="secondary" onClick={() => setPaymentOpen(true)}>
              <Receipt size={16} /> Registrar pago manual
            </Button>
            <Button variant="secondary" onClick={() => setLinkOpen(true)}>
              <Link2 size={16} /> Generar link de pago
            </Button>
            <Button variant="secondary" onClick={() => setExtendOpen(true)}>
              <CalendarPlus size={16} /> Extender suscripción
            </Button>
            <Button variant="secondary" onClick={() => setCourtesyOpen(true)}>
              <Gift size={16} /> Dar cortesía
            </Button>
            <Button variant="secondary" onClick={() => setLifetimeOpen(true)}>
              <InfinityIcon size={16} /> Acceso vitalicio
            </Button>
          </div>

          {/* Add-on IA */}
          <div className="flex flex-wrap items-center gap-3 border-t border-border pt-5">
            <div className="flex items-center gap-2 text-sm">
              <Sparkles size={16} className="text-primary" />
              <span className="font-medium text-foreground">Add-on IA</span>
              {detail?.aiAddon ? (
                <span className="inline-flex items-center rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-300">
                  Activo · {detail.aiAddon.source}
                </span>
              ) : (
                <span className="text-muted-foreground">No contratado</span>
              )}
            </div>
            {detail?.aiAddon ? (
              <Button
                variant="ghost"
                disabled={actions.setAddon.isPending}
                onClick={() =>
                  actions.setAddon.mutate("cancel", {
                    onSuccess: () => ok("Add-on IA cancelado"),
                    onError: (e) => fail("No se pudo cancelar", e),
                  })
                }
              >
                Cancelar IA
              </Button>
            ) : (
              <Button
                variant="secondary"
                disabled={actions.setAddon.isPending}
                onClick={() =>
                  actions.setAddon.mutate("grant", {
                    onSuccess: () => ok("Add-on IA otorgado"),
                    onError: (e) => fail("No se pudo otorgar", e),
                  })
                }
              >
                <Sparkles size={15} /> Otorgar IA
              </Button>
            )}
          </div>

          {/* Historial de pagos manuales */}
          {detail && detail.manualPayments.length > 0 && (
            <div className="border-t border-border pt-5">
              <Heading as="h3" className="mb-3 text-sm">
                Pagos manuales registrados
              </Heading>
              <ul className="space-y-2">
                {detail.manualPayments.map((p) => (
                  <li
                    key={p.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm"
                  >
                    <span className="flex items-center gap-2">
                      <CreditCard size={14} className="text-muted-foreground" />
                      <span className="font-medium text-foreground">
                        {p.currency} {formatMoney(p.amount)}
                      </span>
                      <span className="text-muted-foreground">
                        · {METHOD_LABELS[p.method] ?? p.method} ·{" "}
                        {p.periodMonths} mes(es)
                      </span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(p.paidAt)}
                      {p.reference ? ` · ${p.reference}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <ManualPaymentModal
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
        pending={actions.manualPayment.isPending}
        onSubmit={(input) =>
          actions.manualPayment.mutate(input, {
            onSuccess: () => {
              ok("Pago registrado y suscripción activada");
              setPaymentOpen(false);
            },
            onError: (e) => fail("No se pudo registrar el pago", e),
          })
        }
      />

      <PaymentLinkModal
        open={linkOpen}
        onOpenChange={(o) => {
          setLinkOpen(o);
          if (!o) setLinkResult(null);
        }}
        pending={actions.paymentLink.isPending}
        result={linkResult}
        onGenerate={onPaymentLink}
        onCopy={copyLink}
      />

      <ExtendModal
        open={extendOpen}
        onOpenChange={setExtendOpen}
        pending={actions.extendSubscription.isPending}
        onSubmit={(vars) =>
          actions.extendSubscription.mutate(vars, {
            onSuccess: () => {
              ok("Suscripción extendida");
              setExtendOpen(false);
            },
            onError: (e) => fail("No se pudo extender", e),
          })
        }
      />

      <CourtesyModal
        open={courtesyOpen}
        onOpenChange={setCourtesyOpen}
        pending={actions.grantCourtesy.isPending}
        onSubmit={(months) =>
          actions.grantCourtesy.mutate(months, {
            onSuccess: () => {
              ok("Cortesía otorgada");
              setCourtesyOpen(false);
            },
            onError: (e) => fail("No se pudo otorgar la cortesía", e),
          })
        }
      />

      <ConfirmDialog
        open={lifetimeOpen}
        onOpenChange={setLifetimeOpen}
        title="Acceso vitalicio"
        description={`Otorgar acceso vitalicio sin cobro a ${tenantName}. La suscripción nunca vence y queda fuera de la facturación y de la reconciliación con Mercado Pago. Es una acción excepcional. Queda registrada en auditoría.`}
        confirmLabel="Otorgar vitalicio"
        danger
        loading={actions.grantLifetime.isPending}
        onConfirm={() =>
          actions.grantLifetime.mutate(undefined, {
            onSuccess: () => {
              ok("Acceso vitalicio otorgado");
              setLifetimeOpen(false);
            },
            onError: (e) => fail("No se pudo otorgar", e),
          })
        }
      />
    </>
  );
}

// ── Sub-modales ───────────────────────────────────────────────────────────────

function ManualPaymentModal({
  open,
  onOpenChange,
  pending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  pending: boolean;
  onSubmit: (input: {
    amount: number;
    currency: string;
    method: string;
    reference?: string;
    paidAt: string;
    periodMonths: number;
    notes?: string;
  }) => void;
}) {
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("ARS");
  const [method, setMethod] = useState("transfer");
  const [reference, setReference] = useState("");
  const [paidAt, setPaidAt] = useState(todayIso());
  const [months, setMonths] = useState("1");
  const [notes, setNotes] = useState("");

  const canSubmit = Number(amount) > 0 && paidAt && Number(months) >= 1;

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Registrar pago manual"
      description="Transferencia o efectivo. Activa la suscripción y extiende el período por los meses que cubre."
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Monto"
            type="number"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <div>
            <label className="mb-2 block text-sm font-medium text-muted-foreground">
              Moneda
            </label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="h-11 w-full rounded-lg border border-input bg-background px-4 text-sm text-foreground outline-none focus:border-primary"
            >
              <option value="ARS">ARS</option>
              <option value="USD">USD</option>
              <option value="MXN">MXN</option>
              <option value="CLP">CLP</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-2 block text-sm font-medium text-muted-foreground">
              Método
            </label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="h-11 w-full rounded-lg border border-input bg-background px-4 text-sm text-foreground outline-none focus:border-primary"
            >
              <option value="transfer">Transferencia</option>
              <option value="cash">Efectivo</option>
              <option value="other">Otro</option>
            </select>
          </div>
          <Input
            label="Meses que cubre"
            type="number"
            min={1}
            value={months}
            onChange={(e) => setMonths(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Fecha de pago"
            type="date"
            value={paidAt}
            onChange={(e) => setPaidAt(e.target.value)}
          />
          <Input
            label="Referencia"
            value={reference}
            placeholder="Nro de comprobante"
            onChange={(e) => setReference(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-muted-foreground">
            Notas
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            loading={pending}
            disabled={!canSubmit}
            onClick={() =>
              onSubmit({
                amount: Number(amount),
                currency,
                method,
                reference: reference.trim() || undefined,
                paidAt,
                periodMonths: Number(months),
                notes: notes.trim() || undefined,
              })
            }
          >
            Registrar pago
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function PaymentLinkModal({
  open,
  onOpenChange,
  pending,
  result,
  onGenerate,
  onCopy,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  pending: boolean;
  result: string | null;
  onGenerate: () => void;
  onCopy: (url: string) => void;
}) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Generar link de pago"
      description="Crea un preapproval de Mercado Pago a nombre del dueño del negocio, con la moneda de su perfil. Pasá el link al cliente. El cobro lo confirma el webhook, nunca el redirect."
    >
      <div className="space-y-4">
        {!result ? (
          <Button loading={pending} onClick={onGenerate}>
            <Link2 size={16} /> Generar link
          </Button>
        ) : (
          <div className="space-y-3">
            <p className="break-all rounded-lg border border-border bg-muted/40 px-3 py-2 font-mono text-xs text-muted-foreground">
              {result}
            </p>
            <div className="flex flex-wrap gap-2">
              <a
                href={result}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm font-medium text-primary transition hover:bg-primary/20"
              >
                <ExternalLink size={14} /> Abrir
              </a>
              <button
                onClick={() => onCopy(result)}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground"
              >
                <Copy size={14} /> Copiar link
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function ExtendModal({
  open,
  onOpenChange,
  pending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  pending: boolean;
  onSubmit: (vars: { days?: number; months?: number }) => void;
}) {
  const [months, setMonths] = useState("0");
  const [days, setDays] = useState("0");
  const canSubmit = Number(months) > 0 || Number(days) > 0;

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Extender suscripción"
      description="Suma tiempo al fin del período actual sin cambiar el estado ni el modo de cobro. Sirve para cualquier estado."
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Meses"
            type="number"
            min={0}
            value={months}
            onChange={(e) => setMonths(e.target.value)}
          />
          <Input
            label="Días"
            type="number"
            min={0}
            value={days}
            onChange={(e) => setDays(e.target.value)}
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            loading={pending}
            disabled={!canSubmit}
            onClick={() =>
              onSubmit({
                months: Number(months) || undefined,
                days: Number(days) || undefined,
              })
            }
          >
            Extender
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function CourtesyModal({
  open,
  onOpenChange,
  pending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  pending: boolean;
  onSubmit: (months: number) => void;
}) {
  const [months, setMonths] = useState("3");
  const canSubmit = Number(months) >= 1;

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Dar cortesía"
      description="Acceso sin cobro por la cantidad de meses elegida. Marca la suscripción como cortesía y la deja fuera de la reconciliación con Mercado Pago hasta su vencimiento."
    >
      <div className="space-y-4">
        <Input
          label="Meses de cortesía"
          type="number"
          min={1}
          value={months}
          onChange={(e) => setMonths(e.target.value)}
        />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            loading={pending}
            disabled={!canSubmit}
            onClick={() => onSubmit(Number(months))}
          >
            Otorgar cortesía
          </Button>
        </div>
      </div>
    </Modal>
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
      <dd
        className={
          mono
            ? "text-right font-mono text-xs text-foreground"
            : "text-right font-medium text-foreground"
        }
      >
        {valueNode ?? value}
      </dd>
    </div>
  );
}
