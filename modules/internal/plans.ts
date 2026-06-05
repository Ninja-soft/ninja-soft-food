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
