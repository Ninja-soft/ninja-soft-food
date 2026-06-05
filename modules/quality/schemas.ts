import { z } from "zod";
import { sanitizeRichHtml } from "@/lib/utils/sanitizeHtml";
import type { Database } from "@/types/database";

export type AnalysisType = Database["public"]["Enums"]["analysis_type"];

// Los 8 tipos del enum analysis_type con su etiqueta en español rioplatense.
// El orden define cómo se muestran en selects y filtros.
export const ANALYSIS_TYPES: { value: AnalysisType; label: string }[] = [
  { value: "agua", label: "Agua" },
  { value: "alimentos", label: "Alimentos" },
  { value: "productos", label: "Productos" },
  { value: "superficies", label: "Superficies" },
  { value: "ambiente", label: "Ambiente" },
  { value: "materia_prima", label: "Materia prima" },
  { value: "bebidas", label: "Bebidas" },
  { value: "otro", label: "Otro" },
];

const ANALYSIS_TYPE_VALUES = ANALYSIS_TYPES.map((t) => t.value) as [
  AnalysisType,
  ...AnalysisType[],
];

export const ANALYSIS_TYPE_LABELS: Record<AnalysisType, string> =
  Object.fromEntries(ANALYSIS_TYPES.map((t) => [t.value, t.label])) as Record<
    AnalysisType,
    string
  >;

// ── Bandas 0-100 con token de color (genérico) ───────────────────────────────
// Tramos con su etiqueta y token de color del design system (sin hex). El token
// se aplica como clase Tailwind: bg-{token}/15 text-{token}. El helper genérico
// se reutiliza para conformidad (análisis) e importancia (informes), que tienen
// distintos cortes pero el mismo mecanismo de banda.

/** Token de color del design system (sin hex): destructive | accent | primary. */
export type ScoreToken = "destructive" | "accent" | "primary";

type Band<K extends string> = { min: number; key: K; label: string; token: ScoreToken };

/** Resuelve la banda para un valor 0-100 (se clampa fuera de rango). */
function resolveBand<K extends string>(
  value: number,
  bands: Band<K>[]
): Band<K> {
  const v = Math.max(0, Math.min(100, value));
  // Las bandas están ordenadas de mayor a menor: el primer min que cumple gana.
  return bands.find((b) => v >= b.min) ?? bands[bands.length - 1];
}

// ── Categorías de conformidad (análisis, 0-100) ──────────────────────────────

export type ConformityCategory = {
  key: "critico" | "malo" | "aceptable" | "bueno" | "excelente";
  label: string;
  token: ScoreToken;
};

const CONFORMITY_BANDS: Band<ConformityCategory["key"]>[] = [
  { min: 90, key: "excelente", label: "Excelente", token: "primary" },
  { min: 75, key: "bueno", label: "Bueno", token: "primary" },
  { min: 60, key: "aceptable", label: "Aceptable", token: "accent" },
  { min: 40, key: "malo", label: "Malo", token: "destructive" },
  { min: 0, key: "critico", label: "Crítico", token: "destructive" },
];

/** Categoría de conformidad para un valor 0-100 (se clampa fuera de rango). */
export function conformityCategory(value: number): ConformityCategory {
  const b = resolveBand(value, CONFORMITY_BANDS);
  return { key: b.key, label: b.label, token: b.token };
}

// ── Categorías de importancia (informes bromatológicos, 0-100) ───────────────
// 7 tramos definidos por dominio (docs/03 §2 Calidad): Crítico <40 … Excelente
// 90-100. Es el mismo eje 0-100 que conformidad pero con cortes propios.

export type ImportanceCategory = {
  key:
    | "critico"
    | "importante"
    | "atencion"
    | "normal"
    | "bueno"
    | "muy_bueno"
    | "excelente";
  label: string;
  token: ScoreToken;
};

