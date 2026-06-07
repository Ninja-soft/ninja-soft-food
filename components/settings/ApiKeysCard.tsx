"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Check,
  Copy,
  KeyRound,
  Plus,
  Send,
  Sparkles,
  Trash2,
  Webhook,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Switch } from "@/components/ui/Switch";
import { useToast } from "@/components/ui/Toast";
import { useMySubscription } from "@/modules/billing/hooks";
import { hasFeature } from "@/lib/billing/limits";
import {
  API_SCOPES,
  DELIVERY_STATUS_LABELS,
  EVENT_LABELS,
  SCOPE_LABELS,
  WEBHOOK_EVENTS,
  type ApiScope,
  type DeliveryStatus,
  type WebhookEvent,
} from "@/modules/api-keys/api";
import { MigrationPendingError } from "@/modules/api-keys/api";
import {
  useApiKeys,
  useCreateApiKey,
  useCreateWebhook,
  useDeleteWebhook,
  useRevokeApiKey,
  useSetWebhookActive,
  useWebhookDeliveries,
  useWebhooks,
} from "@/modules/api-keys/hooks";
import { formatDate } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

// Ajustes → API. Credenciales de la API pública v1 + webhooks salientes.
// Gating por plan (limits.api_access). Si la migración 0010 está pendiente, las
// queries lanzan MigrationPendingError y mostramos un empty state.

function isMigrationPending(error: unknown): boolean {
  return error instanceof MigrationPendingError;
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          toast({ title: "No se pudo copiar", variant: "error" });
        }
      }}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
      {copied ? "Copiado" : label}
    </Button>
  );
}

export function ApiKeysCard({ onUpgrade }: { onUpgrade?: () => void }) {
  const { data: sub, isLoading: subLoading } = useMySubscription();
  const limits = sub?.plan?.limits ?? null;
  const allowed = limits ? hasFeature(limits, "api_access") : false;

  if (subLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-muted-foreground">Cargando…</p>
        </CardContent>
      </Card>
    );
  }

  if (!allowed) {
    return <UpgradeGate onUpgrade={onUpgrade} />;
  }

  return (
    <div className="space-y-6">
      <ApiKeysSection />
      <WebhooksSection />
      <DeliveriesSection />
    </div>
  );
}

// ── Gate de upgrade (plan sin api_access) ─────────────────────────────────────

function UpgradeGate({ onUpgrade }: { onUpgrade?: () => void }) {
  return (
    <Card className="overflow-hidden">
      <div className="relative">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />
        <CardContent className="relative space-y-4 p-6">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Sparkles size={15} className="text-ninja-lime" />
            Función de plan superior
          </div>
          <h3 className="font-display text-2xl font-extrabold tracking-tight">
            API pública e integraciones
          </h3>
          <p className="max-w-prose text-sm text-muted-foreground">
            Conectá Ninja Food con tus sistemas: leé producciones, stock y trazas
            por API, y recibí webhooks firmados cuando algo cambia. Disponible en
            los planes que incluyen acceso a la API.
          </p>
          {onUpgrade && <Button onClick={onUpgrade}>Ver planes</Button>}
        </CardContent>
      </div>
    </Card>
  );
}

// ── Empty state de migración pendiente ────────────────────────────────────────

function MigrationPendingState() {
  return (
    <Card>
      <CardContent className="space-y-2 p-6 text-center">
        <KeyRound size={22} className="mx-auto text-muted-foreground" />
        <p className="text-sm font-medium">API pública en preparación</p>
        <p className="text-sm text-muted-foreground">
          Pendiente de migración 0010. Esta sección se habilita cuando se aplique
          en el servidor.
        </p>
      </CardContent>
    </Card>
  );
}

// ── Sección: API keys ─────────────────────────────────────────────────────────

