import { z } from "zod";

// =============================================================================
// modules/internal/plans — lógica pura del editor de precios de planes.
//
// Aislada del route handler y del cliente Supabase a propósito: la validación
// del payload y el gating por nivel de staff son funciones puras testeables
// (tests/unit/internal-plans.test.ts). El route handler
// (app/api/internal/update-plan) las importa después de requireInternal().
// =============================================================================

/** Tope comercial duro: precios en centavos enteros hasta 99.999.999. */
export const MAX_PRICE = 99_999_999;

/**
 * Precio en ARS: null (plan sin precio = no self-service, "A medida") o entero
 * positivo (mayor a 0) hasta MAX_PRICE. Sin decimales: ARS no los usa en la UI
 * y la columna numeric(12,2) los toleraría, pero el negocio cobra en enteros.
 */
const priceArs = z
  .number({ invalid_type_error: "El precio debe ser un número" })
  .int("El precio no admite decimales")
  .positive("El precio debe ser mayor a cero")
  .max(MAX_PRICE, "El precio supera el máximo permitido")
  .nullable();

/**
 * Payload de POST /api/internal/update-plan. `monthly_price_ars` y
 * `yearly_price_ars` son obligatorios en el body (pueden venir null para dejar
 * el plan "a medida"); `is_active` es opcional. No hay regla dura entre mensual
 * y anual: la coherencia comercial (anual ≈ 10 meses) la decide el staff.
 */
export const updatePlanSchema = z.object({
  plan_id: z.string().uuid("plan_id inválido"),
  monthly_price_ars: priceArs,
  yearly_price_ars: priceArs,
  is_active: z.boolean().optional(),
  // Toggle "IA incluida": setea limits.ai_included (lo que lee tenantHasAI vía a).
  // Opcional: si no viene, el route handler no toca limits.
  ai_included: z.boolean().optional(),
});

export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;

export interface ParseResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

/** Valida el payload crudo. Devuelve el primer error legible (UI en español). */
export function parseUpdatePlan(raw: unknown): ParseResult<UpdatePlanInput> {
  const result = updatePlanSchema.safeParse(raw);
  if (!result.success) {
    const first = result.error.errors[0];
    return { ok: false, error: first?.message ?? "Datos inválidos" };
  }
  return { ok: true, data: result.data };
}

/**
 * Cambiar precios es sensible: solo staff con internal_level === 'admin'.
 * Editor y viewer (y cualquier nivel desconocido o nulo) quedan fuera. Función
 * pura para testear el gating sin tocar la sesión.
 */
export function canEditPlans(level: string | null | undefined): boolean {
  return level === "admin";
}

// =============================================================================
// Add-ons (catálogo plan_addons) — validación pura del editor de /internal/planes.
// =============================================================================

/**
 * Precio del add-on: null (no cobrable / no autogestionable) o entero positivo.
 * Mismo criterio que los precios de plan: enteros, sin decimales en la UI.
 */
const addonPrice = z
  .number({ invalid_type_error: "El precio debe ser un número" })
  .int("El precio no admite decimales")
  .positive("El precio debe ser mayor a cero")
  .max(MAX_PRICE, "El precio supera el máximo permitido")
  .nullable();

/**
 * Payload de POST /api/internal/update-addon. `key` identifica el add-on del
 * catálogo (ej. 'ai'). Los precios (ARS/USD) pueden venir null (no autogestionable).
 */
export const updateAddonSchema = z.object({
  key: z.string().min(1, "key requerida"),
  monthly_price_ars: addonPrice,
  monthly_price_usd: addonPrice,
  is_active: z.boolean().optional(),
  description: z.string().max(500, "Descripción demasiado larga").optional(),
});

export type UpdateAddonInput = z.infer<typeof updateAddonSchema>;

/** Valida el payload del editor de add-ons. Primer error legible (UI en español). */
export function parseUpdateAddon(raw: unknown): ParseResult<UpdateAddonInput> {
  const result = updateAddonSchema.safeParse(raw);
  if (!result.success) {
    const first = result.error.errors[0];
    return { ok: false, error: first?.message ?? "Datos inválidos" };
  }
  return { ok: true, data: result.data };
}

/**
 * ¿El jsonb de limits marca ai_included? (=== true, gate estricto). Espejo
 * client-safe de lib/ai/access.planLimitsIncludeAI (ese módulo es server-only):
 * la UI del editor de planes lo usa para el estado inicial del toggle.
 */
export function limitsIncludeAI(limits: unknown): boolean {
  if (!limits || typeof limits !== "object" || Array.isArray(limits)) {
    return false;
  }
  return (limits as Record<string, unknown>).ai_included === true;
}

/**
 * Aplica el toggle "IA incluida" sobre un jsonb de limits, preservando el resto.
 * Función pura: setea `ai_included` a true/false sin perder otras claves. Lo lee
 * tenantHasAI (vía a) y planLimitsIncludeAI (=== true estricto). El route handler
 * lo usa para componer el patch del plan sin pisar otros límites.
 */
export function applyAiIncludedToLimits(
  limits: unknown,
  aiIncluded: boolean,
): Record<string, unknown> {
  const base =
    limits && typeof limits === "object" && !Array.isArray(limits)
      ? { ...(limits as Record<string, unknown>) }
      : {};
  base.ai_included = aiIncluded;
  return base;
}
