import { describe, expect, it } from "vitest";
import {
  EMAIL_TEMPLATES,
  EMAIL_TEMPLATES_BY_KEY,
  FROM_LABEL,
  DOT,
  renderTemplate,
  buildEmailLayout,
  buildSendEmailPayload,
  htmlToPlainText,
} from "@/lib/emails/templates";

// =============================================================================
// tests/unit/emails — interpolacion {{}}, regla dura 6 (sin emojis, sin
// em-dashes) sobre los templates seed, y shape del payload de la Edge Function.
// =============================================================================

// Regex de emojis (rangos de pictogramas / simbolos / banderas). \u FE0F es el
// selector de variacion emoji; ❤ corazon, etc.
const EMOJI_RE =
  /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{1F1E6}-\u{1F1FF}\u{2190}-\u{21FF}\u{2300}-\u{23FF}]/u;

const EM_DASH = "—"; // —
const EN_DASH = "–"; // –

describe("renderTemplate — interpolacion {{var}}", () => {
  it("reemplaza variables presentes", () => {
    expect(renderTemplate("Hola {{nombre}}", { nombre: "Ana" })).toBe("Hola Ana");
  });

  it("tolera espacios dentro de las llaves", () => {
    expect(renderTemplate("{{  nombre  }}", { nombre: "Ana" })).toBe("Ana");
  });

  it("reemplaza multiples ocurrencias", () => {
    expect(renderTemplate("{{x}}-{{x}}-{{y}}", { x: "1", y: "2" })).toBe("1-1-2");
  });

  it("serializa numeros a string", () => {
    expect(renderTemplate("{{n}}/100", { n: 87 })).toBe("87/100");
  });

  it("vacia variables ausentes o null (no filtra el placeholder)", () => {
    expect(renderTemplate("a{{falta}}b", {})).toBe("ab");
    expect(renderTemplate("a{{x}}b", { x: null })).toBe("ab");
    expect(renderTemplate("a{{x}}b", { x: undefined })).toBe("ab");
  });

  it("no toca texto sin placeholders", () => {
    expect(renderTemplate("texto plano", { x: "1" })).toBe("texto plano");
  });
});

describe("buildEmailLayout — layout de marca", () => {
  it("usa el wordmark Ninja Food si no hay logo", () => {
    const html = buildEmailLayout("<p>hola</p>");
    expect(html).toContain("Ninja Food");
    expect(html).not.toContain("<img");
    expect(html).toContain("width=\"600\"");
    expect(html).toContain(FROM_LABEL);
  });

  it("usa el logo del tenant cuando se provee", () => {
    const html = buildEmailLayout("<p>hola</p>", {
      logoUrl: "https://cdn.example.com/logo.png",
      negocio: "La Jamonera",
    });
    expect(html).toContain("<img");
    expect(html).toContain("https://cdn.example.com/logo.png");
    expect(html).toContain('alt="La Jamonera"');
  });

  it("escapa el nombre del negocio en el alt", () => {
    const html = buildEmailLayout("<p>x</p>", {
      logoUrl: "x",
      negocio: '"><script>',
    });
    expect(html).not.toContain('alt=""><script>');
    expect(html).toContain("&lt;script&gt;");
  });

  it("el footer lleva el separador punto medio, no guion largo", () => {
    const html = buildEmailLayout("<p>x</p>");
    expect(html).toContain(DOT);
    expect(html).not.toContain(EM_DASH);
  });
});

describe("htmlToPlainText — fallback de texto", () => {
  it("quita tags y normaliza espacios", () => {
    expect(htmlToPlainText("<p>Hola <strong>Ana</strong></p>")).toContain("Hola Ana");
  });

  it("descarta el bloque <style> del layout", () => {
    const txt = htmlToPlainText(buildEmailLayout("<p>cuerpo</p>"));
    expect(txt).not.toContain("font-family");
    expect(txt).toContain("cuerpo");
  });
});