function ApiKeysSection() {
  const { toast } = useToast();
  const { data: keys, isLoading, error } = useApiKeys();
  const createKey = useCreateApiKey();
  const revokeKey = useRevokeApiKey();

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<ApiScope[]>([...API_SCOPES]);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [revokeId, setRevokeId] = useState<string | null>(null);

  if (isMigrationPending(error)) return <MigrationPendingState />;

  function toggleScope(s: ApiScope) {
    setScopes((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    );
  }

  async function onCreate() {
    if (!name.trim()) {
      toast({ title: "Poné un nombre para la key", variant: "error" });
      return;
    }
    if (scopes.length === 0) {
      toast({ title: "Elegí al menos un permiso", variant: "error" });
      return;
    }
    try {
      const { secret } = await createKey.mutateAsync({
        name: name.trim(),
        scopes,
      });
      setCreateOpen(false);
      setName("");
      setScopes([...API_SCOPES]);
      setNewSecret(secret); // se muestra una sola vez
    } catch (e) {
      toast({
        title: "No se pudo crear la key",
        description: e instanceof Error ? e.message : undefined,
        variant: "error",
      });
    }
  }

  async function onRevoke() {
    if (!revokeId) return;
    try {
      await revokeKey.mutateAsync(revokeId);
      toast({ title: "Key revocada", variant: "success" });
    } catch (e) {
      toast({
        title: "No se pudo revocar",
        description: e instanceof Error ? e.message : undefined,
        variant: "error",
      });
    } finally {
      setRevokeId(null);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-5 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-base font-bold tracking-tight">
              <KeyRound size={17} className="text-primary" />
              API keys
            </h3>
            <p className="text-sm text-muted-foreground">
              Credenciales de lectura para integrar Ninja Food. El secreto se
              muestra una sola vez.
            </p>
          </div>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus size={16} />
            Nueva key
          </Button>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando keys…</p>
        ) : (keys ?? []).length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
            Todavía no creaste ninguna API key.
          </p>
        ) : (
          <ul className="space-y-2">
            {(keys ?? []).map((k) => {
              const revoked = k.revoked_at != null;
              return (
                <li
                  key={k.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 px-4 py-3"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{k.name}</span>
                      <code className="rounded bg-background px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                        {k.key_prefix}…
                      </code>
                      {revoked && (
                        <span className="rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">
                          Revocada
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      {k.scopes.map((s) => (
                        <span
                          key={s}
                          className="rounded-full bg-primary/[0.1] px-2 py-0.5 font-medium text-primary"
                        >
                          {SCOPE_LABELS[s] ?? s}
                        </span>
                      ))}
                      <span className="ml-1">
                        {k.last_used_at
                          ? `Último uso ${formatDate(k.last_used_at)}`
                          : "Sin uso"}
                      </span>
                    </div>
                  </div>
                  {!revoked && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:bg-destructive/10"
                      onClick={() => setRevokeId(k.id)}
                    >
                      Revocar
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>

      {/* Crear key */}
      <Modal
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Nueva API key"
        description="Elegí un nombre y los permisos de lectura."
      >
        <div className="space-y-5">
          <Input
            label="Nombre"
            placeholder="Ej: Integración ERP"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <div className="space-y-2">
            <div className="text-sm font-medium">Permisos</div>
            <div className="grid gap-2 sm:grid-cols-2">
              {API_SCOPES.map((s) => {
                const active = scopes.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleScope(s)}
                    className={cn(
                      "flex items-center justify-between rounded-lg border px-3 py-2.5 text-left text-sm transition",
                      active
                        ? "border-primary bg-primary/[0.08] text-foreground"
                        : "border-border bg-muted/20 text-muted-foreground hover:border-primary/40",
                    )}
                  >
                    {SCOPE_LABELS[s]}
                    {active && <Check size={15} className="text-primary" />}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button loading={createKey.isPending} onClick={onCreate}>
              Crear key
            </Button>
          </div>
        </div>
      </Modal>

      {/* Secreto recién creado (una sola vez) */}
      <Modal
        open={newSecret != null}
        onOpenChange={(o) => {
          if (!o) setNewSecret(null);
        }}
        title="Guardá tu API key ahora"
        description="Este secreto se muestra una sola vez. No lo vas a poder volver a ver."
      >
        <div className="space-y-4">
          <div className="flex items-start gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-300">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            Copialo y guardalo en un lugar seguro. Si lo perdés, tenés que crear
            una key nueva.
          </div>
          <code className="block break-all rounded-lg border border-border bg-background px-4 py-3 font-mono text-sm">
            {newSecret}
          </code>
          <div className="flex justify-end gap-2">
            {newSecret && <CopyButton value={newSecret} label="Copiar key" />}
            <Button onClick={() => setNewSecret(null)}>Ya la guardé</Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={revokeId != null}
        onOpenChange={(o) => {
          if (!o) setRevokeId(null);
        }}
        title="Revocar API key"
        description="La integración que use esta key dejará de funcionar de inmediato. La acción no se puede deshacer."
        confirmLabel="Sí, revocar"
        cancelLabel="No"
        danger
        loading={revokeKey.isPending}
        onConfirm={() => onRevoke()}
      />
    </Card>
  );
}

// ── Sección: webhooks salientes ───────────────────────────────────────────────

function WebhooksSection() {
  const { toast } = useToast();
  const { data: webhooks, isLoading, error } = useWebhooks();
  const createWebhook = useCreateWebhook();
  const setActive = useSetWebhookActive();
  const deleteWebhook = useDeleteWebhook();

  const [createOpen, setCreateOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  if (isMigrationPending(error)) return null; // ya lo cubre la sección de keys

  function toggleEvent(e: WebhookEvent) {
    setEvents((prev) =>
      prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e],
    );
  }

  async function onCreate() {
    if (!/^https:\/\/.+/.test(url.trim())) {
      toast({ title: "La URL debe empezar con https://", variant: "error" });
      return;
    }
    if (events.length === 0) {
      toast({ title: "Elegí al menos un evento", variant: "error" });
      return;
    }
    try {
      const { secret } = await createWebhook.mutateAsync({
        url: url.trim(),
        events,
      });
      setCreateOpen(false);
      setUrl("");
      setEvents([]);
      setNewSecret(secret);
    } catch (e) {
      toast({
        title: "No se pudo crear el webhook",
        description: e instanceof Error ? e.message : undefined,
        variant: "error",
      });
    }
  }

  async function onDelete() {
    if (!deleteId) return;
    try {
      await deleteWebhook.mutateAsync(deleteId);
      toast({ title: "Webhook eliminado", variant: "success" });
    } catch (e) {
      toast({
        title: "No se pudo eliminar",
        description: e instanceof Error ? e.message : undefined,
        variant: "error",
      });
    } finally {
      setDeleteId(null);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-5 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-base font-bold tracking-tight">
              <Webhook size={17} className="text-primary" />
              Webhooks salientes
            </h3>
            <p className="text-sm text-muted-foreground">
              Recibí un POST firmado (HMAC-SHA256) cuando ocurre un evento.
            </p>
          </div>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus size={16} />
            Nuevo webhook
          </Button>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando webhooks…</p>
        ) : (webhooks ?? []).length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
            Todavía no configuraste ningún webhook.
          </p>
        ) : (
          <ul className="space-y-2">
            {(webhooks ?? []).map((w) => (
              <li
                key={w.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 px-4 py-3"
              >
                <div className="min-w-0 space-y-1">
                  <code className="block truncate font-mono text-xs">
                    {w.url}
                  </code>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    {w.events.map((e) => (
                      <span
                        key={e}
                        className="rounded-full bg-primary/[0.1] px-2 py-0.5 font-medium text-primary"
                      >
                        {EVENT_LABELS[e] ?? e}
                      </span>
                    ))}
                    {w.last_delivery_at && (
                      <span className="ml-1">
                        Última entrega {formatDate(w.last_delivery_at)}
                        {w.last_delivery_status
                          ? ` · ${w.last_delivery_status}`
                          : ""}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Switch
                    checked={w.is_active}
                    onCheckedChange={(v) =>
                      setActive.mutate({ id: w.id, isActive: v })
                    }
                    label="Activo"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:bg-destructive/10"
                    onClick={() => setDeleteId(w.id)}
                    aria-label="Eliminar webhook"
                  >
                    <Trash2 size={16} />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      {/* Crear webhook */}
      <Modal
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Nuevo webhook"
        description="A dónde enviamos los eventos y cuáles te interesan."
      >
        <div className="space-y-5">
          <Input
            label="URL (https)"
            placeholder="https://tu-sistema.com/webhooks/ninja"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            autoFocus
          />
          <div className="space-y-2">
            <div className="text-sm font-medium">Eventos</div>
            <div className="grid gap-2">
              {WEBHOOK_EVENTS.map((e) => {
                const active = events.includes(e);
                return (
                  <button
                    key={e}
                    type="button"
                    onClick={() => toggleEvent(e)}
                    className={cn(
                      "flex items-center justify-between rounded-lg border px-3 py-2.5 text-left text-sm transition",
                      active
                        ? "border-primary bg-primary/[0.08] text-foreground"
                        : "border-border bg-muted/20 text-muted-foreground hover:border-primary/40",
                    )}
                  >
                    <span className="flex items-center gap-2">
                      {EVENT_LABELS[e]}
                      <code className="font-mono text-xs text-muted-foreground">
                        {e}
                      </code>
                    </span>
                    {active && <Check size={15} className="text-primary" />}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button loading={createWebhook.isPending} onClick={onCreate}>
              Crear webhook
            </Button>
          </div>
        </div>
      </Modal>

      {/* Secret de firma (una sola vez) */}
      <Modal
        open={newSecret != null}
        onOpenChange={(o) => {
          if (!o) setNewSecret(null);
        }}
        title="Secreto de firma del webhook"
        description="Usalo para verificar la cabecera X-NinjaFood-Signature. Se muestra una sola vez."
      >
        <div className="space-y-4">
          <div className="flex items-start gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-300">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            Guardalo en tu backend. Lo necesitás para validar que el POST viene de
            Ninja Food.
          </div>
          <code className="block break-all rounded-lg border border-border bg-background px-4 py-3 font-mono text-sm">
            {newSecret}
          </code>
          <div className="flex justify-end gap-2">
            {newSecret && <CopyButton value={newSecret} label="Copiar secret" />}
            <Button onClick={() => setNewSecret(null)}>Ya lo guardé</Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteId != null}
        onOpenChange={(o) => {
          if (!o) setDeleteId(null);
        }}
        title="Eliminar webhook"
        description="Dejaremos de enviar eventos a esta URL. ¿Confirmás?"
        confirmLabel="Sí, eliminar"
        cancelLabel="No"
        danger
        loading={deleteWebhook.isPending}
        onConfirm={() => onDelete()}
      />
    </Card>
  );
}

// ── Sección: últimas entregas (outbox webhook_deliveries) ─────────────────────

const DELIVERY_BADGE: Record<DeliveryStatus, string> = {
  pending: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  delivered: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  failed: "border-destructive/30 bg-destructive/10 text-destructive",
};

function DeliveriesSection() {
  const { data: deliveries, isLoading, error } = useWebhookDeliveries();

  if (isMigrationPending(error)) return null; // ya lo cubre la sección de keys

  return (
    <Card>
      <CardContent className="space-y-5 p-6">
        <div>
          <h3 className="flex items-center gap-2 text-base font-bold tracking-tight">
            <Send size={17} className="text-primary" />
            Últimas entregas
          </h3>
          <p className="text-sm text-muted-foreground">
            Eventos enviados a tus webhooks. Se procesan cada pocos minutos, con
            hasta 3 reintentos.
          </p>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando entregas…</p>
        ) : (deliveries ?? []).length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
            Todavía no se envió ningún evento.
          </p>
        ) : (
          <ul className="space-y-2">
            {(deliveries ?? []).map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 px-4 py-3"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="rounded bg-background px-1.5 py-0.5 font-mono text-xs">
                      {EVENT_LABELS[d.event as WebhookEvent] ?? d.event}
                    </code>
                    <span
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                        DELIVERY_BADGE[d.status],
                      )}
                    >
                      {DELIVERY_STATUS_LABELS[d.status]}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatDate(d.delivered_at ?? d.created_at)}
                    {d.attempts > 0 && ` · ${d.attempts} intento${d.attempts === 1 ? "" : "s"}`}
                    {d.last_error && (
                      <span className="text-destructive"> · {d.last_error}</span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
