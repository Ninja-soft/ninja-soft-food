// =============================================================================
// lib/api/webhook-emit.ts — lógica PURA del emisor de eventos salientes (outbox).
//
// Sin I/O: catálogo de eventos por recurso, cálculo del "corte" de detección
// (qué recursos son nuevos desde la última entrega encolada por (webhook, evento))
// y los payload builders por evento. El cron (app/api/cron/emit-webhooks) hace el
// data-access y la entrega; acá vive todo lo testeable.
//
// MECANISMO (outbox + cron): las acciones que generan eventos corren vía RPC
// frozen llamadas desde el CLIENTE del tenant (complete_production /
// create_dispatch / create_stock_entry): no hay route handler server donde colgar
// la emisión. El cron detecta filas nuevas, encola UNA por (webhook, evento,
// recurso) con ON CONFLICT DO NOTHING (idempotente) y entrega firmado HMAC.
// Justificación completa en docs/10-api-publica.md y en la migración 0023.
// =============================================================================

// ── Catálogo de eventos emitibles por el outbox ──────────────────────────────
//
// Eventos basados en CREACIÓN de fila (lo que el cron sabe detectar por cursor):
//   production.completed → productions con status='completed'
//   dispatch.created     → dispatches (alta)
//   dispatch.voided      → dispatches con status='voided' (detectado por updated_at)
//   stock.entry_created  → stock_entries (alta, salvo no_traceability)
//
// 'stock.low' es un evento de UMBRAL (no de fila): lo cubre el cron de alertas de
// stock por su propio criterio; NO entra en el outbox de detección por cursor.
export const EMITTABLE_EVENTS = [
  "production.completed",
  "dispatch.created",
  "dispatch.voided",
  "stock.entry_created",
] as const;

export type EmittableEvent = (typeof EMITTABLE_EVENTS)[number];

/** ¿El evento suscrito por un webhook lo emite el outbox por detección de filas? */
export function isEmittableEvent(event: string): event is EmittableEvent {
  return (EMITTABLE_EVENTS as readonly string[]).includes(event);
}

// ── Corte de detección (idempotencia por cursor) ─────────────────────────────

/**
 * Dado el set de recursos candidatos para un (webhook, evento) y el cursor del
 * último recurso YA encolado (su resource_created_at máximo), devuelve solo los
 * recursos NUEVOS, en orden cronológico ascendente.
 *
 * - Si no hay cursor (primera corrida para ese par), devuelve TODO el set acotado
 *   por `limit` (los más recientes, pero entregados en orden cronológico) para no
 *   inundar en el primer disparo de un webhook recién creado.
 * - El corte es estrictamente mayor que el cursor: lo ya encolado nunca reentra.
 *   El unique (webhook, evento, recurso) de la tabla es la red de seguridad ante
 *   empates exactos de timestamp (ON CONFLICT DO NOTHING al encolar).
 */
export function selectNewResources<T extends { id: string; created_at: string }>(
  candidates: T[],
  cursorIso: string | null,
  limit: number,
): T[] {
  const cursorMs = cursorIso ? Date.parse(cursorIso) : NaN;
  const sorted = [...candidates].sort(
    (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at),
  );

  if (!Number.isFinite(cursorMs)) {
    // Primera corrida: tomamos los `limit` más recientes, pero los devolvemos
    // cronológicamente (para que el cursor avance bien tras encolar).
    return sorted.slice(Math.max(0, sorted.length - limit));
  }

  const fresh = sorted.filter((r) => Date.parse(r.created_at) > cursorMs);
  return fresh.slice(0, limit);
}

// ── Payload builders por evento ──────────────────────────────────────────────
//
// Cada builder recibe la fila ya scopeada al tenant y arma un JSON compacto con
// ids, tenant, timestamps y datos clave del recurso. JAMÁS incluye datos de otro
// tenant (las filas vienen filtradas por tenant_id en el cron).

