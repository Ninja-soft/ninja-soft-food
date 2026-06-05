// Helpers compartidos para los tests de integración RLS (regla dura CLAUDE.md §1).
//
// Calca el setup de los smoke scripts (scripts/smoke-dispatch.mjs,
// smoke-quality.mjs, smoke-internal.mjs): crea tenants reales contra la nube
// vía signup anónimo + Edge Function `create_tenant`, y expone clientes
// Supabase tipados (anon por tenant, anon sin sesión, y service_role admin).
//
// El claim app_metadata.tenant_id se setea recién en create_tenant, por lo que
// SIEMPRE hay que refrescar la sesión después de invocarla para que el JWT
// nuevo lleve el claim que usa current_tenant_id() en las policies.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ── Carga de .env.local (vitest no la inyecta sola; mismo patrón que los smoke) ─
function loadEnv(): Record<string, string> {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    return Object.fromEntries(
      raw
        .split(/\r?\n/)
        .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
        .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
    );
  } catch {
    return {};
  }
}

const fileEnv = loadEnv();
// process.env tiene prioridad (CI puede inyectar las vars), .env.local como fallback.
export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? fileEnv.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  fileEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "";
export const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? fileEnv.SUPABASE_SERVICE_ROLE_KEY ?? "";

// Gate: los tests RLS solo corren si hay credenciales (service role) — así
// `pnpm test:rls` con .env.local los ejecuta de verdad, pero CI sin secrets no
// rompe. Forzar con RLS_TESTS=1 si se quiere fallar al faltar credenciales.
export const RLS_ENABLED =
  Boolean(SERVICE_ROLE_KEY && SUPABASE_URL && ANON_KEY) ||
  process.env.RLS_TESTS === "1";

// Prefijo único de la corrida para identificar (y limpiar) datos de prueba.
export const RUN_PREFIX = `rlstest-${Date.now()}`;

const noPersist = {
  auth: { persistSession: false, autoRefreshToken: false },
} as const;

export function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, noPersist);
}

export function anonClient(): SupabaseClient {
  return createClient(SUPABASE_URL, ANON_KEY, noPersist);
}

export interface TenantCtx {
  label: string;
  email: string;
  password: string;
  userId: string;
  tenantId: string;
  /** Cliente anon logueado como el owner del tenant (JWT con claim tenant_id). */
  client: SupabaseClient;
}

/**
 * Crea un tenant real: signup anónimo + create_tenant + refresh de sesión.
 * Devuelve el contexto con un cliente ya logueado y con el claim tenant_id.
 */
export async function makeTenant(
  label: string,
  industry = "frigorifico"
): Promise<TenantCtx> {
  const email = `${RUN_PREFIX}-${label}@ninjasoft.app`;
  const password = `Rls-${Math.random().toString(36).slice(2, 12)}9x`;
  const client = anonClient();

  const { data: su, error: suErr } = await client.auth.signUp({ email, password });
  if (suErr) throw new Error(`signup ${label}: ${suErr.message}`);
  const userId = su.user?.id;
  if (!userId) throw new Error(`signup ${label}: sin user.id`);

  const { data: fn, error: fnErr } = await client.functions.invoke("create_tenant", {
    body: { businessName: `${RUN_PREFIX} ${label}`, industry },
  });
  if (fnErr) throw new Error(`create_tenant ${label}: ${fnErr.message}`);
  const tenantId = (fn as { tenant_id?: string })?.tenant_id;
  if (!tenantId) throw new Error(`create_tenant ${label}: sin tenant_id`);

  // CRÍTICO: el claim tenant_id se setea en create_tenant; sin refresh el JWT
  // en memoria es el viejo (sin claim) y current_tenant_id() devolvería null.
  const { error: refErr } = await client.auth.refreshSession();
  if (refErr) throw new Error(`refreshSession ${label}: ${refErr.message}`);

  return { label, email, password, userId, tenantId, client };
}

/** Marca un usuario como staff interno de Ninja-Soft (service role). */
export async function markInternal(
  admin: SupabaseClient,
  userId: string
): Promise<void> {
  const { error } = await admin
    .from("users")
    .update({ is_internal: true, internal_level: "admin" })
    .eq("id", userId);
  if (error) throw new Error(`markInternal: ${error.message}`);
}

/**
 * Cliente anon fresco logueado con email/password ya existentes.
 * Útil cuando se cambian claims/flags con service role y hace falta un JWT nuevo.
 */
export async function loginClient(
  email: string,
  password: string
): Promise<SupabaseClient> {
  const client = anonClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`login ${email}: ${error.message}`);
  return client;
}
