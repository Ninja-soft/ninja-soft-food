// =============================================================================
// modules/quality/ai — asistencia de IA en la redacción de informes bromatológicos.
//
// La IA ASISTE, el humano CONFIRMA y GUARDA. Tres partes:
//   1) buildReportPrompt(action, html) → PURO, testeado. Arma system+prompt+schema
//      por acción. NO toca red. El informe NUNCA pierde sus datos: el prompt
//      prohíbe inventar o alterar valores numéricos, unidades, fechas y nombres.
//   2) REPORT_HTML_SCHEMA → JSON Schema (subset Gemini-compatible) de salida { html }.
//   3) assistReport(action, html) → cliente: pega a /api/ai/report (server), que
//      valida sesión + tenantHasAI + invoca el provider. Devuelve { html } SIN guardar.
//
// El informe se edita como borrador normal (reports es EDITABLE, a diferencia de
// form_submissions que es inmutable, docs/03 §2/§3). La IA reemplaza el contenido
// del editor SOLO tras confirmación humana con preview (regla 5: el operario es
// responsable del registro; la IA no decide sola).
// =============================================================================

/** Acciones de asistencia sobre el HTML del informe en curso. */
export type ReportAIAction = "improve" | "structure" | "summarize";

export const REPORT_AI_ACTIONS: {
  value: ReportAIAction;
  label: string;
  hint: string;
}[] = [
  {
    value: "improve",
    label: "Mejorar redacción",
    hint: "Pule el estilo técnico sin tocar los datos.",
  },
  {
    value: "structure",
    label: "Estructurar en secciones",
    hint: "Objeto · metodología · resultados · conclusiones · recomendaciones.",
  },
  {
    value: "summarize",
    label: "Resumen ejecutivo",
    hint: "3 a 5 líneas para anteponer al informe.",
  },
];

/**
 * JSON Schema de la salida. Subset Gemini-compatible (object/string, properties +
 * required explícitos, sin additionalProperties / $ref / oneOf — ver JSDoc de
 * GenerateJsonInput). Un único campo `html`: el cuerpo enriquecido propuesto.
 */
export const REPORT_HTML_SCHEMA = {
  type: "object",
  properties: {
    html: {
      type: "string",
      description:
        "El informe en HTML simple (solo p, strong, em, h2, h3, ul, ol, li, blockquote). Sin estilos, sin scripts.",
    },
  },
  required: ["html"],
} as const;

/** Propuesta que devuelve la IA (revalidada/sanitizada server-side). */
export type AIReportProposal = { html: string };

// Reglas comunes a las tres acciones: nunca tocar datos, estilo del producto.
// El estilo de emails (regla 6: sin emojis, sin em-dashes, separador ·) lo
// hereda todo el producto, así que la IA escribe igual.
const COMMON_RULES = [
  "Reglas innegociables:",
  "- NO inventes datos, valores, resultados ni conclusiones que no estén en el texto original.",
  "- NO cambies ningún valor numérico, unidad de medida, fecha, código de muestra ni nombre propio.",
  "- Si un dato no está en el original, NO lo agregues ni lo supongas.",
  "- Escribí en español rioplatense, registro técnico y profesional.",
  "- NO uses emojis ni guiones largos (em-dash). Como separador usá el punto medio ·.",
  "- Devolvé HTML simple: solo p, strong, em, h2, h3, ul, ol, li, blockquote. Sin estilos inline, sin scripts, sin clases.",
].join("\n");

/**
 * Arma el input de IA (system + prompt + schema) para una acción sobre el HTML
 * del informe. PURO: misma entrada → misma salida, sin red. Testeado.
 */
export function buildReportPrompt(
  action: ReportAIAction,
  html: string,
): { system: string; prompt: string; schema: object } {
  const source = html?.trim() ? html.trim() : "<p></p>";

  let role: string;
  let task: string;

  switch (action) {
    case "improve":
      role =
        "Sos un bromatólogo experto que edita informes técnicos de control de calidad de alimentos.";
      task = [
        "Mejorá la redacción técnica del siguiente informe bromatológico:",
        "claridad, precisión terminológica y tono profesional.",
        "Conservá EXACTAMENTE todos los datos, valores y conclusiones del original.",
        "No agregues secciones nuevas ni contenido que no esté presente.",
      ].join(" ");
      break;
    case "structure":
      role =
        "Sos un bromatólogo experto que organiza informes técnicos de control de calidad de alimentos.";
      task = [
        "Reorganizá el contenido del siguiente informe bromatológico en las secciones estándar,",
        "cada una con su título (h3): Objeto, Metodología, Resultados, Conclusiones y Recomendaciones.",
        "Ubicá cada dato del original en la sección que corresponda SIN modificarlo.",
        "Si una sección no tiene contenido en el original, omitila (no inventes texto para llenarla).",
      ].join(" ");
      break;
    case "summarize":
      role =
        "Sos un bromatólogo experto que redacta resúmenes ejecutivos de informes de control de calidad de alimentos.";
      task = [
        "Redactá un resumen ejecutivo de 3 a 5 líneas del siguiente informe bromatológico,",
        "para anteponer al cuerpo del informe.",
        "Sintetizá el objeto, el hallazgo principal y la conclusión, usando solo lo presente en el original.",
        "Devolvé únicamente el resumen (un par de párrafos), no el informe completo.",
      ].join(" ");
      break;
  }

  const system = `${role}\n\n${COMMON_RULES}`;

  const prompt = [
    task,
    "",
    "Informe original (HTML):",
    source,
    "",
    'Devolvé el resultado en el campo "html" del objeto pedido.',
  ].join("\n");

  return { system, prompt, schema: REPORT_HTML_SCHEMA };
}

// ── Cliente: llama al route handler server-side ──────────────────────────────

export type AssistReportResult =
  | { ok: true; html: string }
  | { ok: false; status: number; error: string; upgrade?: boolean };

/**
 * Pide al backend asistir el informe con IA. NO guarda: el caller muestra un
 * preview, el humano confirma y recién entonces se vuelca en el editor. Devuelve
 * un resultado discriminado para que la UI muestre el mensaje correcto (403 con
 * upgrade=true → "Disponible con el add-on IA").
 */
export async function assistReport(
  action: ReportAIAction,
  html: string,
): Promise<AssistReportResult> {
  let res: Response;
  try {
    res = await fetch("/api/ai/report", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, html }),
    });
  } catch {
    return {
      ok: false,
      status: 0,
      error: "No se pudo contactar al servicio de IA.",
    };
  }

  let body: { html?: string; error?: string; upgrade?: boolean } = {};
  try {
    body = (await res.json()) as typeof body;
  } catch {
    // sin cuerpo parseable
  }

  if (!res.ok || typeof body.html !== "string") {
    return {
      ok: false,
      status: res.status,
      error: body.error ?? "La asistencia con IA falló. Probá de nuevo.",
      upgrade: body.upgrade,
    };
  }
  return { ok: true, html: body.html };
}
