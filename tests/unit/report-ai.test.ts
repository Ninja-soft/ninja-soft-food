import { describe, expect, it } from "vitest";
import {
  buildReportPrompt,
  REPORT_AI_ACTIONS,
  REPORT_HTML_SCHEMA,
  type ReportAIAction,
} from "@/modules/quality/ai";
import { sanitizeAiHtml } from "@/lib/utils/sanitizeAiHtml";

// =============================================================================
// tests/unit/report-ai.test.ts — asistencia de IA en informes bromatológicos.
// Cubre: builders de prompt PUROS (3 acciones, inclusión del HTML, reglas de
// preservación de datos) + sanitización server-safe de la salida del LLM.
// =============================================================================

const SAMPLE_HTML =
  "<h2>Análisis de agua</h2><p>Coliformes: 12 UFC/100 ml. pH 7,2. Fecha 2026-06-01.</p>";

const ACTIONS: ReportAIAction[] = ["improve", "structure", "summarize"];

// ── Builders de prompt (puros) ───────────────────────────────────────────────
describe("buildReportPrompt", () => {
  it("expone exactamente las 3 acciones en el catálogo", () => {
    expect(REPORT_AI_ACTIONS.map((a) => a.value)).toEqual(ACTIONS);
  });

  it.each(ACTIONS)("acción '%s': devuelve system/prompt/schema", (action) => {
    const { system, prompt, schema } = buildReportPrompt(action, SAMPLE_HTML);
    expect(system.length).toBeGreaterThan(0);
    expect(prompt.length).toBeGreaterThan(0);
    // El schema es siempre el de salida { html } (subset Gemini-compatible).
    expect(schema).toBe(REPORT_HTML_SCHEMA);
  });

  it.each(ACTIONS)("acción '%s': incluye el HTML original en el prompt", (a) => {
    const { prompt } = buildReportPrompt(a, SAMPLE_HTML);
    expect(prompt).toContain(SAMPLE_HTML);
  });

  it.each(ACTIONS)(
    "acción '%s': el system prohíbe inventar y cambiar datos/valores/unidades",
    (a) => {
      const { system } = buildReportPrompt(a, SAMPLE_HTML);
      expect(system).toMatch(/NO inventes/i);
      expect(system).toMatch(/NO cambies/i);
      expect(system).toMatch(/valor numérico/i);
      expect(system).toMatch(/unidad/i);
    },
  );

  it.each(ACTIONS)(
    "acción '%s': el system fija español rioplatense y estilo sin emojis/em-dash",
    (a) => {
      const { system } = buildReportPrompt(a, SAMPLE_HTML);
      expect(system).toMatch(/español rioplatense/i);
      expect(system).toMatch(/emojis/i);
      expect(system).toContain("·"); // separador punto medio
    },
  );

  it("improve: pide mejorar redacción conservando datos", () => {
    const { prompt } = buildReportPrompt("improve", SAMPLE_HTML);
    expect(prompt).toMatch(/redacci[oó]n/i);
    expect(prompt).toMatch(/EXACTAMENTE/i);
  });

  it("structure: nombra las 5 secciones estándar", () => {
    const { prompt } = buildReportPrompt("structure", SAMPLE_HTML);
    for (const s of [
      "Objeto",
      "Metodología",
      "Resultados",
      "Conclusiones",
      "Recomendaciones",
    ]) {
      expect(prompt).toContain(s);
    }
  });

  it("summarize: pide un resumen ejecutivo de 3 a 5 líneas", () => {
    const { prompt } = buildReportPrompt("summarize", SAMPLE_HTML);
    expect(prompt).toMatch(/resumen ejecutivo/i);
    expect(prompt).toMatch(/3 a 5 l[ií]neas/i);
  });

  it("usa un placeholder cuando el HTML viene vacío (no rompe)", () => {
    const { prompt } = buildReportPrompt("improve", "");
    expect(prompt).toContain("<p></p>");
  });

  it("es puro: misma entrada produce mismo prompt", () => {
    const a = buildReportPrompt("structure", SAMPLE_HTML);
    const b = buildReportPrompt("structure", SAMPLE_HTML);
    expect(a).toEqual(b);
  });
});

// ── Schema de salida (subset Gemini-compatible) ──────────────────────────────
describe("REPORT_HTML_SCHEMA", () => {
  it("es un object con un único campo string 'html' requerido", () => {
    expect(REPORT_HTML_SCHEMA.type).toBe("object");
    expect(REPORT_HTML_SCHEMA.properties.html.type).toBe("string");
    expect(REPORT_HTML_SCHEMA.required).toContain("html");
  });

  it("no usa features fuera del subset (additionalProperties/$ref/oneOf)", () => {
    const json = JSON.stringify(REPORT_HTML_SCHEMA);
    expect(json).not.toContain("additionalProperties");
    expect(json).not.toContain("$ref");
    expect(json).not.toContain("oneOf");
    expect(json).not.toContain("anyOf");
  });
});

// ── Sanitización server-safe de la salida del LLM ────────────────────────────
// sanitizeAiHtml corre en Node (route handler), sin DOMParser. Es el borde donde
// se neutraliza una salida hostil del modelo antes de mandarla al cliente.
describe("sanitizeAiHtml", () => {
  it("conserva los tags de la allowlist del editor", () => {
    const input =
      "<h2>Título</h2><p>Texto <strong>fuerte</strong> y <em>cursiva</em></p>" +
      "<ul><li>a</li></ul><blockquote>cita</blockquote>";
    expect(sanitizeAiHtml(input)).toBe(input);
  });

  it("elimina script con su contenido", () => {
    expect(sanitizeAiHtml("<p>ok</p><script>alert(1)</script>")).toBe(
      "<p>ok</p>",
    );
  });

  it("elimina style con su contenido", () => {
    expect(sanitizeAiHtml("<style>p{color:red}</style><p>ok</p>")).toBe(
      "<p>ok</p>",
    );
  });

  it("elimina iframe entero", () => {
    expect(
      sanitizeAiHtml('<p>a</p><iframe src="https://evil"></iframe>'),
    ).toBe("<p>a</p>");
  });

  it("descarta TODOS los atributos de tags permitidos (style/class/on*)", () => {
    expect(
      sanitizeAiHtml('<p style="color:red" class="x" onclick="x()">t</p>'),
    ).toBe("<p>t</p>");
  });

  it("no deja pasar href (ni siquiera en <a>): se desenvuelve", () => {
    // <a> no está en la allowlist server-safe → se descarta el wrapper.
    expect(sanitizeAiHtml('<a href="javascript:alert(1)">x</a>')).toBe("x");
  });

  it("desenvuelve tags desconocidos conservando el texto", () => {
    expect(sanitizeAiHtml("<div><span>texto</span></div>")).toBe("texto");
  });

  it("neutraliza script anidado/ofuscado", () => {
    const out = sanitizeAiHtml("<scr<script></script>ipt>alert(1)</script>");
    expect(out.toLowerCase()).not.toContain("<script");
    expect(out.toLowerCase()).not.toContain("alert");
  });

  it("quita comentarios HTML", () => {
    expect(sanitizeAiHtml("<!-- x --><p>ok</p>")).toBe("<p>ok</p>");
  });

  it("vacío permanece vacío", () => {
    expect(sanitizeAiHtml("")).toBe("");
  });
});
