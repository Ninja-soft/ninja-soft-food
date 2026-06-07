import { z } from "zod";
import { checkTypography, typographyMessage } from "@/modules/internal-emails/schemas";

// Re-export del guard de tipografia (regla dura 6) para que la UI y los tests de
// campañas no dependan directo de internal-emails.
export { checkTypography, typographyMessage } from "@/modules/internal-emails/schemas";

// =============================================================================
// modules/internal-campaigns/schemas — logica pura de las campañas de email.
//
// Aislada del route handler y del cliente: filtros de audiencia, interpolacion
// de variables por destinatario, guard de la regla dura 6 (reusa
// checkTypography de internal-emails) y el limite de seguridad de 200 destinos.
// Todo funcion pura, testeable (tests/unit/internal-campaigns.test.ts).
// =============================================================================

/** Tope duro de destinatarios por envio (regla de seguridad del feature). */
export const MAX_RECIPIENTS = 200;

/** Marcador en system_emails.subject para derivar el historial de campañas. */
export const CAMPAIGN_PREFIX = "[Campaña]";

/** Estados de suscripcion sobre los que se puede segmentar. */
export const SUBSCRIPTION_STATUSES = [
  "trial",
  "active",
  "past_due",
  "suspended",
  "cancelled",
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/** Modos de cobro (subscriptions.billing_mode). */
export const BILLING_MODES = [
  "mercadopago",
  "manual",
  "courtesy",
  "lifetime",
] as const;
export type BillingMode = (typeof BILLING_MODES)[number];

// -----------------------------------------------------------------------------
// Filtros de audiencia (combinables). Una lista vacia = "sin filtrar por ese
// criterio" (no excluye a nadie). Distinto a no enviar nada: el dry-run siempre
// trae la audiencia que resulte de combinar lo que haya.
// -----------------------------------------------------------------------------

export interface AudienceFilter {
  /** Estados de suscripcion a incluir. Vacio = todos. */
  statuses: SubscriptionStatus[];
  /** Keys de plan a incluir (plans.key). Vacio = todos. */
  planKeys: string[];
  /** Modos de cobro a incluir. Vacio = todos. */
  billingModes: BillingMode[];
  /** Codigos de pais ISO-2 del tenant. Vacio = todos. */
  countries: string[];
}

export const EMPTY_FILTER: AudienceFilter = {
  statuses: [],
  planKeys: [],
  billingModes: [],
  countries: [],
};

/** Un tenant candidato de la audiencia (tras resolver owner + estado efectivo). */
export interface AudienceMember {
  tenantId: string;
  tenantName: string;
  ownerEmail: string;
  ownerName: string | null;
  status: SubscriptionStatus;
  planKey: string | null;
  billingMode: string | null;
  country: string | null;
}

// -----------------------------------------------------------------------------
// Filtrado puro: dada la lista completa de tenants (ya con owner resuelto y
// estado efectivo), aplica los filtros combinables. Esta funcion NO toca la DB:
// el server.ts trae la base y delega aca el matching para que sea testeable.
// -----------------------------------------------------------------------------

export function matchesFilter(
  member: AudienceMember,
  filter: AudienceFilter,
): boolean {
  if (filter.statuses.length > 0 && !filter.statuses.includes(member.status)) {
    return false;
  }
  if (
    filter.planKeys.length > 0 &&
    (member.planKey === null || !filter.planKeys.includes(member.planKey))
  ) {
    return false;
  }
  if (
    filter.billingModes.length > 0 &&
    (member.billingMode === null ||
      !filter.billingModes.includes(member.billingMode as BillingMode))
  ) {
    return false;
  }
  if (filter.countries.length > 0) {
    const c = (member.country ?? "").toUpperCase();
    if (!c || !filter.countries.map((x) => x.toUpperCase()).includes(c)) {
      return false;
    }
  }
  return true;
}

/** Aplica el filtro a toda la lista. Solo incluye miembros con email valido. */
export function filterAudience(
  members: AudienceMember[],
  filter: AudienceFilter,
): AudienceMember[] {
  return members.filter(
    (m) => isValidEmail(m.ownerEmail) && matchesFilter(m, filter),
  );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test((email ?? "").trim());
}

// -----------------------------------------------------------------------------
// Interpolacion de variables por destinatario. Solo dos variables soportadas:
// {{tenant_name}} y {{owner_name}}. Variable ausente -> string vacio (no se
// filtra el placeholder al destinatario). Pura: se usa en el server y en tests.
// El escape HTML del cuerpo lo hace la capa de render (buildEmailLayout +
// renderTemplateHtml); aca solo resolvemos el valor crudo del token.
// -----------------------------------------------------------------------------

export const CAMPAIGN_VARIABLES = ["tenant_name", "owner_name"] as const;
export type CampaignVariable = (typeof CAMPAIGN_VARIABLES)[number];

export function campaignVars(member: {
  tenantName: string;
  ownerName: string | null;
}): Record<CampaignVariable, string> {
  return {
    tenant_name: member.tenantName ?? "",
    // Fallback razonable si el owner no tiene nombre cargado.
    owner_name: (member.ownerName ?? "").trim() || member.tenantName || "",
  };
}

/**
 * Reemplaza {{tenant_name}} / {{owner_name}} en un texto. Tokens desconocidos
 * quedan vacios para no filtrar "{{...}}" al destinatario.
 */
export function interpolateCampaign(
  text: string,
  member: { tenantName: string; ownerName: string | null },
): string {
  const vars = campaignVars(member);
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key: string) => {
    if (key in vars) return vars[key as CampaignVariable];
    return "";
  });
}

