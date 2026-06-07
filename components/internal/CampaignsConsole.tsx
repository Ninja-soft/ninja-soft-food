"use client";

import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Filter,
  Megaphone,
  Plus,
  Send,
  Users,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownLabel,
  DropdownTrigger,
} from "@/components/ui/Dropdown";
import { buildEmailLayout, renderTemplateHtml } from "@/lib/emails/templates";
import {
  type AudienceFilter,
  type BillingMode,
  type SubscriptionStatus,
  BILLING_MODE_LABELS,
  BILLING_MODES,
  CAMPAIGN_VARIABLES,
  EMPTY_FILTER,
  MAX_RECIPIENTS,
  STATUS_LABELS,
  SUBSCRIPTION_STATUSES,
  checkTypography,
  interpolateCampaign,
  typographyMessage,
} from "@/modules/internal-campaigns/schemas";
import {
  type AudienceResult,
  usePreviewAudience,
  useSendCampaign,
} from "@/modules/internal-campaigns/hooks";
import { cn } from "@/lib/utils/cn";

// =============================================================================
// CampaignsConsole — campañas de email a suscriptores desde el panel staff.
//
// Tres bloques: filtros de audiencia combinables + preview (dry-run), composicion
// (asunto + cuerpo con guard regla 6 + variables {{tenant_name}}/{{owner_name}} +
// vista previa en iframe sandbox), y envio (prueba al staff o batch real con
// confirmacion fuerte). El boton "Enviar campaña" se habilita SOLO con un preview
// fresco; cualquier cambio de filtro o de composicion lo invalida. Tokens del
// design system only.
// =============================================================================

export interface CampaignsConsoleProps {
  plans: { key: string; name: string }[];
  countries: string[];
  smtpReady: boolean;
}

const PLAN_PREVIEW = { tenantName: "La Jamonera", ownerName: "Lucas" };

