import { z } from "zod";
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

// ── Categorías de conformidad (0-100) ────────────────────────────────────────
// Tramos con su etiqueta y token de color del design system (sin hex). El token
// se aplica como clase Tailwind: bg-{token}/15 text-{token}.

export type ConformityCategory = {
  key: "critico" | "malo" | "aceptable" | "bueno" | "excelente";
  label: string;
  /** Token de color del design system (sin hex): destructive | accent | primary. */
  token: "destructive" | "accent" | "primary";
};

const CONFORMITY_BANDS: { min: number; category: ConformityCategory }[] = [
  { min: 90, category: { key: "excelente", label: "Excelente", token: "primary" } },
  { min: 75, category: { key: "bueno", label: "Bueno", token: "primary" } },
  { min: 60, category: { key: "aceptable", label: "Aceptable", token: "accent" } },
  { min: 40, category: { key: "malo", label: "Malo", token: "destructive" } },
  { min: 0, category: { key: "critico", label: "Crítico", token: "destructive" } },
];

/** Categoría de conformidad para un valor 0-100 (se clampa fuera de rango). */
export function conformityCategory(value: number): ConformityCategory {
  const v = Math.max(0, Math.min(100, value));
  // Las bandas están ordenadas de mayor a menor: el primer min que cumple gana.
  return (
    CONFORMITY_BANDS.find((b) => v >= b.min)?.category ??
    CONFORMITY_BANDS[CONFORMITY_BANDS.length - 1].category
  );
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
