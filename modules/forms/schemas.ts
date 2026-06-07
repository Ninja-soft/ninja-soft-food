import { z } from "zod";

// Builder de planillas configurables (Fase 3). Define el schema del BUILDER
// (template + fields) y arma dinámicamente el schema de VALIDACIÓN de cada
// registro (submission) a partir de los fields del template. El "semáforo"
// (ok/fail) se deriva con evaluateSubmission según los rangos min/max.
//
// Estos schemas son la única fuente de verdad de validación: los componentes no
// validan a mano (regla — lógica nunca en componentes).

// ── Tipos de campo del builder ───────────────────────────────────────────────

export const FIELD_TYPES = [
  "number",
  "text",
  "bool",
  "select",
  "temperature",
  "time",
  "photo",
  "checklist",
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  number: "Número",
  text: "Texto",
  bool: "Sí / No",
  select: "Lista de opciones",
  temperature: "Temperatura",
  time: "Hora",
  photo: "Foto adjunta",
  checklist: "Checklist",
};

/** Tipos numéricos que participan del semáforo (tienen rango min/max). */
const NUMERIC_TYPES: ReadonlySet<FieldType> = new Set([
  "number",
  "temperature",
]);

export function isNumericField(type: FieldType): boolean {
  return NUMERIC_TYPES.has(type);
}

// slug del campo: minúsculas, números y guiones bajos (clave estable en el jsonb
// `values`). Lo genera el builder a partir del label, pero se valida acá.
const fieldKeyRegex = /^[a-z][a-z0-9_]*$/;

/** Convierte un label libre en un slug válido para `key`. */
export function slugifyFieldKey(label: string): string {
  const base = label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // sin acentos (combining diacritics)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  if (!base) return "campo";
  return /^[a-z]/.test(base) ? base : `c_${base}`;
}

// ── Campo del builder ────────────────────────────────────────────────────────

export const formFieldSchema = z
  .object({
    key: z
      .string()
      .min(1, "Clave requerida")
      .max(40)
      .regex(fieldKeyRegex, "Clave inválida (minúsculas, números, guion bajo)"),
    label: z.string().min(1, "Ingresá una etiqueta").max(120),
    type: z.enum(FIELD_TYPES),
    required: z.boolean().default(false),
    min: z.number().nullable().optional(),
    max: z.number().nullable().optional(),
    // options: usado por `select` (lista) y por `checklist` (ítems tildables).
    options: z.array(z.string().min(1).max(80)).optional(),
    unit: z.string().max(16).nullable().optional(),
    // checklist: si es true, el campo solo es OK cuando TODAS las opciones están
    // tildadas (semáforo fail si falta alguna). Si es false, no evalúa fail.
    options_required: z.boolean().nullable().optional(),
  })
  .superRefine((f, ctx) => {
    if (f.type === "select" || f.type === "checklist") {
      const opts = (f.options ?? []).filter((o) => o.trim().length > 0);
      if (opts.length < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Agregá al menos una opción",
          path: ["options"],
        });
      }
    }
    if (
      isNumericField(f.type) &&
      f.min !== null &&
      f.min !== undefined &&
      f.max !== null &&
      f.max !== undefined &&
      f.min > f.max
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "El mínimo no puede ser mayor al máximo",
        path: ["max"],
      });
    }
  });
export type FormField = z.infer<typeof formFieldSchema>;

// ── Frecuencia ───────────────────────────────────────────────────────────────

export const FREQUENCY_TYPES = ["none", "daily", "weekly", "monthly"] as const;
export type FrequencyType = (typeof FREQUENCY_TYPES)[number];

export const FREQUENCY_LABELS: Record<FrequencyType, string> = {
  none: "Sin frecuencia",
  daily: "Diaria",
  weekly: "Semanal",
  monthly: "Mensual",
};

