import { createHash } from "node:crypto";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// =============================================================================
// lib/api/auth.ts — autenticación de la API pública v1 (server-only de hecho).
//
// Sin `import "server-only"` a propósito (mismo criterio que lib/billing/
// mercadopago.ts): los tests unit de vitest importan los helpers puros
// (hashApiSecret / isValidKeyFormat / requireScope / apiError). El módulo es
// server-only igualmente: usa node:crypto y NUNCA debe importarse desde el
// cliente. authenticateApiRequest solo se invoca desde route handlers nodejs.
//
// La API pública v1 entra SIN sesión Supabase: la credencial viaja en
//   Authorization: Bearer nf_live_<secret>
// El secreto en claro JAMÁS se persiste; en la DB vive solo su sha256 hex
// (api_keys.key_hash). Acá calculamos ese hash y resolvemos {tenantId, scopes,
// keyId} contra la RPC verify_api_key (SECURITY DEFINER + grant a anon), usando
// un cliente ANON sin sesión — el mismo patrón con que el POS expone datos por
// slug. El service_role NUNCA participa de la validación (menos superficie de
// credencial privilegiada; el data-access privilegiado se hace después, ya con
// el tenantId resuelto y SIEMPRE filtrando por .eq("tenant_id", tenantId)).
//
// La migración 0010 (api_keys / outbound_webhooks / verify_api_key) todavía NO
// está aplicada en cloud ni reflejada en types/database.ts: por eso el cliente
// anon es genérico (sin tipo Database) y los errores de "función inexistente"
// (PGRST202 / 42883) se tratan como key inválida sin romper.
// regenerated after db:types — tipar la RPC cuando se regeneren los tipos.
// =============================================================================

/** Scopes de lectura concedibles a una API key (alineados con migración 0010). */
export const API_SCOPES = [
  "read:productions",
  "read:stock",
  "read:dispatches",
  "read:traces",
] as const;

export type ApiScope = (typeof API_SCOPES)[number];

/** Formato exigido del secreto: prefijo fijo + >=32 chars base62. */
export const API_KEY_REGEX = /^nf_live_[A-Za-z0-9]{32,}$/;

/** Prefijo público que se guarda en api_keys.key_prefix (para identificar la key). */
export const API_KEY_PREFIX_LENGTH = 12; // "nf_live_" (8) + 4 chars

/** Identidad resuelta de un request autenticado de la API pública. */
export interface ApiAuth {
  tenantId: string;
  scopes: ApiScope[];
  keyId: string;
}

/** Forma uniforme de error de la API pública: { error: { code, message } }. */
export interface ApiErrorBody {
  error: { code: string; message: string };
}

/** sha256 hex (64 chars) de un secreto. Estable y determinístico. */
export function hashApiSecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

/** Deriva el prefijo público visible de un secreto en claro. */
export function deriveKeyPrefix(secret: string): string {
  return secret.slice(0, API_KEY_PREFIX_LENGTH);
}

/** ¿El string tiene el formato de una API key válida? (no valida existencia). */
export function isValidKeyFormat(value: string | null | undefined): boolean {
  return typeof value === "string" && API_KEY_REGEX.test(value);
}

/** Extrae el secreto del header Authorization: Bearer ... (o null). */
function extractBearer(req: Request): string | null {
  const header = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

/** Cliente Supabase anónimo (sin sesión) para llamar a verify_api_key. */
function createAnonClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }
  return createSupabaseClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

type VerifyResult = {
  tenant_id?: string;
  scopes?: unknown;
  key_id?: string;
} | null;

function parseScopes(raw: unknown): ApiScope[] {
  if (!Array.isArray(raw)) return [];
  const allowed = new Set<string>(API_SCOPES);
  return raw.filter(
    (s): s is ApiScope => typeof s === "string" && allowed.has(s),
  );
}

/**
 * Autentica un request de la API pública v1.
 * Devuelve la identidad resuelta o null (formato inválido, key inexistente,
 * revocada, o RPC/migración no disponible). NUNCA lanza por una key inválida.
 */
export async function authenticateApiRequest(
  req: Request,
): Promise<ApiAuth | null> {
  const secret = extractBearer(req);
  if (!isValidKeyFormat(secret) || secret == null) return null;

  const keyHash = hashApiSecret(secret);
  const supabase = createAnonClient();

  // regenerated after db:types — la RPC verify_api_key no está en los tipos aún.
  const { data, error } = await (
    supabase.rpc as unknown as (
      fn: "verify_api_key",
      params: { p_key_hash: string },
    ) => Promise<{ data: VerifyResult; error: { code?: string } | null }>
  )("verify_api_key", { p_key_hash: keyHash });

  // Migración 0010 pendiente / RPC ausente → tratamos como key inválida (401),
  // no rompemos el endpoint.
  if (error) return null;
  if (!data || typeof data.tenant_id !== "string" || !data.tenant_id) {
    return null;
  }

  return {
    tenantId: data.tenant_id,
    scopes: parseScopes(data.scopes),
    keyId: typeof data.key_id === "string" ? data.key_id : "",
  };
}

// ── Helpers de respuesta (shape de error uniforme) ───────────────────────────

const ERROR_STATUS: Record<string, number> = {
  invalid_key: 401,
  missing_scope: 403,
  not_found: 404,
  invalid_request: 400,
};

/** Construye un Response JSON con el shape de error uniforme de la API. */
export function apiError(
  code: keyof typeof ERROR_STATUS,
  message: string,
): Response {
  const body: ApiErrorBody = { error: { code, message } };
  return new Response(JSON.stringify(body), {
    status: ERROR_STATUS[code] ?? 400,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

/** 401 estándar para credencial ausente / mal formada / inexistente. */
export function unauthorized(): Response {
  return apiError(
    "invalid_key",
    "API key ausente, mal formada o inválida. Usá Authorization: Bearer nf_live_...",
  );
}

/**
 * Exige un scope en la identidad autenticada.
 * Devuelve null si lo tiene; un Response 403 (shape uniforme) si no.
 */
export function requireScope(
  auth: ApiAuth,
  scope: ApiScope,
): Response | null {
  if (auth.scopes.includes(scope)) return null;
  return apiError(
    "missing_scope",
    `Esta API key no tiene el scope requerido: ${scope}`,
  );
}

/** Respuesta JSON de éxito con Cache-Control no-store (datos del tenant). */
export function apiJson(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
