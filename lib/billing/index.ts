import { mercadopago } from "./mercadopago";
import type { BillingProvider, ProviderKey } from "./types";

// =============================================================================
// lib/billing/index.ts — factory de pasarelas.
//
// El dominio pide una pasarela por su key y recibe el contrato BillingProvider.
// MVP: solo Mercado Pago. v2 (decisión societaria previa): stripe, paypal.
// Router país→pasarela (doc 04 §5) vive aquí cuando se sumen las v2.
// =============================================================================

export * from "./types";
export { resolvePlanPrice } from "./pricing";
export type { PlanPrices, ResolvedPrice } from "./pricing";
export { mapPreapprovalStatus, verifyMpSignature } from "./mercadopago";
export {
  AI_ADDON_KEY,
  buildAddonExternalReference,
  parseAddonExternalReference,
  isAddonReference,
  resolveAddonPrice,
  deriveAddonCardState,
} from "./addons";
export type {
  AddonPrices,
  ParsedAddonReference,
  AddonCardState,
  AddonStateInput,
} from "./addons";

const PROVIDERS: Partial<Record<ProviderKey, BillingProvider>> = {
  mercadopago,
};

/** Pasarela por defecto del MVP (AR/LATAM). */
export const DEFAULT_PROVIDER: ProviderKey = "mercadopago";

export function getBillingProvider(
  provider: ProviderKey = DEFAULT_PROVIDER,
): BillingProvider {
  const impl = PROVIDERS[provider];
  if (!impl) {
    throw new Error(`Pasarela no soportada en esta fase: ${provider}`);
  }
  return impl;
}