// days: 0=domingo … 6=sábado (para frecuencia semanal).
export const frequencySchema = z.object({
  type: z.enum(FREQUENCY_TYPES).default("none"),
  time: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "Hora inválida")
    .nullable()
    .optional(),
  days: z.array(z.number().int().min(0).max(6)).optional(),
});
export type Frequency = z.infer<typeof frequencySchema>;

// ── Tipo de planilla (kind) ──────────────────────────────────────────────────

export const FORM_KINDS = [
  "temperatura",
  "limpieza",
  "plagas",
  "recepcion_mp",
  "capacitacion",
  "pcc",
  "custom",
] as const;
export type FormKind = (typeof FORM_KINDS)[number];

export const FORM_KIND_LABELS: Record<FormKind, string> = {
  temperatura: "Control de temperatura",
  limpieza: "Limpieza (POES)",
  plagas: "Control de plagas",
  recepcion_mp: "Recepción de materia prima",
  capacitacion: "Capacitación",
  pcc: "Punto crítico de control (PCC)",
  custom: "Personalizada",
};

// ── Acción ante falla ────────────────────────────────────────────────────────

export const actionOnFailSchema = z
  .object({
    instructions: z
      .string()
      .max(2000)
      .transform((v) => v.trim() || null)
      .nullable()
      .optional(),
  })
  .nullable();
export type ActionOnFail = z.infer<typeof actionOnFailSchema>;

// ── Template ─────────────────────────────────────────────────────────────────

export const templateSchema = z.object({
  name: z.string().min(1, "Ingresá un nombre").max(160),
  kind: z.enum(FORM_KINDS).default("custom"),
  fields: z.array(formFieldSchema).min(1, "Agregá al menos un campo"),
  frequency: frequencySchema.default({ type: "none" }),
  requires_signature: z.boolean().default(true),
  action_on_fail: actionOnFailSchema.optional(),
});
export type TemplateInput = z.infer<typeof templateSchema>;

// ── Submission (registro): validación dinámica contra los fields ─────────────

export const SUBMISSION_STATUSES = ["ok", "fail", "corrected"] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

/**
 * Valor de un adjunto de foto dentro de `values` (jsonb). Guardamos el path del
 * objeto en el bucket privado `attachments` + el nombre original. La URL se firma
 * al leer (nunca persistimos URLs firmadas).
 */
export type PhotoValue = { path: string; name: string };

/**
 * Valor crudo de un campo del formulario tal como lo persiste el jsonb `values`.
 * El shape es ADITIVO (regla 5: submissions viejas siguen siendo válidas):
 *  - number/temperature → number | null
 *  - text/select/time   → string | null
 *  - bool               → boolean
 *  - photo              → PhotoValue | null
 *  - checklist          → string[] (opciones tildadas)
 */
export type FieldValue =
  | string
  | number
  | boolean
  | null
  | string[]
  | PhotoValue;
export type FormValues = Record<string, FieldValue>;

/** type guard: el valor es un PhotoValue persistido. */
export function isPhotoValue(value: unknown): value is PhotoValue {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as PhotoValue).path === "string"
  );
}