export function CampaignsConsole({
  plans,
  countries,
  smtpReady,
}: CampaignsConsoleProps) {
  const { toast } = useToast();
  const preview = usePreviewAudience();
  const send = useSendCampaign();

  // ── Filtros ────────────────────────────────────────────────────────────────
  const [filter, setFilter] = useState<AudienceFilter>(EMPTY_FILTER);
  // Audiencia del ultimo preview FRESCO. Se invalida (null) ante cualquier cambio
  // de filtro o composicion: sin preview fresco, no se puede enviar.
  const [audience, setAudience] = useState<AudienceResult | null>(null);

  function invalidatePreview() {
    setAudience(null);
  }

  function toggle<T extends string>(list: T[], value: T): T[] {
    return list.includes(value)
      ? list.filter((v) => v !== value)
      : [...list, value];
  }
  function updateFilter(patch: Partial<AudienceFilter>) {
    setFilter((f) => ({ ...f, ...patch }));
    invalidatePreview();
  }

  function onPreview() {
    preview.mutate(filter, {
      onSuccess: (res) => {
        setAudience(res);
        toast({
          title: `Audiencia: ${res.total} negocio${res.total === 1 ? "" : "s"}`,
          variant: "success",
        });
      },
      onError: (e) =>
        toast({
          title: "No se pudo calcular la audiencia",
          description: e instanceof Error ? e.message : undefined,
          variant: "error",
        }),
    });
  }

  // ── Composicion ──────────────────────────────────────────────────────────────
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [activeField, setActiveField] = useState<"subject" | "body">("body");

  function insertVar(name: string) {
    const token = `{{${name}}}`;
    const isSubject = activeField === "subject";
    const el = isSubject ? subjectRef.current : bodyRef.current;
    const cur = isSubject ? subject : body;
    const setter = isSubject ? setSubject : setBody;
    const start = el?.selectionStart ?? cur.length;
    const end = el?.selectionEnd ?? cur.length;
    setter(cur.slice(0, start) + token + cur.slice(end));
    invalidatePreview();
    requestAnimationFrame(() => {
      if (el) {
        const pos = start + token.length;
        el.focus();
        el.setSelectionRange(pos, pos);
      }
    });
  }

  const typoIssues = useMemo(
    () => [
      ...checkTypography(subject, "subject"),
      ...checkTypography(body, "body"),
    ],
    [subject, body],
  );

  // Vista previa con un destinatario de ejemplo (interpola las variables).
  const previewSubject = interpolateCampaign(subject, PLAN_PREVIEW);
  const previewHtml = useMemo(
    () =>
      buildEmailLayout(
        renderTemplateHtml(interpolateCampaign(body, PLAN_PREVIEW), {}),
        { negocio: "Ninja Food" },
      ),
    [body],
  );

  const composeReady =
    subject.trim().length > 0 &&
    body.trim().length > 0 &&
    typoIssues.length === 0;

  // Envio habilitado SOLO con preview fresco, audiencia no vacia, dentro del tope.
  const total = audience?.total ?? 0;
  const overLimit = total > MAX_RECIPIENTS;
  const canSend =
    smtpReady &&
    composeReady &&
    audience !== null &&
    total > 0 &&
    !overLimit;

  // ── Envio de prueba ──────────────────────────────────────────────────────────
  function onTest() {
    if (typoIssues.length > 0) {
      toast({ title: typographyMessage(typoIssues[0]!), variant: "error" });
      return;
    }
    send.mutate(
      { filter, subject, html: body, test: true },
      {
        onSuccess: (r) =>
          toast({
            title: "Prueba enviada",
            description: r.to ? `Enviada a ${r.to}` : undefined,
            variant: "success",
          }),
        onError: (e) =>
          toast({
            title: "No se pudo enviar la prueba",
            description:
              e instanceof Error ? e.message : "Revisá la configuración SMTP.",
            variant: "error",
          }),
      },
    );
  }

  // ── Envio real (confirmacion fuerte) ──────────────────────────────────────────
  const [confirmOpen, setConfirmOpen] = useState(false);

  function onSendReal() {
    if (!audience) return;
    send.mutate(
      { filter, subject, html: body, confirmCount: audience.total },
      {
        onSuccess: (r) => {
          setConfirmOpen(false);
          invalidatePreview(); // exigir un preview nuevo para otra campaña
          toast({
            title: "Campaña enviada",
            description: `Enviados ${r.sent ?? 0} · fallidos ${r.failed ?? 0} de ${r.total ?? 0}`,
            variant: (r.failed ?? 0) > 0 ? "info" : "success",
          });
        },
        onError: (e) => {
          setConfirmOpen(false);
          invalidatePreview();
          toast({
            title: "No se pudo enviar la campaña",
            description: e instanceof Error ? e.message : undefined,
            variant: "error",
          });
        },
      },
    );
  }

  return (
    <div className="space-y-6">
      {/* Filtros de audiencia */}
      <Card className="bg-card shadow-soft backdrop-blur-xl">
        <CardContent className="space-y-4 p-5">
          <div className="flex items-center gap-2 font-semibold text-foreground">
            <Filter size={16} className="text-primary" /> Audiencia
          </div>
          <p className="text-xs text-muted-foreground">
            Combiná filtros para segmentar a quién le llega la campaña. Sin filtro
            en un criterio = todos. Cada negocio recibe un solo email, dirigido a
            su dueño.
          </p>

          <FilterGroup label="Estado de suscripción">
            {SUBSCRIPTION_STATUSES.map((s) => (
              <Chip
                key={s}
                active={filter.statuses.includes(s)}
                onClick={() =>
                  updateFilter({ statuses: toggle(filter.statuses, s) })
                }
              >
                {STATUS_LABELS[s]}
              </Chip>
            ))}
          </FilterGroup>

          {plans.length > 0 && (
            <FilterGroup label="Plan">
              {plans.map((p) => (
                <Chip
                  key={p.key}
                  active={filter.planKeys.includes(p.key)}
                  onClick={() =>
                    updateFilter({ planKeys: toggle(filter.planKeys, p.key) })
                  }
                >
                  {p.name}
                </Chip>
              ))}
            </FilterGroup>
          )}

          <FilterGroup label="Modo de cobro">
            {BILLING_MODES.map((m) => (
              <Chip
                key={m}
                active={filter.billingModes.includes(m)}
                onClick={() =>
                  updateFilter({
                    billingModes: toggle(filter.billingModes, m),
                  })
                }
              >
                {BILLING_MODE_LABELS[m as BillingMode]}
              </Chip>
            ))}
          </FilterGroup>

          {countries.length > 0 && (
            <FilterGroup label="País">
              {countries.map((c) => (
                <Chip
                  key={c}
                  active={filter.countries.includes(c)}
                  onClick={() =>
                    updateFilter({ countries: toggle(filter.countries, c) })
                  }
                >
                  {c}
                </Chip>
              ))}
            </FilterGroup>
          )}

          <div className="flex justify-end">
            <Button onClick={onPreview} loading={preview.isPending}>
              <Users size={16} /> Previsualizar audiencia
            </Button>
          </div>

          {/* Preview de la audiencia */}
          {audience && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">
                  {audience.total} negocio{audience.total === 1 ? "" : "s"} en la
                  audiencia
                </span>
                {overLimit && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-destructive/30 bg-destructive/10 px-2.5 py-0.5 text-xs font-semibold text-destructive">
                    <AlertTriangle size={13} /> Supera el máximo de{" "}
                    {MAX_RECIPIENTS}
                  </span>
                )}
              </div>
              <div className="max-h-72 overflow-auto rounded-ninjaMd border border-border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted text-left text-xs uppercase tracking-[0.12em] text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">Negocio</th>
                      <th className="px-3 py-2">Dueño</th>
                      <th className="px-3 py-2">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border text-foreground">
                    {audience.members.length === 0 && (
                      <tr>
                        <td
                          colSpan={3}
                          className="px-3 py-8 text-center text-muted-foreground"
                        >
                          Ningún negocio coincide con estos filtros.
                        </td>
                      </tr>
                    )}
                    {audience.members.map((m) => (
                      <tr key={m.tenantId} className="hover:bg-muted/40">
                        <td className="px-3 py-2 font-medium">{m.tenantName}</td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {m.ownerEmail}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {STATUS_LABELS[m.status as SubscriptionStatus] ??
                            m.status}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Composicion */}
      <Card className="bg-card shadow-soft backdrop-blur-xl">
        <CardContent className="space-y-5 p-5">
          <div className="flex items-center gap-2 font-semibold text-foreground">
            <Megaphone size={16} className="text-primary" /> Mensaje
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Sin emojis, sin guiones largos. Separador punto medio (·). El header
              con logo y el footer los agrega Ninja Food.
            </p>
            <Dropdown>
              <DropdownTrigger asChild>
                <Button variant="secondary" size="sm">
                  <Plus size={15} /> Insertar variable
                </Button>
              </DropdownTrigger>
              <DropdownContent align="end" className="w-56">
                <DropdownLabel>
                  En {activeField === "subject" ? "el asunto" : "el contenido"}
                </DropdownLabel>
                {CAMPAIGN_VARIABLES.map((v) => (
                  <DropdownItem key={v} onSelect={() => insertVar(v)}>
                    <code className="text-xs">{`{{${v}}}`}</code>
                  </DropdownItem>
                ))}
              </DropdownContent>
            </Dropdown>
          </div>

          <Input
            ref={subjectRef}
            label="Asunto"
            value={subject}
            onFocus={() => setActiveField("subject")}
            onChange={(e) => {
              setSubject(e.target.value);
              invalidatePreview();
            }}
          />

          <div>
            <label className="mb-2 block text-sm font-medium text-muted-foreground">
              Contenido (HTML del cuerpo, sin el layout)
            </label>
            <textarea
              ref={bodyRef}
              value={body}
              onFocus={() => setActiveField("body")}
              onChange={(e) => {
                setBody(e.target.value);
                invalidatePreview();
              }}
              rows={8}
              className="w-full rounded-ninjaMd border border-input bg-background p-3 font-mono text-xs text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {typoIssues.length > 0 && (
            <div className="flex items-start gap-2.5 rounded-ninjaMd border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <ul className="space-y-1">
                {typoIssues.map((iss, i) => (
                  <li key={i}>{typographyMessage(iss)}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Vista previa */}
          <div>
            <div className="mb-2 text-sm font-medium text-muted-foreground">
              Vista previa (destinatario de ejemplo)
            </div>
            <div className="overflow-hidden rounded-ninjaMd border border-border">
              <div className="border-b border-neutral-200 bg-neutral-50 px-4 py-2 text-xs text-neutral-500">
                Asunto:{" "}
                <span className="text-neutral-800">{previewSubject}</span>
              </div>
              <iframe
                title="Vista previa de la campaña"
                srcDoc={previewHtml}
                className="h-[420px] w-full bg-white"
                sandbox=""
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              variant="secondary"
              onClick={onTest}
              loading={send.isPending && send.variables?.test === true}
              disabled={!smtpReady || !composeReady}
            >
              <Send size={16} /> Enviar prueba
            </Button>
            <Button
              onClick={() => setConfirmOpen(true)}
              disabled={!canSend}
            >
              <Megaphone size={16} /> Enviar campaña
            </Button>
          </div>
          {!smtpReady && (
            <p className="text-right text-xs text-muted-foreground">
              Configurá el SMTP para habilitar el envío.
            </p>
          )}
          {smtpReady && composeReady && !audience && (
            <p className="text-right text-xs text-muted-foreground">
              Previsualizá la audiencia para habilitar el envío.
            </p>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Confirmar envío de campaña"
        description={`Vas a enviar a ${total} negocio${total === 1 ? "" : "s"}. Esta acción no se puede deshacer.`}
        confirmLabel={`Enviar a ${total}`}
        loading={send.isPending && send.variables?.test !== true}
        onConfirm={onSendReal}
      />
    </div>
  );
}

function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-sm transition",
        active
          ? "border-primary/40 bg-primary/15 font-medium text-primary"
          : "border-border bg-muted/30 text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
