import { createClient } from "@/lib/supabase/client";
import { getTenantId } from "@/lib/utils/tenant";

// =============================================================================
// modules/api-keys/api.ts — gestión de credenciales de la API pública y de los
// webhooks salientes desde el panel del tenant (RLS normal del tenant).
//
// La migración 0010 (api_keys / outbound_webhooks) ya está aplicada en cloud y
// reflejada en types/database.ts: el cliente está tipado contra esas tablas.
// MigrationPendingError se mantiene por robustez: si un entorno quedara sin
// migrar, los errores de "tabla inexistente" se traducen a ese flag para que la
// UI muestre un empty state en vez de romper.
//
// SEGURIDAD DEL SECRETO:
//   El secreto en claro de una API key se genera en el cliente (crypto.getRandom
//   Values), se muestra UNA sola vez y NUNCA se persiste ni se loguea: a la DB
//   solo va su sha256 (key_hash) y el prefijo visible (key_prefix). El sha256 se
//   calcula con SubtleCrypto (Web Crypto) en el navegador.
// =============================================================================

export const API_SCOPES = [
  "read:productions",
  "read:stock",
  "read:dispatches",
  "read:traces",
] as const;
export type ApiScope = (typeof API_SCOPES)[number];

export const SCOPE_LABELS: Record<ApiScope, string> = {
  "read:productions": "Producciones",
  "read:stock": "Stock y lotes",
  "read:dispatches": "Despachos",
  "read:traces": "Trazas públicas",
};

export const WEBHOOK_EVENTS = [
  "production.completed",
  "dispatch.created",
  "dispatch.voided",
  "stock.entry_created",
  "stock.low",
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export const EVENT_LABELS: Record<WebhookEvent, string> = {
  "production.completed": "Producción completada",
  "dispatch.created": "Despacho creado",
  "dispatch.voided": "Despacho anulado",
  "stock.entry_created": "Ingreso de stock",
  "stock.low": "Stock bajo",
};

/** Estado de una entrega en el outbox (webhook_deliveries). */
export type DeliveryStatus = "pending" | "delivered" | "failed";

export const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  pending: "En cola",
  delivered: "Entregado",
  failed: "Falló",
};

export type WebhookDelivery = {
  id: string;
  webhook_id: string;
  event: string;
  status: DeliveryStatus;
  attempts: number;
  last_status: number | null;
  last_error: string | null;
  created_at: string;
  delivered_at: string | null;
};

export type ApiKey = {
  id: string;
  name: string;
  key_prefix: string;
  scopes: ApiScope[];
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

export type OutboundWebhook = {
  id: string;
  url: string;
  events: WebhookEvent[];
  is_active: boolean;
  last_delivery_at: string | null;
  last_delivery_status: number | null;
  created_at: string;
};

/** Resultado de crear una key: incluye el secreto en claro UNA sola vez. */
export type CreatedApiKey = {
  key: ApiKey;
  /** Secreto completo nf_live_... — mostrar una vez, jamás vuelve a estar. */
  secret: string;
};

/** Resultado de crear un webhook: incluye el secret de firma una sola vez. */
export type CreatedWebhook = {
  webhook: OutboundWebhook;
  secret: string;
};

export class MigrationPendingError extends Error {
  constructor() {
    super("migration_pending");
    this.name = "MigrationPendingError";
  }
}

type PgError = { message?: string; code?: string } | null;

function isMigrationPending(error: PgError): boolean {
  if (!error) return false;
  const code = error.code ?? "";
  const msg = error.message ?? "";
  return (
    code === "PGRST205" ||
    code === "42P01" ||
    msg.includes("api_keys") ||
    msg.includes("outbound_webhooks")
  );
}

// ── Generación de secreto + hash (Web Crypto, todo en el navegador) ──────────

const KEY_BODY_LENGTH = 40; // chars base62 tras el prefijo nf_live_
const BASE62 =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** Genera un secreto nf_live_<40 chars base62> con crypto.getRandomValues. */
export function generateApiSecret(): string {
  const bytes = new Uint8Array(KEY_BODY_LENGTH);
  crypto.getRandomValues(bytes);
  let body = "";
  for (let i = 0; i < KEY_BODY_LENGTH; i++) {
    body += BASE62[bytes[i] % BASE62.length];
  }
  return `nf_live_${body}`;
}

/** Genera un secret de firma de webhook (whsec_<48 chars>). */
export function generateWebhookSecret(): string {
  const bytes = new Uint8Array(48);
  crypto.getRandomValues(bytes);
  let body = "";
  for (let i = 0; i < bytes.length; i++) {
    body += BASE62[bytes[i] % BASE62.length];
  }
  return `whsec_${body}`;
}

/** sha256 hex (64 chars) de un string vía SubtleCrypto (navegador). */
export async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const KEY_SELECT =
  "id, name, key_prefix, scopes, last_used_at, revoked_at, created_at";
const WEBHOOK_SELECT =
  "id, url, events, is_active, last_delivery_at, last_delivery_status, created_at";

// ── API keys ─────────────────────────────────────────────────────────────────

export async function listApiKeys(): Promise<ApiKey[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("api_keys")
    .select(KEY_SELECT)
    .order("created_at", { ascending: false });
  if (error) {
    if (isMigrationPending(error)) throw new MigrationPendingError();
    throw error;
  }
  // Row.scopes es string[]; el dominio lo estrecha a ApiScope[].
  return (data ?? []) as unknown as ApiKey[];
}

export async function createApiKey(input: {
  name: string;
  scopes: ApiScope[];
}): Promise<CreatedApiKey> {
  const supabase = createClient();
  const tenant_id = await getTenantId();
  const secret = generateApiSecret();
  const key_hash = await sha256Hex(secret);
  const key_prefix = secret.slice(0, 12); // "nf_live_" + 4 chars

  const { data, error } = await supabase
    .from("api_keys")
    .insert({
      tenant_id,
      name: input.name,
      key_hash,
      key_prefix,
      scopes: input.scopes,
    })
    .select(KEY_SELECT)
    .single();
  if (error) {
    if (isMigrationPending(error)) throw new MigrationPendingError();
    throw error;
  }
  // El secreto en claro vuelve UNA sola vez; no se persiste en ningún lado.
  return { key: data as unknown as ApiKey, secret };
}

export async function revokeApiKey(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    if (isMigrationPending(error)) throw new MigrationPendingError();
    throw error;
  }
}

