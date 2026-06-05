import { createAdminClient } from "@/lib/supabase/admin";

// =============================================================================
// lib/api/data.ts — utilidades de data-access para la API pública v1.
//
// DECISIÓN DE SEGURIDAD (scoping sin JWT):
//   La API pública v1 entra sin sesión Supabase, así que dentro del request NO
//   hay current_tenant_id() ni rol authenticated: RLS no puede aislar al tenant
//   por sí solo. Resolvemos el tenant a partir del hash de la key (verify_api_key)
//   y luego accedemos a los datos con el ADMIN client (service_role, bypassa RLS)
//   filtrando SIEMPRE y EXPLÍCITAMENTE por .eq("tenant_id", tenantId) en cada
//   query, además de .is("deleted_at", null). El scoping es responsabilidad del
//   handler. NO existe una alternativa más segura sin emitir un JWT custom por
//   tenant (firmado con el secret de Supabase) — anotado como mejora futura: un
//   JWT efímero con app_metadata.tenant_id permitiría apoyarse en RLS en vez del
//   .eq() manual. Hasta entonces, el .eq("tenant_id", ...) es el guard único.
//
// El service_role JAMÁS sale del server: estos helpers solo se usan desde route
// handlers nodejs (app/api/v1/*).
// =============================================================================

/** Client admin (service_role). Solo server-side. */
export function adminDb() {
  return createAdminClient();
}

/** Límite de página: default 50, máximo 100. */
export function parseLimit(searchParams: URLSearchParams): number {
  const raw = Number(searchParams.get("limit"));
  if (!Number.isFinite(raw) || raw <= 0) return 50;
  return Math.min(Math.floor(raw), 100);
}

/** Cursor de paginación: created_at ISO de la última fila de la página previa. */
export function parseCursor(searchParams: URLSearchParams): string | null {
  const cursor = searchParams.get("cursor");
  return cursor && cursor.trim() ? cursor.trim() : null;
}

/** Valida un parámetro de fecha YYYY-MM-DD (o null si ausente/ inválido). */
export function parseDate(value: string | null): string | null {
  if (!value) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

/**
 * Envoltura de página por cursor: devuelve los items y el cursor siguiente.
 * Se pide `limit + 1` filas; si vino la de más, hay más página y su created_at
 * (de la última fila incluida) es el `next_cursor`.
 */
export function buildPage<T extends { created_at?: string | null }>(
  rows: T[],
  limit: number,
  cursorField: (row: T) => string | null,
): { data: T[]; next_cursor: string | null } {
  if (rows.length <= limit) {
    return { data: rows, next_cursor: null };
  }
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return { data: page, next_cursor: cursorField(last) };
}

type PgError = { message?: string; code?: string } | null;

/**
 * ¿El error indica que la migración 0010 (o cualquier tabla esperada) no existe?
 * En la API pública lo tratamos como 503-ish a nivel handler, pero las tablas
 * de dominio (productions, stock_entries...) ya están aplicadas, así que esto
 * casi nunca dispara — es defensa por si un endpoint corre contra una DB sin la
 * tabla. (Patrón de modules/forms/api.ts.)
 */
export function isUndefinedTable(error: PgError): boolean {
  if (!error) return false;
  const code = error.code ?? "";
  return code === "PGRST205" || code === "42P01";
}
