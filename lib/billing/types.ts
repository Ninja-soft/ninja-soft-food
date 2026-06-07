import type { Database } from "@/types/database";

// =============================================================================
// lib/billing/types.ts — contrato agnóstico de pasarela.
//
// El dominio NUNCA conoce la pasarela: habla solo con esta interface y estos
// tipos. El estado canónico vive en subscriptions.status (enum tenant_status);
// las pasarelas se mapean a esos valores. Doc 04 §5, doc 05, doc 09 §2.
// =============================================================================

/** Estado canónico de la suscripción (= enum tenant_status de la DB). */
export type CanonicalStatus = Database["public"]["Enums"]["tenant_status"];

/** Ciclo de facturación (= enum billing_cycle de la DB). */
export type BillingCycle = Database["public"]["Enums"]["billing_cycle"];

/** Identificador de pasarela (= enum billing_provider de la DB). */
export type ProviderKey = Database["public"]["Enums"]["billing_provider"];

/** Datos mínimos para crear una suscripción en la pasarela. */
export interface CreateSubscriptionInput {
  /** tenant que se suscribe (se usa como external_reference). */
  tenantId: string;
  /** key del plan (start | pro | business | enterprise). */
  planKey: string;
  /** Nombre comercial del plan, para el "reason" de la pasarela. */
  planName: string;
  /** Monto a cobrar por período, en la moneda indicada en `currency`. */
  amount: number;
  /**
   * Código de moneda ISO 4217 (ARS, MXN, CLP, ...). Lo resuelve el caller desde
   * el operating profile del tenant (lib/globalization). El provider NO lee DB:
   * recibe la moneda ya resuelta. Validar que la pasarela soporte la moneda en
   * el país de la cuenta es responsabilidad del caller (ver nota en el provider).
   */
  currency: string;
  cycle: BillingCycle;
  /** Email del pagador (owner del tenant). */
  payerEmail: string;
  /** URL de retorno tras el checkout (NO es la fuente de verdad del cobro). */
  backUrl: string;
  /** URL que la pasarela llamará con los webhooks. */
  notificationUrl: string;
}

/** Resultado de crear una suscripción: a dónde mandar al usuario. */
export interface CreateSubscriptionResult {
  /** id del recurso de suscripción en la pasarela (preapproval_id en MP). */
  providerSubscriptionId: string;
  /** URL de checkout a la que redirigir al usuario. */
  initPoint: string;
}

/** Estado de una suscripción tal como lo reporta la pasarela. */
export interface SubscriptionInfo {
  providerSubscriptionId: string;
  /** Estado YA mapeado a canónico. */
  status: CanonicalStatus;
  /** Estado crudo de la pasarela (auditoría / debug). */
  rawStatus: string;
  /** external_reference (= tenantId) si la pasarela lo devuelve. */
  externalReference: string | null;
  /** Frecuencia del cargo recurrente, en meses (1 mensual, 12 anual). */
  frequencyMonths: number | null;
}

/** Evento de webhook ya normalizado (thin payload → re-fetch del recurso). */
export interface NormalizedEvent {
  /** id único del evento para idempotencia (provider_event_id). */
  eventId: string;
  /** Tipo de recurso afectado. */
  resource: "subscription" | "payment" | "unknown";
  /** id del recurso en la pasarela (preapproval_id o payment_id). */
  resourceId: string | null;
}

/**
 * Contrato que toda pasarela implementa. El webhook se procesa en dos pasos:
 *  1) verifySignature + parseWebhook (thin payload),
 *  2) getSubscription / getPayment para re-fetch del recurso real.
 */
export interface BillingProvider {
  readonly key: ProviderKey;

  /** Crea la suscripción y devuelve la URL de checkout. */
  createSubscription(
    input: CreateSubscriptionInput,
  ): Promise<CreateSubscriptionResult>;

  /** Re-fetch del estado real de una suscripción (fuente de verdad del cobro). */
  getSubscription(providerSubscriptionId: string): Promise<SubscriptionInfo>;

  /** Cancela la suscripción en la pasarela. */
  cancelSubscription(providerSubscriptionId: string): Promise<void>;

  /**
   * Verifica la firma del webhook. La pasarela decide qué headers usa.
   * Devuelve true si la firma es válida. Async: el secret puede venir de la DB
   * cifrada (internal_settings) con fallback a env (ver lib/billing/platform-config).
   */
  verifySignature(args: VerifySignatureArgs): Promise<boolean>;

  /** Extrae el evento normalizado de los query params + body del webhook. */
  parseWebhook(args: ParseWebhookArgs): NormalizedEvent | null;
}

export interface VerifySignatureArgs {
  /** Header x-signature (MP) u homólogo. */
  signatureHeader: string | null;
  /** Header x-request-id (MP). */
  requestId: string | null;
  /** data.id del query string (lo que MP firma). */
  dataId: string | null;
}

export interface ParseWebhookArgs {
  /** Query params de la URL del webhook. */
  searchParams: URLSearchParams;
  /** Body parseado (puede venir vacío). */
  body: Record<string, unknown> | null;
}
