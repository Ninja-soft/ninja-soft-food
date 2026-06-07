import type { BillingCycle } from "./types";

// =============================================================================
// lib/billing/pricing.ts — resolución pura de moneda + monto del preapproval.
//
// El monto que se manda a la pasarela DEBE corresponder a la moneda elegida por
// el tenant (operating profile). Hoy `plans` guarda precios en columnas fijas:
//   - monthly_price_ars / yearly_price_ars  → moneda local AR
//   - monthly_price_usd                      → fallback USD (NO hay yearly_usd)
//
// Mapeo (hasta que Fase 5 agregue precios por moneda en una tabla aparte):
//   currency === "ARS"  → precio ARS (mensual o anual según ciclo)
//   currency !== "ARS"  → precio USD (fallback documentado; el yearly cae a USD
//                          mensual × 12 porque no existe columna yearly_usd).
//
// Sin DB acá: función pura, testeable. El caller (route handler) lee plans +
// operating profile y delega la decisión a este helper.
// =============================================================================

/** Subconjunto de columnas de precio de `plans` que consume el resolver. */
export interface PlanPrices {
  monthly_price_ars: number | null;
  yearly_price_ars: number | null;
  monthly_price_usd: number | null;
}

export interface ResolvedPrice {
  /** Moneda ISO 4217 efectiva del cobro. */
  currency: string;
  /** Monto a cobrar por período, en `currency`. */
  amount: number;
}

/**
 * Resuelve moneda + monto para el preapproval según la moneda del tenant.
 *
 * @param prices  columnas de precio del plan.
 * @param cycle   ciclo de facturación (monthly | yearly).
 * @param currency moneda del operating profile del tenant (ISO 4217).
 * @returns ResolvedPrice con la moneda efectiva y el monto, o null si el plan no
 *          tiene precio cobrable en esa moneda (ej. Enterprise "a medida", o un
 *          tenant no-ARS de un plan sin precio USD cargado).
 */
export function resolvePlanPrice(
  prices: PlanPrices,
  cycle: BillingCycle,
  currency: string,
): ResolvedPrice | null {
  const cur = currency.trim().toUpperCase();
  const yearly = cycle === "yearly";

  if (cur === "ARS") {
    const amount = yearly ? prices.yearly_price_ars : prices.monthly_price_ars;
    if (!amount || amount <= 0) return null;
    return { currency: "ARS", amount };
  }

  // Fallback documentado: cualquier moneda no-ARS cobra en USD. No existe
  // columna yearly_price_usd, así que el anual se compone como mensual × 12.
  const monthlyUsd = prices.monthly_price_usd;
  if (!monthlyUsd || monthlyUsd <= 0) return null;
  const amount = yearly ? monthlyUsd * 12 : monthlyUsd;
  return { currency: "USD", amount };
}
