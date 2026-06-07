import type { Database } from "@/types/database";
import type { CanonicalStatus, SubscriptionInfo } from "./types";

// =============================================================================
// lib/billing/sync-decisions.ts — decisiones PURAS de la sincronización de cobro.
//
// Separado de sync.ts a propósito: sync.ts tiene efectos de borde (Supabase,
// emails server-only) que no resuelven en el entorno de test. Acá viven solo las
// funciones puras (sin imports server-only) que deciden el patch y el diff, para
// poder testearlas en aislamiento. sync.ts las re-exporta.
// =============================================================================

type SubscriptionUpdate =
  Database["public"]["Tables"]["subscriptions"]["Update"];

/** Datos mínimos de una subscription local necesarios para construir el patch. */
export interface SubscriptionRowForSync {
  id: string;
  tenant_id: string;
  billing_cycle: string;
  /** Estado local actual (para comparar contra el de la pasarela). */
  status?: CanonicalStatus | null;
  /** automatic | manual | comp (0014). Las comp/manual no las toca la pasarela. */
  billing_mode?: string | null;
  /** Acceso vitalicio: nunca vence ni se degrada por reconciliación. */
  is_lifetime?: boolean | null;
}

/**
 * ¿La suscripción está protegida de la reconciliación automática? Acceso
 * vitalicio (is_lifetime) y cortesías (billing_mode = 'comp') NO se cobran por
 * pasarela: el job diario NUNCA debe marcarlas past_due / suspended / cancelled
 * ni recalcular su período. Los pagos manuales (billing_mode = 'manual') también
 * los administra el staff a mano, así que también quedan fuera del sync de MP.
 * FUNCIÓN PURA, testeable en aislamiento.
 */
export function isReconciliationExempt(
  sub: Pick<SubscriptionRowForSync, "billing_mode" | "is_lifetime">,
): boolean {
  return (
    sub.is_lifetime === true ||
    sub.billing_mode === "comp" ||
    sub.billing_mode === "manual"
  );
}

/**
 * Construye el patch canónico a aplicar sobre subscriptions a partir del estado
 * real reportado por la pasarela. FUNCIÓN PURA: el reloj es inyectable para test.
 *
 * Regla del período: solo cuando la pasarela reporta `active` recalculamos
 * current_period_start/end (start = ahora, end = +N meses según la frecuencia) y
 * limpiamos cancel_at_period_end. En cualquier otro estado solo se sincroniza el
 * status: no inventamos fechas de período para past_due / cancelled / trial.
 */
export function buildSubscriptionPatch(
  sub: SubscriptionRowForSync,
  info: Pick<
    SubscriptionInfo,
    "providerSubscriptionId" | "status" | "frequencyMonths"
  >,
  now: Date = new Date()
): SubscriptionUpdate {
  const patch: SubscriptionUpdate = {
    provider: "mercadopago",
    provider_subscription_id: info.providerSubscriptionId,
    status: info.status,
  };

  if (info.status === "active") {
    const months =
      info.frequencyMonths ?? (sub.billing_cycle === "yearly" ? 12 : 1);
    const start = new Date(now);
    const end = new Date(now);
    end.setMonth(end.getMonth() + months);
    patch.current_period_start = start.toISOString();
    patch.current_period_end = end.toISOString();
    patch.cancel_at_period_end = false;
    patch.billing_cycle = months >= 12 ? "yearly" : "monthly";
  }

  return patch;
}

/**
 * ¿El estado local quedó desactualizado respecto del de la pasarela? Predicado
 * PURO usado por la reconciliación para decidir si hay que tocar la fila. Compara
 * solo el status canónico: si la pasarela dice "active" y localmente también lo
 * está, no reescribimos el período en cada corrida (evita churn de fechas).
 */
export function statusDiffers(
  localStatus: CanonicalStatus | null | undefined,
  remoteStatus: CanonicalStatus
): boolean {
  return localStatus !== remoteStatus;
}
