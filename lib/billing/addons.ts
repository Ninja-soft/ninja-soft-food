import type { ResolvedPrice } from "./pricing";

// =============================================================================
// lib/billing/addons.ts — lógica PURA del add-on (sin DB, sin pasarela).
//
// Tres responsabilidades, todas testeables sin red:
//   1. external_reference de un preapproval de add-on: prefijo estable que el
//      webhook usa para distinguir el cobro del add-on del de la suscripción
//      principal (cuyo external_reference es el tenantId pelado).
//   2. Resolución de precio del add-on por moneda (espejo de pricing.ts pero el
//      add-on solo tiene precio MENSUAL: monthly_price_ars / monthly_price_usd).
//   3. Derivación pura del estado de la card del tenant desde {included, addon,
//      pending}.
//
// El caller (route handler / webhook) lee DB y delega la decisión a este helper.
// =============================================================================

/** Add-on único de esta fase. */
export const AI_ADDON_KEY = "ai";

/** Prefijo del external_reference de un preapproval de add-on. */
const ADDON_REF_PREFIX = "addon";

// ── 1. external_reference ────────────────────────────────────────────────────

/**
 * Construye el external_reference de un preapproval de add-on:
 * `addon:<addonKey>:<tenantId>`. El webhook lo parsea para saber que el cobro
 * corresponde a un add-on (y a cuál) y NO a la suscripción principal — cuyo
 * external_reference es el tenantId a secas.
 */
export function buildAddonExternalReference(
  addonKey: string,
  tenantId: string,
): string {
  return `${ADDON_REF_PREFIX}:${addonKey.trim()}:${tenantId.trim()}`;
}

export interface ParsedAddonReference {
  addonKey: string;
  tenantId: string;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Parsea un external_reference de add-on. Devuelve null si NO es un ref de
 * add-on (ej. el tenantId pelado de la suscripción principal) o si el tenantId
 * no es un UUID válido. El addonKey debe ser no vacío. Estricto a propósito: el
 * webhook decide la rama de procesamiento por el resultado de esta función.
 */
export function parseAddonExternalReference(
  ref: string | null | undefined,
): ParsedAddonReference | null {
  if (!ref) return null;
  const parts = ref.split(":");
  if (parts.length !== 3) return null;
  const [prefix, addonKey, tenantId] = parts;
  if (prefix !== ADDON_REF_PREFIX) return null;
  if (!addonKey || !addonKey.trim()) return null;
  if (!tenantId || !UUID_RE.test(tenantId)) return null;
  return { addonKey: addonKey.trim(), tenantId };
}

/** ¿El external_reference corresponde a un cobro de add-on (no a la suscripción)? */
export function isAddonReference(ref: string | null | undefined): boolean {
  return parseAddonExternalReference(ref) !== null;
}

// ── 2. Precio del add-on por moneda ──────────────────────────────────────────

/** Subconjunto de columnas de precio de `plan_addons` que consume el resolver. */
export interface AddonPrices {
  monthly_price_ars: number | null;
  monthly_price_usd: number | null;
}

/**
 * Resuelve moneda + monto MENSUAL del add-on según la moneda del tenant. Mismo
 * fallback documentado que pricing.ts: ARS → precio ARS; cualquier otra → USD.
 * Devuelve null si el add-on no tiene precio cobrable en esa moneda (ej. precio
 * en 0 = "incluido / no autogestionable"). El add-on no tiene ciclo anual: el
 * cargo es siempre mensual (suma a la suscripción).
 */
export function resolveAddonPrice(
  prices: AddonPrices,
  currency: string,
): ResolvedPrice | null {
  const cur = currency.trim().toUpperCase();

  if (cur === "ARS") {
    const amount = prices.monthly_price_ars;
    if (!amount || amount <= 0) return null;
    return { currency: "ARS", amount };
  }

  const usd = prices.monthly_price_usd;
  if (!usd || usd <= 0) return null;
  return { currency: "USD", amount: usd };
}

// ── 3. Estado de la card del tenant ──────────────────────────────────────────

/** Estado derivado de la card "Asistente IA" del tenant. */
export type AddonCardState =
  | "included" // el plan ya incluye IA (no se vende aparte)
  | "active" // add-on activo (comprado o regalado)
  | "pending" // pago en proceso (esperando confirmación del webhook)
  | "available"; // disponible para activar

export interface AddonStateInput {
  /** El plan del tenant incluye IA (limits.ai_included). */
  included: boolean;
  /** Hay un subscription_addons activo para este add-on. */
  addonActive: boolean;
  /** El checkout volvió con ?addon=pending y el webhook aún no confirmó. */
  pending: boolean;
}

/**
 * Deriva el estado de la card. Precedencia:
 *   included  > active > pending > available.
 * "Incluido en el plan" gana sobre todo: aunque exista un add-on viejo, si el
 * plan ya lo trae no tiene sentido cobrar/mostrar la compra. "Activo" gana sobre
 * "pending": si el webhook ya confirmó, la bandera de redirect es irrelevante.
 */
export function deriveAddonCardState(input: AddonStateInput): AddonCardState {
  if (input.included) return "included";
  if (input.addonActive) return "active";
  if (input.pending) return "pending";
  return "available";
}