export interface ProductionRow {
  id: string;
  tenant_id: string;
  code: string;
  status: string;
  production_date: string;
  packaging_date: string | null;
  quantity_kg: number | null;
  product_lot_number: string | null;
  product_expiry_date: string | null;
  recipe_id: string;
  created_at: string;
}

export function buildProductionCompletedPayload(p: ProductionRow): {
  resource_id: string;
  resource_created_at: string;
  data: Record<string, unknown>;
} {
  return {
    resource_id: p.id,
    resource_created_at: p.created_at,
    data: {
      id: p.id,
      tenant_id: p.tenant_id,
      code: p.code,
      status: p.status,
      production_date: p.production_date,
      packaging_date: p.packaging_date,
      quantity_kg: p.quantity_kg,
      product_lot_number: p.product_lot_number,
      product_expiry_date: p.product_expiry_date,
      recipe_id: p.recipe_id,
      created_at: p.created_at,
    },
  };
}

export interface DispatchRow {
  id: string;
  tenant_id: string;
  dispatch_date: string;
  status: string;
  customer_id: string;
  vehicle_id: string | null;
  created_at: string;
  updated_at: string;
}

export function buildDispatchCreatedPayload(d: DispatchRow): {
  resource_id: string;
  resource_created_at: string;
  data: Record<string, unknown>;
} {
  return {
    resource_id: d.id,
    resource_created_at: d.created_at,
    data: {
      id: d.id,
      tenant_id: d.tenant_id,
      dispatch_date: d.dispatch_date,
      status: d.status,
      customer_id: d.customer_id,
      vehicle_id: d.vehicle_id,
      created_at: d.created_at,
    },
  };
}

export function buildDispatchVoidedPayload(d: DispatchRow): {
  resource_id: string;
  resource_created_at: string;
  data: Record<string, unknown>;
} {
  // Para dispatch.voided el "cursor" es updated_at (cuándo pasó a voided), no
  // created_at: un despacho viejo puede anularse hoy y debe detectarse hoy.
  return {
    resource_id: d.id,
    resource_created_at: d.updated_at,
    data: {
      id: d.id,
      tenant_id: d.tenant_id,
      dispatch_date: d.dispatch_date,
      status: d.status,
      customer_id: d.customer_id,
      voided_at: d.updated_at,
    },
  };
}

export interface StockEntryRow {
  id: string;
  tenant_id: string;
  ingredient_id: string;
  lot_number: string;
  quantity: number;
  unit: string;
  expiry_date: string | null;
  is_frozen: boolean;
  supplier_id: string | null;
  created_at: string;
}

export function buildStockEntryCreatedPayload(s: StockEntryRow): {
  resource_id: string;
  resource_created_at: string;
  data: Record<string, unknown>;
} {
  return {
    resource_id: s.id,
    resource_created_at: s.created_at,
    data: {
      id: s.id,
      tenant_id: s.tenant_id,
      ingredient_id: s.ingredient_id,
      lot_number: s.lot_number,
      quantity: s.quantity,
      unit: s.unit,
      expiry_date: s.expiry_date,
      is_frozen: s.is_frozen,
      supplier_id: s.supplier_id,
      created_at: s.created_at,
    },
  };
}

// ── Backoff de reintentos (por corrida del cron) ─────────────────────────────

/** Máximo de intentos antes de marcar la entrega como 'failed'. */
export const MAX_DELIVERY_ATTEMPTS = 3;

/**
 * ¿Esta entrega pendiente/fallida es reintentable en ESTA corrida?
 * Backoff simple por número de intento: la corrida N solo toca entregas cuyo
 * `attempts` sea < MAX. (El espaciado real entre intentos lo da la cadencia del
 * cron, cada 5 min: intento 1 ahora, 2 en +5min, 3 en +10min.)
 */
export function isRetryable(attempts: number): boolean {
  return attempts < MAX_DELIVERY_ATTEMPTS;
}

/** ¿Un status HTTP cuenta como entrega exitosa? */
export function isDeliveredStatus(status: number): boolean {
  return status >= 200 && status < 300;
}
