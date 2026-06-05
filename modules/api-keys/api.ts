import { createClient } from "@/lib/supabase/client";
import { getTenantId } from "@/lib/utils/tenant";

// =============================================================================
// modules/api-keys/api.ts — gestión de credenciales de la API pública y de los
// webhooks salientes desde el panel del tenant (RLS normal del tenant).
//
// La migración 0010 (api_keys / outbound_webhooks) NO está aplicada en cloud ni
// reflejada en types/database.ts: se usan casts locales (patrón modules/forms/
// api.ts) y los errores de "tabla inexistente" se traducen a MigrationPendingError
// para que la UI muestre un empty state ("Pendiente de migración 0010").
// regenerated after db:types — quitar los casts al regenerar los tipos.
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
  "stock.low",
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export const EVENT_LABELS: Record<WebhookEvent, string> = {
  "production.completed": "Producción completada",
  "dispatch.created": "Despacho creado",
  "stock.low": "Stock bajo",
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

// El cliente está tipado contra types/database.ts (sin estas tablas).
// Casteamos a `any` SOLO para las operaciones de 0010. // regenerated after db:types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function db(): any {
  return createClient();
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
  const { data, error } = await db()
    .from("api_keys")
    .select(KEY_SELECT)
    .order("created_at", { ascending: false });
  if (error) {
    if (isMigrationPending(error)) throw new MigrationPendingError();
    throw error;
  }
  return (data ?? []) as ApiKey[];
}

export async function createApiKey(input: {
  name: string;
  scopes: ApiScope[];
}): Promise<CreatedApiKey> {
  const tenant_id = await getTenantId();
  const secret = generateApiSecret();
  const key_hash = await sha256Hex(secret);
  const key_prefix = secret.slice(0, 12); // "nf_live_" + 4 chars

  const { data, error } = await db()
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
  return { key: data as ApiKey, secret };
}

export async function revokeApiKey(id: string): Promise<void> {
  const { error } = await db()
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
  const { data, error } = await db()
    .from("outbound_webhooks")
    .select(WEBHOOK_SELECT)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) {
    if (isMigrationPending(error)) throw new MigrationPendingError();
    throw error;
  }
  return (data ?? []) as OutboundWebhook[];
}

export async function createWebhook(input: {
  url: string;
  events: WebhookEvent[];
}): Promise<CreatedWebhook> {
  const tenant_id = await getTenantId();
  const secret = generateWebhookSecret();

  const { data, error } = await db()
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
  return { webhook: data as OutboundWebhook, secret };
}

export async function setWebhookActive(
  id: string,
  isActive: boolean,
): Promise<void> {
  const { error } = await db()
    .from("outbound_webhooks")
    .update({ is_active: isActive })
    .eq("id", id);
  if (error) {
    if (isMigrationPending(error)) throw new MigrationPendingError();
    throw error;
  }
}

export async function deleteWebhook(id: string): Promise<void> {
  const { error } = await db()
    .from("outbound_webhooks")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    if (isMigrationPending(error)) throw new MigrationPendingError();
    throw error;
  }
}
