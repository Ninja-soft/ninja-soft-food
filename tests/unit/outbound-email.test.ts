import { describe, expect, it } from "vitest";
import {
  attachmentsFit,
  base64Bytes,
  checkRateLimit,
  enforceTypography,
  isTypographyClean,
  isValidEmail,
  MAX_ATTACHMENTS_BYTES,
  MAX_RECIPIENTS,
  normalizeRecipients,
  RATE_LIMIT_PER_HOUR,
  RATE_LIMIT_WINDOW_MS,
  sendEmailSchema,
  totalAttachmentBytes,
  type EmailAttachment,
} from "@/modules/outbound-email/schemas";

// =============================================================================
// tests/unit/outbound-email — validacion del envio manual de documentos:
// regla dura 6 (asunto/mensaje sin emojis ni em-dash), destinatarios, limite de
// tamano de adjuntos y rate limit (funcion pura).
// =============================================================================

const EM_DASH = "—";
const EN_DASH = "–";

describe("isTypographyClean / enforceTypography — regla 6", () => {
  it("acepta texto limpio con punto medio", () => {
    expect(isTypographyClean("Planilla de producción · PROD-00012")).toBe(true);
  });

  it("rechaza emojis", () => {
    expect(isTypographyClean("Gracias por tu compra 😀")).toBe(false);
  });

  it("rechaza em-dash y en-dash", () => {
    expect(isTypographyClean(`Informe ${EM_DASH} mayo`)).toBe(false);
    expect(isTypographyClean(`rango ${EN_DASH} 2026`)).toBe(false);
  });

  it("enforceTypography reemplaza em/en-dash por guion simple", () => {
    expect(enforceTypography(`a ${EM_DASH} b`)).toBe("a - b");
    expect(enforceTypography(`a ${EN_DASH} b`)).toBe("a - b");
  });

  it("enforceTypography elimina emojis", () => {
    expect(enforceTypography("hola 😀 mundo")).not.toMatch(/😀/);
  });

  it("enforceTypography deja pasar el punto medio", () => {
    expect(enforceTypography("Acme · planilla")).toBe("Acme · planilla");
  });
});

describe("isValidEmail / normalizeRecipients", () => {
  it("valida formas minimas", () => {
    expect(isValidEmail("a@b.com")).toBe(true);
    expect(isValidEmail("sin-arroba.com")).toBe(false);
    expect(isValidEmail("a@b")).toBe(false);
  });

  it("normaliza a minusculas, sin vacios ni duplicados", () => {
    expect(
      normalizeRecipients(["  A@B.com ", "a@b.com", "", "c@d.com"]),
    ).toEqual(["a@b.com", "c@d.com"]);
  });
});