// ── Outbound webhooks ─────────────────────────────────────────────────────────

export async function listWebhooks(): Promise<OutboundWebhook[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("outbound_webhooks")
    .select(WEBHOOK_SELECT)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) {
    if (isMigrationPending(error)) throw new MigrationPendingError();
    throw error;
  }
  // Row.events es string[]; el dominio lo estrecha a WebhookEvent[].
  return (data ?? []) as unknown as OutboundWebhook[];
}

export async function createWebhook(input: {
  url: string;
  events: WebhookEvent[];
}): Promise<CreatedWebhook> {
  const supabase = createClient();
  const tenant_id = await getTenantId();
  const secret = generateWebhookSecret();

  const { data, error } = await supabase
    .from("outbound_webhooks")
    .insert({
      tenant_id,
      url: input.url,
      events: input.events,
      secret,
      is_active: true,
    })
    .select(WEBHOOK_SELECT)
    .single();
  if (error) {
    if (isMigrationPending(error)) throw new MigrationPendingError();
    throw error;
  }
  // El secret de firma vuelve UNA sola vez (el receptor lo necesita para
  // verificar la cabecera X-NinjaFood-Signature).
  return { webhook: data as unknown as OutboundWebhook, secret };
}

export async function setWebhookActive(
  id: string,
  isActive: boolean,
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("outbound_webhooks")
    .update({ is_active: isActive })
    .eq("id", id);
  if (error) {
    if (isMigrationPending(error)) throw new MigrationPendingError();
    throw error;
  }
}

export async function deleteWebhook(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("outbound_webhooks")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    if (isMigrationPending(error)) throw new MigrationPendingError();
    throw error;
  }
}

// ── Entregas (outbox webhook_deliveries) ──────────────────────────────────────

const DELIVERY_SELECT =
  "id, webhook_id, event, status, attempts, last_status, last_error, created_at, delivered_at";

/**
 * Últimas entregas del tenant (transparencia: estado/errores de los webhooks).
 * RLS: tenant_read. La tabla la escribe el cron con service_role; el tenant solo
 * lee. Si la migración 0023 todavía no está aplicada, traduce a MigrationPending.
 */
export async function listWebhookDeliveries(
  limit = 25,
): Promise<WebhookDelivery[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("webhook_deliveries")
    .select(DELIVERY_SELECT)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    if (isMigrationPending(error) || error.message.includes("webhook_deliveries"))
      throw new MigrationPendingError();
    throw error;
  }
  return (data ?? []) as unknown as WebhookDelivery[];
}