describe("buildSendEmailPayload — shape del body de la Edge Function", () => {
  it("normaliza el destinatario a minusculas y arma con template", () => {
    const p = buildSendEmailPayload({
      to: "  OWNER@Example.COM  ",
      tenantId: "t1",
      templateKey: "payment_failed",
      variables: { negocio: "Acme", monto: 1000 },
    });
    expect(p).toEqual({
      to: "owner@example.com",
      tenant_id: "t1",
      template_key: "payment_failed",
      variables: { negocio: "Acme", monto: "1000" },
    });
  });

  it("omite claves vacias / ausentes", () => {
    const p = buildSendEmailPayload({ to: "a@b.com" });
    expect(p).toEqual({ to: "a@b.com" });
    expect(p).not.toHaveProperty("tenant_id");
    expect(p).not.toHaveProperty("template_key");
    expect(p).not.toHaveProperty("variables");
  });

  it("soporta el modo subject+html ad-hoc", () => {
    const p = buildSendEmailPayload({
      to: "a@b.com",
      subject: "Asunto",
      html: "<p>x</p>",
    });
    expect(p.subject).toBe("Asunto");
    expect(p.html).toBe("<p>x</p>");
    expect(p.template_key).toBeUndefined();
  });

  it("serializa variables null/undefined a cadena vacia", () => {
    const p = buildSendEmailPayload({
      to: "a@b.com",
      variables: { a: null, b: undefined, c: 0 },
    });
    expect(p.variables).toEqual({ a: "", b: "", c: "0" });
  });
});

describe("regla dura 6 — templates del catalogo", () => {
  it("hay al menos los templates del MVP", () => {
    const keys = EMAIL_TEMPLATES.map((t) => t.key);
    for (const k of [
      "verify_account",
      "password_reset",
      "report_notification",
      "stock_low",
      "expiry_alert",
      "trial_ending",
      "payment_confirmed",
      "payment_failed",
    ]) {
      expect(keys).toContain(k);
    }
  });

  it("el indice por key coincide con el catalogo", () => {
    for (const t of EMAIL_TEMPLATES) {
      expect(EMAIL_TEMPLATES_BY_KEY[t.key]).toBe(t);
    }
  });

  it("ningun subject ni cuerpo tiene emojis", () => {
    for (const t of EMAIL_TEMPLATES) {
      expect(EMOJI_RE.test(t.defaultSubject), `subject ${t.key}`).toBe(false);
      expect(EMOJI_RE.test(t.defaultBody), `body ${t.key}`).toBe(false);
      expect(EMOJI_RE.test(t.label), `label ${t.key}`).toBe(false);
    }
  });

  it("ningun subject ni cuerpo tiene em-dash ni en-dash", () => {
    for (const t of EMAIL_TEMPLATES) {
      expect(t.defaultSubject.includes(EM_DASH), `subject em-dash ${t.key}`).toBe(false);
      expect(t.defaultSubject.includes(EN_DASH), `subject en-dash ${t.key}`).toBe(false);
      expect(t.defaultBody.includes(EM_DASH), `body em-dash ${t.key}`).toBe(false);
      expect(t.defaultBody.includes(EN_DASH), `body en-dash ${t.key}`).toBe(false);
    }
  });

  it("el layout completo (subject + cuerpo renderizado) no introduce emojis ni em-dashes", () => {
    for (const t of EMAIL_TEMPLATES) {
      const vars = Object.fromEntries(t.variables.map((v) => [v, "x"]));
      const html = buildEmailLayout(renderTemplate(t.defaultBody, vars), {
        negocio: "Acme",
      });
      expect(EMOJI_RE.test(html), `html emoji ${t.key}`).toBe(false);
      expect(html.includes(EM_DASH), `html em-dash ${t.key}`).toBe(false);
    }
  });

  it("el separador de marca es el punto medio", () => {
    expect(DOT).toBe("·");
    expect(FROM_LABEL).toContain(DOT);
    expect(FROM_LABEL).toContain("no-reply@ninjasoft.app");
  });
});
