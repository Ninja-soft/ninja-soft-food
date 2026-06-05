// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { sanitizeRichHtml } from "@/lib/utils/sanitizeHtml";

// Sanitizador de informes (allowlist Tiptap). Crítico: stored XSS — un miembro
// del tenant puede escribir content_html por el cliente Supabase directo.
describe("sanitizeRichHtml", () => {
  it("conserva los tags del editor", () => {
    const input =
      "<h2>Título</h2><p>Texto <strong>fuerte</strong> y <em>cursiva</em></p>" +
      "<ul><li>a</li><li>b</li></ul><blockquote>cita</blockquote>";
    expect(sanitizeRichHtml(input)).toBe(input);
  });

  it("elimina script con su contenido", () => {
    expect(
      sanitizeRichHtml("<p>hola</p><script>alert(1)</script>"),
    ).toBe("<p>hola</p>");
  });

  it("elimina handlers on* (img onerror)", () => {
    const out = sanitizeRichHtml('<img src=x onerror="alert(1)" /><p>ok</p>');
    expect(out).not.toContain("onerror");
    expect(out).not.toContain("<img");
    expect(out).toContain("<p>ok</p>");
  });

  it("elimina svg/onload enteros", () => {
    expect(sanitizeRichHtml('<svg onload="alert(1)"><circle /></svg>')).toBe("");
  });

  it("descarta atributos en tags permitidos (style, class, id)", () => {
    expect(
      sanitizeRichHtml('<p style="color:red" class="x" id="y">t</p>'),
    ).toBe("<p>t</p>");
  });

  it("desenvuelve tags desconocidos conservando el contenido", () => {
    expect(sanitizeRichHtml("<div><span>texto</span></div>")).toBe("texto");
  });

  it("permite <a> solo con href http(s) y fuerza rel/target seguros", () => {
    const ok = sanitizeRichHtml('<a href="https://example.com">link</a>');
    expect(ok).toContain('href="https://example.com"');
    expect(ok).toContain('rel="noopener noreferrer"');

    const js = sanitizeRichHtml("<a href=\"javascript:alert(1)\">x</a>");
    expect(js).toBe("x");
  });

  it("escapa texto con caracteres HTML", () => {
    expect(sanitizeRichHtml("<p>a &lt; b</p>")).toBe("<p>a &lt; b</p>");
  });

  it("vacío permanece vacío", () => {
    expect(sanitizeRichHtml("")).toBe("");
  });
});