// -----------------------------------------------------------------------------
// Validacion de los payloads de los route handlers (audience + send).
// -----------------------------------------------------------------------------

const filterSchema = z.object({
  statuses: z.array(z.enum(SUBSCRIPTION_STATUSES)).default([]),
  planKeys: z.array(z.string().trim().min(1).max(64)).default([]),
  billingModes: z.array(z.enum(BILLING_MODES)).default([]),
  countries: z.array(z.string().trim().length(2)).default([]),
});

/**
 * Normaliza el filtro parseado (donde los arrays pueden venir undefined por los
 * defaults de zod) a un AudienceFilter concreto. La capa de DB exige los cuatro
 * arrays presentes.
 */
export function normalizeFilter(raw: {
  statuses?: SubscriptionStatus[];
  planKeys?: string[];
  billingModes?: BillingMode[];
  countries?: string[];
}): AudienceFilter {
  return {
    statuses: raw.statuses ?? [],
    planKeys: raw.planKeys ?? [],
    billingModes: raw.billingModes ?? [],
    countries: raw.countries ?? [],
  };
}

export const audienceSchema = z.object({
  filter: filterSchema,
});
export type AudienceInput = z.infer<typeof audienceSchema>;

export const sendSchema = z
  .object({
    filter: filterSchema,
    subject: z.string().trim().min(1, "El asunto es obligatorio").max(300),
    html: z.string().trim().min(1, "El contenido es obligatorio").max(20000),
    /**
     * Si viene, manda solo una PRUEBA al staff logueado (un email) y no toca la
     * audiencia. Sirve para el boton "Enviar prueba" antes del envio real.
     */
    test: z.boolean().default(false),
    /**
     * Conteo exacto que la UI mostro en la confirmacion fuerte. El server lo
     * re-valida contra la audiencia fresca: si no coincide, rechaza (la
     * audiencia cambio entre el preview y el envio).
     */
    confirmCount: z.number().int().nonnegative().optional(),
  })
  .superRefine((val, ctx) => {
    const issues = [
      ...checkTypography(val.subject, "subject"),
      ...checkTypography(val.html, "body"),
    ];
    for (const issue of issues) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: typographyMessage(issue),
        path: [issue.field === "subject" ? "subject" : "html"],
      });
    }
  });
export type SendInput = z.infer<typeof sendSchema>;

export interface ParseResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

function parse<T>(schema: z.ZodType<T>, raw: unknown): ParseResult<T> {
  const result = schema.safeParse(raw);
  if (!result.success) {
    const first = result.error.errors[0];
    return { ok: false, error: first?.message ?? "Datos inválidos" };
  }
  return { ok: true, data: result.data };
}

export const parseAudience = (raw: unknown) => parse(audienceSchema, raw);
export const parseSend = (raw: unknown) => parse(sendSchema, raw);

/**
 * Verifica el limite de seguridad de destinatarios. Devuelve un mensaje de
 * error si se excede, o null si esta dentro del tope.
 */
export function checkRecipientLimit(count: number): string | null {
  if (count > MAX_RECIPIENTS) {
    return `Una campaña no puede superar los ${MAX_RECIPIENTS} negocios (la audiencia tiene ${count}). Acota los filtros.`;
  }
  return null;
}

/** Etiquetas legibles (español) para la UI de filtros. */
export const STATUS_LABELS: Record<SubscriptionStatus, string> = {
  trial: "Prueba",
  active: "Activo",
  past_due: "Pago vencido",
  suspended: "Suspendido",
  cancelled: "Cancelado",
};

export const BILLING_MODE_LABELS: Record<BillingMode, string> = {
  mercadopago: "Mercado Pago",
  manual: "Transferencia manual",
  courtesy: "Cortesía",
  lifetime: "Vitalicio",
};