describe("sendEmailSchema — payload del envio manual", () => {
  const base = {
    to: ["cliente@ejemplo.com"],
    subject: "Planilla de producción · PROD-00012",
    message: "Te paso la planilla.",
  };

  it("acepta un payload valido y normaliza destinatarios", () => {
    const r = sendEmailSchema.safeParse({
      ...base,
      to: ["  Cliente@Ejemplo.com "],
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.to).toEqual(["cliente@ejemplo.com"]);
  });

  it("exige al menos un destinatario", () => {
    const r = sendEmailSchema.safeParse({ ...base, to: [] });
    expect(r.success).toBe(false);
  });

  it("rechaza email invalido en la lista", () => {
    const r = sendEmailSchema.safeParse({ ...base, to: ["ok@a.com", "roto"] });
    expect(r.success).toBe(false);
  });

  it("rechaza mas de MAX_RECIPIENTS destinatarios", () => {
    const many = Array.from({ length: MAX_RECIPIENTS + 1 }, (_, i) => `u${i}@a.com`);
    const r = sendEmailSchema.safeParse({ ...base, to: many });
    expect(r.success).toBe(false);
  });

  it("rechaza asunto con emoji (regla 6)", () => {
    const r = sendEmailSchema.safeParse({ ...base, subject: "Hola 🎉" });
    expect(r.success).toBe(false);
  });

  it("rechaza asunto con em-dash (regla 6)", () => {
    const r = sendEmailSchema.safeParse({ ...base, subject: `Informe ${EM_DASH} mayo` });
    expect(r.success).toBe(false);
  });

  it("rechaza mensaje con emoji (regla 6)", () => {
    const r = sendEmailSchema.safeParse({ ...base, message: "Gracias 😀" });
    expect(r.success).toBe(false);
  });

  it("acepta mensaje vacio (es opcional)", () => {
    const r = sendEmailSchema.safeParse({ ...base, message: "" });
    expect(r.success).toBe(true);
  });

  it("exige asunto no vacio", () => {
    const r = sendEmailSchema.safeParse({ ...base, subject: "   " });
    expect(r.success).toBe(false);
  });
});

describe("limite de tamano de adjuntos", () => {
  function attOf(bytes: number): EmailAttachment {
    // base64 de N bytes ocupa ~ceil(N/3)*4 chars; generamos esa longitud.
    const chars = Math.ceil(bytes / 3) * 4;
    return { filename: "x.pdf", contentType: "application/pdf", content: "A".repeat(chars) };
  }

  it("base64Bytes aproxima el tamano decodificado", () => {
    // "AAAA" (4 chars, sin padding) -> 3 bytes.
    expect(base64Bytes("AAAA")).toBe(3);
  });

  it("suma el peso de varios adjuntos", () => {
    const list = [attOf(1024), attOf(2048)];
    expect(totalAttachmentBytes(list)).toBeGreaterThanOrEqual(1024 + 2048 - 8);
  });

  it("acepta adjuntos dentro del limite", () => {
    expect(attachmentsFit([attOf(MAX_ATTACHMENTS_BYTES - 1024)])).toBe(true);
  });

  it("rechaza adjuntos que superan el limite total", () => {
    expect(attachmentsFit([attOf(MAX_ATTACHMENTS_BYTES + 4096)])).toBe(false);
  });

  it("rechaza la suma aunque cada uno entre solo", () => {
    const half = Math.floor(MAX_ATTACHMENTS_BYTES * 0.6);
    expect(attachmentsFit([attOf(half), attOf(half)])).toBe(false);
  });
});

describe("checkRateLimit — rate limit suave por tenant", () => {
  const NOW = 1_700_000_000_000;

  it("permite cuando esta por debajo del limite", () => {
    const r = checkRateLimit([NOW - 1000, NOW - 2000], NOW);
    expect(r.allowed).toBe(true);
    expect(r.used).toBe(2);
    expect(r.remaining).toBe(RATE_LIMIT_PER_HOUR - 2);
    expect(r.retryAfterMs).toBe(0);
  });

  it("bloquea al alcanzar el limite y calcula retryAfter", () => {
    // RATE_LIMIT_PER_HOUR envios, el mas viejo hace 10 min.
    const oldest = NOW - 10 * 60 * 1000;
    const stamps = Array.from(
      { length: RATE_LIMIT_PER_HOUR },
      (_, i) => oldest + i * 1000,
    );
    const r = checkRateLimit(stamps, NOW);
    expect(r.allowed).toBe(false);
    expect(r.used).toBe(RATE_LIMIT_PER_HOUR);
    expect(r.remaining).toBe(0);
    // Falta que el mas viejo salga de la ventana de 1h.
    expect(r.retryAfterMs).toBe(oldest + RATE_LIMIT_WINDOW_MS - NOW);
    expect(r.retryAfterMs).toBeGreaterThan(0);
  });

  it("ignora envios fuera de la ventana", () => {
    const stale = NOW - (RATE_LIMIT_WINDOW_MS + 60_000);
    const r = checkRateLimit([stale, stale, stale], NOW);
    expect(r.used).toBe(0);
    expect(r.allowed).toBe(true);
  });

  it("cuenta el borde inicial de la ventana como dentro (>= inclusivo)", () => {
    // El borde exacto (now - windowMs) cuenta como dentro, igual que la query del
    // server (.gte). Un ms antes ya queda fuera.
    const onEdge = NOW - RATE_LIMIT_WINDOW_MS; // == windowStart → dentro
    expect(checkRateLimit([onEdge], NOW).used).toBe(1);
    expect(checkRateLimit([onEdge - 1], NOW).used).toBe(0);
  });
});