const IMPORTANCE_BANDS: Band<ImportanceCategory["key"]>[] = [
  { min: 90, key: "excelente", label: "Excelente", token: "primary" },
  { min: 80, key: "muy_bueno", label: "Muy bueno", token: "primary" },
  { min: 70, key: "bueno", label: "Bueno", token: "primary" },
  { min: 50, key: "normal", label: "Normal", token: "accent" },
  { min: 40, key: "atencion", label: "Atención", token: "accent" },
  { min: 20, key: "importante", label: "Importante", token: "destructive" },
  { min: 0, key: "critico", label: "Crítico", token: "destructive" },
];

/** Categoría de importancia para un valor 0-100 (se clampa fuera de rango). */
export function importanceCategory(value: number): ImportanceCategory {
  const b = resolveBand(value, IMPORTANCE_BANDS);
  return { key: b.key, label: b.label, token: b.token };
}

// ── Análisis de laboratorio ──────────────────────────────────────────────────
// type del enum, fecha, conformidad 0-100 entera, muestra/laboratorio/obs
// opcionales (se normalizan a null para no guardar cadenas vacías).
export const analysisSchema = z.object({
  type: z.enum(ANALYSIS_TYPE_VALUES, {
    errorMap: () => ({ message: "Elegí un tipo de análisis" }),
  }),
  analysis_date: z.string().min(1, "Elegí la fecha"),
  conformity: z
    .number({ invalid_type_error: "Conformidad inválida" })
    .int("Debe ser un número entero")
    .min(0, "Mínimo 0")
    .max(100, "Máximo 100"),
  sample_code: z
    .string()
    .max(120)
    .transform((v) => v.trim() || null)
    .nullable(),
  laboratory_id: z.string().uuid().nullable(),
  observations_html: z
    .string()
    .max(8000)
    .transform((v) => v.trim() || null)
    .nullable(),
});
export type AnalysisInput = z.infer<typeof analysisSchema>;

// ── Laboratorio del catálogo del tenant ──────────────────────────────────────
// name requerido; phone/email opcionales que viven dentro del jsonb `contact`.
export const laboratorySchema = z.object({
  name: z.string().min(1, "Ingresá un nombre").max(160),
  contact: z.object({
    phone: z
      .string()
      .max(40)
      .transform((v) => v.trim() || null)
      .nullable(),
    email: z
      .string()
      .max(160)
      .transform((v) => v.trim())
      .refine((v) => v === "" || z.string().email().safeParse(v).success, {
        message: "Email inválido",
      })
      .transform((v) => v || null)
      .nullable(),
  }),
});
export type LaboratoryInput = z.infer<typeof laboratorySchema>;

// ── Informes bromatológicos ──────────────────────────────────────────────────
// content_html viene del editor enriquecido (Tiptap), que emite "<p></p>" para
// el documento vacío: lo consideramos vacío comparando el texto plano.

/** Texto plano de un HTML (quita tags y normaliza espacios). Sin deps. */
export function htmlToPlainText(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/** Extracto de texto plano para listados (recorta en límite de palabra). */
export function htmlExcerpt(
  html: string | null | undefined,
  max = 120
): string {
  const text = htmlToPlainText(html);
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

export const reportSchema = z.object({
  report_date: z.string().min(1, "Elegí la fecha"),
  content_html: z
    .string()
    .max(60000, "El informe es demasiado largo")
    .refine((v) => htmlToPlainText(v).length > 0, {
      message: "Escribí el contenido del informe",
    })
    // Defensa en escritura contra stored XSS: el HTML se reduce a la allowlist
    // del editor ANTES de persistir (el render además sanitiza al leer).
    .transform((v) => sanitizeRichHtml(v)),
  importance: z
    .number({ invalid_type_error: "Importancia inválida" })
    .int("Debe ser un número entero")
    .min(0, "Mínimo 0")
    .max(100, "Máximo 100"),
  notify_member_ids: z.array(z.string().uuid()).default([]),
});
export type ReportInput = z.infer<typeof reportSchema>;
