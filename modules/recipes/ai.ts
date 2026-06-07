// =============================================================================
// modules/recipes/ai — generación asistida por IA de la tabla nutricional.
//
// La IA PROPONE, el humano CONFIRMA. Este módulo tiene tres partes:
//   1) buildNutritionPrompt(...)  → PURO, testeado. Arma system+prompt+schema a
//      partir de la fórmula y el contexto de país. NO toca red.
//   2) NUTRITION_JSON_SCHEMA       → JSON Schema en el subset Gemini-compatible
//      (denominador común con Claude). Ver JSDoc de GenerateJsonInput.
//   3) generateNutrition(recipeId) → cliente: pega a /api/ai/nutrition (server),
//      que valida sesión + tenantHasAI + invoca el provider. Devuelve la
//      propuesta SIN guardar.
//
// El cálculo de SELLOS no vive acá: es determinístico (lib/globalization/
// labelThresholds.computeSeals) y no requiere IA.
// =============================================================================

import type { NutritionPer100 } from "@/lib/globalization/labelThresholds";

// Fórmula resumida que el prompt necesita: nombre + cantidad + unidad + % del total.
export type FormulaLine = {
  name: string;
  quantity: number;
  unit: string;
  /** Porcentaje sobre el total de la fórmula (0-100). */
  percent: number;
};

export type NutritionPromptContext = {
  recipeTitle: string;
  productType: string;
  /** ISO-2 del país operativo del tenant (para el formato regulatorio local). */
  country: string;
  /** Nombre del sistema de rotulado (ej. "Octógonos Ley 27.642") para contexto. */
  labelSystemName?: string | null;
  lines: FormulaLine[];
};

// ── Propuesta que devuelve la IA (forma de negocio, revalidada server-side) ──
export type AINutritionProposal = NutritionPer100;

/**
 * JSON Schema de la tabla nutricional por 100 g/ml. Subset Gemini-compatible
 * (object/number, properties+required explícitos, sin additionalProperties / $ref
 * / oneOf — ver JSDoc de GenerateJsonInput). Todos los campos son `required` para
 * forzar al modelo a estimar cada macro; el dominio acepta null/ausente igual.
 */
export const NUTRITION_JSON_SCHEMA = {
  type: "object",
  properties: {
    calories: { type: "number", description: "Energía en kcal por 100 g/ml" },
    proteins: { type: "number", description: "Proteínas en g por 100 g/ml" },
    fats: { type: "number", description: "Grasas totales en g por 100 g/ml" },
    carbs: { type: "number", description: "Hidratos de carbono en g por 100 g/ml" },
    sodium: { type: "number", description: "Sodio en MILIGRAMOS por 100 g/ml" },
    saturated_fats: { type: "number", description: "Grasas saturadas en g por 100 g/ml" },
    trans_fats: { type: "number", description: "Grasas trans en g por 100 g/ml" },
    sugars: { type: "number", description: "Azúcares totales en g por 100 g/ml" },
    fiber: { type: "number", description: "Fibra alimentaria en g por 100 g/ml" },
  },
  required: [
    "calories",
    "proteins",
    "fats",
    "carbs",
    "sodium",
    "saturated_fats",
    "trans_fats",
    "sugars",
    "fiber",
  ],
} as const;

/**
 * Arma el input de IA (system + prompt + schema) para la tabla nutricional.
 * PURO: misma entrada → misma salida, sin red. Testeado en tests/unit/ai.test.ts.
 */
export function buildNutritionPrompt(ctx: NutritionPromptContext): {
  system: string;
  prompt: string;
  schema: object;
} {
  const system = [
    "Sos un bromatólogo experto en composición de alimentos.",
    "A partir de la fórmula de un producto (ingredientes, cantidades y porcentajes),",
    "estimás la tabla de información nutricional POR 100 g (sólidos) o POR 100 ml",
    "(líquidos) usando valores de referencia de tablas de composición de alimentos.",
    "Devolvés SIEMPRE números (sin texto, sin unidades dentro del valor):",
    "calorías en kcal, macros en gramos, y SODIO en MILIGRAMOS.",
    "Si un ingrediente no aporta cierto nutriente, su contribución es 0, no lo omitas.",
    "Las grasas saturadas y trans son subconjuntos de las grasas totales (sat+trans ≤ fats).",
    "Los azúcares son un subconjunto de los hidratos (sugars ≤ carbs).",
    "Es una ESTIMACIÓN para revisión humana: priorizá coherencia entre macros y energía.",
  ].join(" ");

  const lines = ctx.lines.length
    ? ctx.lines
        .map(
          (l) =>
            `- ${l.name}: ${formatNum(l.quantity)} ${l.unit} (${formatNum(l.percent)}% de la fórmula)`,
        )
        .join("\n")
    : "(sin ingredientes cargados)";

  const labelNote = ctx.labelSystemName
    ? `El producto se rotula según el sistema "${ctx.labelSystemName}" del país ${ctx.country}.`
    : `País de comercialización: ${ctx.country}.`;

  const prompt = [
    `Producto: ${ctx.recipeTitle} (tipo: ${ctx.productType}).`,
    labelNote,
    "Fórmula (porcentajes sobre el total):",
    lines,
    "",
    "Estimá la tabla nutricional por 100 g/ml de este producto terminado.",
    "Considerá pérdidas/concentraciones razonables del proceso si aplica.",
  ].join("\n");

  return { system, prompt, schema: NUTRITION_JSON_SCHEMA };
}

function formatNum(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

// ── Cliente: llama al route handler server-side ──────────────────────────────

export type GenerateNutritionResult =
  | { ok: true; proposal: AINutritionProposal }
  | { ok: false; status: number; error: string; upgrade?: boolean };

/**
 * Pide al backend la propuesta de tabla nutricional para una receta. NO guarda:
 * el caller llena el form (editable) y el usuario confirma al guardar la receta.
 * Devuelve un resultado discriminado para que la UI muestre el mensaje correcto
 * (403 con upgrade=true → "Disponible con el add-on IA").
 */
export async function generateNutrition(
  recipeId: string,
): Promise<GenerateNutritionResult> {
  let res: Response;
  try {
    res = await fetch("/api/ai/nutrition", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ recipeId }),
    });
  } catch {
    return { ok: false, status: 0, error: "No se pudo contactar al servicio de IA." };
  }

  let body: {
    proposal?: AINutritionProposal;
    error?: string;
    upgrade?: boolean;
  } = {};
  try {
    body = (await res.json()) as typeof body;
  } catch {
    // sin cuerpo parseable
  }

  if (!res.ok || !body.proposal) {
    return {
      ok: false,
      status: res.status,
      error: body.error ?? "La generación con IA falló. Probá de nuevo.",
      upgrade: body.upgrade,
    };
  }
  return { ok: true, proposal: body.proposal };
}
