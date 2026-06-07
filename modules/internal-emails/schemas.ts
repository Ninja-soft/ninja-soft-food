import { z } from "zod";

// =============================================================================
// modules/internal-emails/schemas — validacion pura de la consola de emails.
//
// Aislada del route handler y del cliente a proposito: payloads SMTP / plantilla
// + el guard de la regla dura 6 (sin emojis, sin em-dashes, separador punto
// medio ·) son funciones puras testeables (tests/unit/internal-emails.test.ts).
// Los route handlers (app/api/internal/email-*) las usan tras requireInternal().
// =============================================================================

/** Em-dash (—) y en-dash (–): prohibidos por regla dura 6 (usar guion simple). */
const DASH_RE = /[—–]/;

/**
 * Detecta emojis y pictogramas (regla dura 6). Cubre los bloques Unicode
 * habituales: emoticones, simbolos/pictogramas, transporte, banderas,
 * dingbats y simbolos suplementarios. El punto medio (· U+00B7) NO entra.
 */
const EMOJI_RE =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F0FF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{1F1E6}-\u{1F1FF}\u{200D}\u{20E3}]/u;

export interface TypographyIssue {
  /** Campo donde aparece el problema. */
  field: "subject" | "body";
  /** Tipo de violacion de la regla dura 6. */
  kind: "emoji" | "em_dash";
}

/**
 * Valida un texto contra la regla dura 6. Devuelve la lista de violaciones
 * (vacia = ok). Pura: la usan tanto la validacion del server como la UI para el
 * aviso en vivo.
 */
export function checkTypography(
  text: string,
  field: TypographyIssue["field"],
): TypographyIssue[] {
  const issues: TypographyIssue[] = [];
  if (EMOJI_RE.test(text)) issues.push({ field, kind: "emoji" });
  if (DASH_RE.test(text)) issues.push({ field, kind: "em_dash" });
  return issues;
}

/** Mensaje legible (español) para una violacion tipografica. */
export function typographyMessage(issue: TypographyIssue): string {
  const where = issue.field === "subject" ? "el asunto" : "el contenido";
  return issue.kind === "emoji"
    ? `Quita los emojis de ${where} (regla de estilo de Ninja Food).`
    : `Reemplaza el guion largo de ${where} por un guion simple (-).`;
}

// -----------------------------------------------------------------------------
// SMTP — payload de POST /api/internal/email-smtp.
//
// `password` es opcional: vacio = "no cambiar" (no se pisa el valor guardado).
// El esquema de Food usa hostname (no host) + secure (TLS).
// -----------------------------------------------------------------------------

export const smtpSchema = z.object({
  hostname: z.string().trim().min(1, "El servidor SMTP es obligatorio").max(255),
  port: z
    .number({ invalid_type_error: "El puerto debe ser un número" })
    .int("El puerto no admite decimales")
    .min(1, "Puerto inválido")
    .max(65535, "Puerto inválido"),
  username: z.string().trim().max(255).default(""),
  password: z.string().max(1024).optional(),
  from_email: z
    .string()
    .trim()
    .email("Email del remitente inválido")
    .max(255),
  from_name: z.string().trim().min(1, "El nombre del remitente es obligatorio").max(120),
  secure: z.boolean(),
});

export type SmtpInput = z.infer<typeof smtpSchema>;

// -----------------------------------------------------------------------------
// Plantilla global — payload de POST /api/internal/email-templates.
//
// Persiste un override global en system_email_templates por `key` del catalogo.
// Aplica el guard de la regla dura 6 sobre subject + html.
// -----------------------------------------------------------------------------

export const templateSchema = z
  .object({
    key: z.string().trim().min(1, "key obligatoria").max(64),
    subject: z.string().trim().min(1, "El asunto es obligatorio").max(300),
    html: z.string().trim().min(1, "El contenido es obligatorio").max(20000),
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

export type TemplateInput = z.infer<typeof templateSchema>;

// -----------------------------------------------------------------------------
// Envio de prueba — payload de POST /api/internal/email-test.
// -----------------------------------------------------------------------------

export const testSchema = z.object({
  subject: z.string().trim().min(1, "El asunto es obligatorio").max(300),
  html: z.string().trim().min(1, "El contenido es obligatorio").max(20000),
});

export type TestInput = z.infer<typeof testSchema>;

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

export const parseSmtp = (raw: unknown) => parse(smtpSchema, raw);
export const parseTemplate = (raw: unknown) => parse(templateSchema, raw);
export const parseTest = (raw: unknown) => parse(testSchema, raw);

// -----------------------------------------------------------------------------
// Variables de ejemplo para la vista previa (espejo de las del POS).
// Cubre TODAS las variables del catalogo (lib/emails/templates) con valores
// realistas. El render reemplaza {{var}} con esto en la previa y en la prueba.
// -----------------------------------------------------------------------------

export function sampleVars(negocio = "Ninja Food"): Record<string, string> {
  const DOT = "·";
  return {
    negocio,
    logo_url: "",
    nombre: "Lucas",
    dias_trial: "14",
    link: "https://app.ninjasoft.app",
    fecha: "06/06/2026",
    importancia: "82",
    extracto: `Informe conforme ${DOT} sin desvios relevantes.`,
    ingrediente: "Harina 000",
    stock_actual: "12",
    umbral: "20",
    unidad: "kg",
    tipo: "Lote",
    detalle: "Lote LOTE-00042 de Harina 000",
    vence: "20/06/2026",
    dias: "7",
    monto: "$ 29.000",
    plan: "Profesional",
    periodo: "Mensual",
  };
}
