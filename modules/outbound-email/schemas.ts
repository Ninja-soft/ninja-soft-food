import { z } from "zod";

// =============================================================================
// modules/outbound-email/schemas — validacion PURA del envio manual de
// documentos por email (planillas, remitos, recetas, recall, informes).
//
// Estos envios salen desde /api/emails/send con la sesion del tenant. A
// diferencia de los disparadores del sistema (welcome, billing, alertas), aca el
// USUARIO escribe asunto y mensaje, asi que aplican las convenciones tipograficas
// duras (CLAUDE.md regla 6): SIN emojis, SIN em-dashes (ni en-dash). El separador
// visual permitido es el punto medio (·). Tambien validamos destinatarios,
// limite total de adjuntos y el rate limit (funcion pura, testeable).
//
// Modulo PURO: sin Supabase, sin fetch. Se importa desde el cliente (modal), el
// route handler (revalidacion server-side) y los tests.
// =============================================================================

// ── Reglas tipograficas (regla dura 6) ───────────────────────────────────────

/** Separador visual de marca. Lo dejamos pasar; el em/en-dash no. */
export const DOT = "·";

const EM_DASH = "—"; // —
const EN_DASH = "–"; // –

// Rangos de emojis (pictogramas, simbolos, banderas, dingbats). Igual criterio
// que el test de templates del catalogo, para que la regla sea una sola.
const EMOJI_RE =
  /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{1F1E6}-\u{1F1FF}\u{2190}-\u{21FF}\u{2300}-\u{23FF}]/u;

/** ¿El texto cumple la regla 6 (sin emojis, sin em-dash ni en-dash)? */
export function isTypographyClean(text: string): boolean {
  if (EMOJI_RE.test(text)) return false;
  if (text.includes(EM_DASH) || text.includes(EN_DASH)) return false;
  return true;
}

/** Normaliza un texto a la regla 6: reemplaza em/en-dash por guion simple y
 *  elimina emojis. Se aplica en el cliente antes de enviar para no rebotar al
 *  usuario por un guion largo que pego sin querer. */
export function enforceTypography(text: string): string {
  return text
    .replace(new RegExp(`[${EM_DASH}${EN_DASH}]`, "g"), "-")
    .replace(new RegExp(EMOJI_RE.source, "gu"), "")
    .replace(/[ \t]{2,}/g, " ");
}

// ── Limites ───────────────────────────────────────────────────────────────────

/** Limite total de adjuntos por envio (suma de bytes). Espejo de la Edge Function. */
export const MAX_ATTACHMENTS_BYTES = 5 * 1024 * 1024; // 5 MB
/** Maximo de destinatarios por envio (evita uso como lista de difusion). */
export const MAX_RECIPIENTS = 30;
/** Rate limit suave: envios por tenant por ventana. */
export const RATE_LIMIT_PER_HOUR = 20;
/** Ventana del rate limit, en milisegundos. */
export const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

// ── Email / destinatarios ─────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** ¿Es una direccion de email valida (forma minima)? */
export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

/**
 * Normaliza una lista de destinatarios: trim, minusculas, sin vacios ni
 * duplicados. NO valida (eso lo hace el schema): se usa para sugerencias y para
 * el estado del modal.
 */
export function normalizeRecipients(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const e = raw.trim().toLowerCase();
    if (!e || seen.has(e)) continue;
    seen.add(e);
    out.push(e);
  }
  return out;
}

// ── Schema del payload del envio manual ───────────────────────────────────────

const cleanText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .min(1, `Escribí ${label}`)
    .max(max, `${label.charAt(0).toUpperCase()}${label.slice(1)} demasiado largo`)
    .refine(isTypographyClean, {
      message: "Sin emojis ni guiones largos (usá guion simple o el punto medio ·)",
    });

export const sendEmailSchema = z.object({
  to: z
    .array(z.string())
    .min(1, "Agregá al menos un destinatario")
    .max(MAX_RECIPIENTS, `Máximo ${MAX_RECIPIENTS} destinatarios`)
    .transform((arr) => normalizeRecipients(arr))
    .refine((arr) => arr.length > 0, "Agregá al menos un destinatario")
    .refine((arr) => arr.every(isValidEmail), {
      message: "Hay un email inválido en la lista",
    }),
  subject: cleanText(200, "el asunto"),
  // El mensaje es opcional: si el usuario lo deja vacio, el cuerpo del email
  // queda con la linea por defecto del template del documento.
  message: z
    .string()
    .trim()
    .max(4000, "El mensaje es demasiado largo")
    .refine(isTypographyClean, {
      message: "Sin emojis ni guiones largos (usá guion simple o el punto medio ·)",
    })
    .optional()
    .or(z.literal("")),
  /** Contexto del documento (para el log y el cuerpo por defecto). */
  documentLabel: z.string().trim().max(160).optional(),
});

export type SendEmailInput = z.infer<typeof sendEmailSchema>;

// ── Adjunto (lo que viaja del cliente al route handler en base64) ─────────────

export const attachmentSchema = z.object({
  filename: z.string().trim().min(1).max(200),
  contentType: z.string().trim().min(1).max(120),
  /** Contenido en base64 (sin prefijo data:). */
  content: z.string().min(1),
});

export type EmailAttachment = z.infer<typeof attachmentSchema>;

/** Bytes aproximados de un payload base64 (sin decodificarlo). */
export function base64Bytes(b64: string): number {
  const clean = b64.replace(/=+$/, "");
  return Math.floor((clean.length * 3) / 4);
}

/** Suma de bytes de una lista de adjuntos. */
export function totalAttachmentBytes(attachments: EmailAttachment[]): number {
  return attachments.reduce((s, a) => s + base64Bytes(a.content), 0);
}

/** ¿La lista de adjuntos cabe en el limite total? */
export function attachmentsFit(attachments: EmailAttachment[]): boolean {
  return totalAttachmentBytes(attachments) <= MAX_ATTACHMENTS_BYTES;
}

// ── Rate limit (puro) ─────────────────────────────────────────────────────────

/**
 * Decide si un nuevo envio entra dentro del rate limit. `sentTimestamps` son los
 * created_at (ms epoch) de los envios del tenant en system_emails. Cuenta solo
 * los que caen dentro de la ventana respecto de `now`.
 *
 * Devuelve { allowed, used, remaining, retryAfterMs }: si no entra,
 * retryAfterMs es cuanto falta para que el envio mas viejo de la ventana salga.
 */
export function checkRateLimit(
  sentTimestamps: number[],
  now: number = Date.now(),
  limit: number = RATE_LIMIT_PER_HOUR,
  windowMs: number = RATE_LIMIT_WINDOW_MS,
): {
  allowed: boolean;
  used: number;
  remaining: number;
  retryAfterMs: number;
} {
  const windowStart = now - windowMs;
  const inWindow = sentTimestamps
    .filter((t) => t > windowStart)
    .sort((a, b) => a - b);
  const used = inWindow.length;
  const allowed = used < limit;
  const remaining = Math.max(0, limit - used);
  // Si no entra, hay que esperar a que el mas viejo salga de la ventana.
  const retryAfterMs = allowed
    ? 0
    : Math.max(0, inWindow[0] + windowMs - now);
  return { allowed, used, remaining, retryAfterMs };
}
