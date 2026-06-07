import { describe, expect, it } from "vitest";
import {
  checkTypography,
  parseSmtp,
  parseTemplate,
  parseTest,
  sampleVars,
  typographyMessage,
} from "@/modules/internal-emails/schemas";

describe("checkTypography — guard de la regla dura 6", () => {
  it("no marca texto limpio (incluido el punto medio ·)", () => {
    expect(checkTypography("Ninja Food · trazabilidad", "subject")).toEqual([]);
    expect(checkTypography("Hola, todo en orden - sin novedades.", "body")).toEqual(
      [],
    );
  });

  it("detecta emojis", () => {
    const issues = checkTypography("Bienvenido 🎉", "subject");
    expect(issues).toHaveLength(1);
    expect(issues[0]?.kind).toBe("emoji");
    expect(issues[0]?.field).toBe("subject");
  });

  it("detecta em-dash y en-dash", () => {
    expect(checkTypography("Pago confirmado — gracias", "body")[0]?.kind).toBe(
      "em_dash",
    );
    expect(checkTypography("plan – mensual", "body")[0]?.kind).toBe("em_dash");
  });

  it("acumula varias violaciones", () => {
    const issues = checkTypography("Hola 🚀 — listo", "body");
    expect(issues.map((i) => i.kind).sort()).toEqual(["em_dash", "emoji"]);
  });

  it("typographyMessage devuelve texto legible por tipo", () => {
    expect(typographyMessage({ field: "subject", kind: "emoji" })).toMatch(
      /emoji/i,
    );
    expect(typographyMessage({ field: "body", kind: "em_dash" })).toMatch(
      /guion/i,
    );
  });
});

describe("parseSmtp — validación de la config SMTP", () => {
  const valid = {
    hostname: "smtp.ninjasoft.app",
    port: 587,
    username: "no-reply@ninjasoft.app",
    password: "secret",
    from_email: "no-reply@ninjasoft.app",
    from_name: "Ninja Food",
    secure: true,
  };

  it("acepta una config completa", () => {
    const r = parseSmtp(valid);
    expect(r.ok).toBe(true);
    expect(r.data?.hostname).toBe("smtp.ninjasoft.app");
  });

  it("acepta password ausente (no cambiar)", () => {
    const { password: _omit, ...rest } = valid;
    void _omit;
    expect(parseSmtp(rest).ok).toBe(true);
  });

  it("rechaza puerto fuera de rango", () => {
    expect(parseSmtp({ ...valid, port: 0 }).ok).toBe(false);
    expect(parseSmtp({ ...valid, port: 70000 }).ok).toBe(false);
  });

  it("rechaza from_email inválido y hostname vacío", () => {
    expect(parseSmtp({ ...valid, from_email: "no-es-email" }).ok).toBe(false);
    expect(parseSmtp({ ...valid, hostname: "" }).ok).toBe(false);
  });
});

describe("parseTemplate — override global con guard regla 6", () => {
  it("acepta una plantilla limpia", () => {
    const r = parseTemplate({
      key: "welcome",
      subject: "Bienvenido a Ninja Food",
      html: "<p>Hola {{nombre}}, ya estas activo.</p>",
    });
    expect(r.ok).toBe(true);
  });

  it("rechaza si el contenido trae emojis", () => {
    const r = parseTemplate({
      key: "welcome",
      subject: "Bienvenido",
      html: "<p>Listo 🎉</p>",
    });
    expect(r.ok).toBe(false);
  });

  it("rechaza si el asunto trae em-dash", () => {
    const r = parseTemplate({
      key: "welcome",
      subject: "Pago — confirmado",
      html: "<p>ok</p>",
    });
    expect(r.ok).toBe(false);
  });

  it("rechaza campos vacíos", () => {
    expect(parseTemplate({ key: "welcome", subject: "", html: "<p>x</p>" }).ok).toBe(
      false,
    );
  });
});

describe("parseTest + sampleVars", () => {
  it("valida el payload del envío de prueba", () => {
    expect(parseTest({ subject: "Hola", html: "<p>x</p>" }).ok).toBe(true);
    expect(parseTest({ subject: "", html: "<p>x</p>" }).ok).toBe(false);
  });

  it("sampleVars cubre todas las variables y no introduce em-dash ni emojis", () => {
    const vars = sampleVars("Mi Negocio");
    expect(vars.negocio).toBe("Mi Negocio");
    for (const value of Object.values(vars)) {
      expect(checkTypography(value, "body")).toEqual([]);
    }
  });
});