/** type guard: el valor es un checklist (array de strings). */
export function isChecklistValue(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

/**
 * Arma el zod del registro a partir de los fields del template. Cada tipo se
 * traduce a su validación: number/temperature con min/max, select dentro de las
 * opciones, bool, text. `required` decide si admite vacío.
 */
export function buildValuesSchema(fields: FormField[]): z.ZodType<FormValues> {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const field of fields) {
    let schema: z.ZodTypeAny;

    switch (field.type) {
      case "number":
      case "temperature": {
        let num = z.number({
          invalid_type_error: "Ingresá un número",
          required_error: "Requerido",
        });
        if (field.min !== null && field.min !== undefined) {
          num = num.min(field.min, `Mínimo ${field.min}`);
        }
        if (field.max !== null && field.max !== undefined) {
          num = num.max(field.max, `Máximo ${field.max}`);
        }
        schema = field.required ? num : num.nullable();
        break;
      }
      case "bool": {
        // El check de "required" para bool no aplica (siempre hay sí/no).
        schema = z.boolean();
        break;
      }
      case "select": {
        const opts = (field.options ?? []).filter((o) => o.length > 0);
        const base =
          opts.length > 0
            ? z.enum(opts as [string, ...string[]], {
                errorMap: () => ({ message: "Elegí una opción válida" }),
              })
            : z.string();
        schema = field.required
          ? base
          : z
              .union([base, z.literal(""), z.null()])
              .transform((v) => (v === "" ? null : v));
        break;
      }
      case "time": {
        const re = /^\d{2}:\d{2}$/;
        const base = z.string().regex(re, "Hora inválida (HH:mm)");
        schema = field.required
          ? base
          : z
              .union([base, z.literal(""), z.null()])
              .transform((v) => (v === "" ? null : (v as string | null)));
        break;
      }
      case "photo": {
        // PhotoValue persistido { path, name } o null. La carga al bucket la hace
        // la captura ANTES de enviar; acá solo validamos el shape final.
        const photo = z
          .object({ path: z.string().min(1), name: z.string().min(1) })
          .nullable();
        schema = field.required
          ? photo.refine((v) => v !== null, "Adjuntá una foto")
          : photo;
        break;
      }
      case "checklist": {
        const opts = (field.options ?? []).filter((o) => o.length > 0);
        const required = field.required;
        // Array de opciones tildadas; cada una debe pertenecer a las definidas y,
        // si es requerido, debe haber al menos una.
        schema = z.array(z.string()).superRefine((vals, ctx) => {
          if (!vals.every((v) => opts.includes(v))) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: "Opción no válida en el checklist",
            });
          }
          if (required && vals.length === 0) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: "Marcá al menos una opción",
            });
          }
        });
        break;
      }
      case "text":
      default: {
        const base = z.string().max(2000);
        schema = field.required
          ? base.min(1, "Requerido")
          : base.transform((v) => v.trim() || null).nullable();
        break;
      }
    }

    shape[field.key] = schema;
  }

  // Permitimos claves extra del jsonb (defensivo); validamos solo las definidas.
  return z.object(shape).passthrough() as unknown as z.ZodType<FormValues>;
}

/**
 * Semáforo: deriva el estado del registro a partir de los valores.
 * Devuelve 'fail' si:
 *  - algún campo numérico (number/temperature) está fuera de su rango [min, max], o
 *  - un checklist con "todas obligatorias" (options_required) no tiene todas las
 *    opciones tildadas.
 * photo y time NUNCA evalúan fail. Si no hay desvíos, 'ok'. (El estado
 * 'corrected' lo asigna el flujo de corrección, no esta función.)
 */
export function evaluateSubmission(
  fields: FormField[],
  values: FormValues
): Extract<SubmissionStatus, "ok" | "fail"> {
  for (const field of fields) {
    const raw = values[field.key];

    // Checklist con todas obligatorias: fail si falta alguna opción tildada.
    if (field.type === "checklist") {
      if (!field.options_required) continue;
      const opts = (field.options ?? []).filter((o) => o.length > 0);
      if (opts.length === 0) continue;
      const checked = isChecklistValue(raw) ? raw : [];
      const allChecked = opts.every((o) => checked.includes(o));
      if (!allChecked) return "fail";
      continue;
    }

    // Solo los numéricos participan del rango min/max. photo/time/text/etc no.
    if (!isNumericField(field.type)) continue;
    if (raw === null || raw === undefined || raw === "") {
      // Campo numérico vacío: si era requerido, lo bloquea la validación zod;
      // acá lo ignoramos para el semáforo.
      continue;
    }
    const n = typeof raw === "number" ? raw : Number(raw);
    if (Number.isNaN(n)) continue;
    if (field.min !== null && field.min !== undefined && n < field.min) {
      return "fail";
    }
    if (field.max !== null && field.max !== undefined && n > field.max) {
      return "fail";
    }
  }
  return "ok";
}
