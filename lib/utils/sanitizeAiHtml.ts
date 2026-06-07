// Sanitizador HTML server-safe (sin DOMParser) para la salida de IA en informes.
//
// Por qué existe: sanitizeRichHtml (lib/utils/sanitizeHtml.ts) usa DOMParser, que
// NO existe en el runtime Node de los route handlers. La salida de un LLM no es
// confiable (podría devolver script/style/handlers aunque se lo prohíba el
// prompt), así que se sanitiza en el BORDE, antes de mandarla al cliente. Es la
// MISMA allowlist de tags que el editor (StarterKit heading 2/3) y el sanitizador
// de render; defensa en profundidad: el cliente y el render vuelven a sanitizar.
//
// Estrategia sin deps: 1) eliminar enteros los tags peligrosos con su contenido,
// 2) quitar TODOS los atributos de los tags permitidos (cero on*, style, href),
// 3) descartar el wrapper de cualquier tag fuera de la allowlist conservando su
// texto interno, 4) neutralizar comentarios. Conservador a propósito.

const ALLOWED_TAGS = new Set([
  "p",
  "strong",
  "b",
  "em",
  "i",
  "s",
  "u",
  "h2",
  "h3",
  "ul",
  "ol",
  "li",
  "blockquote",
  "br",
  "hr",
  "code",
  "pre",
]);

// Tags cuyo CONTENIDO también se descarta (no solo el wrapper).
const DROP_CONTENT_TAGS = [
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "link",
  "meta",
  "svg",
  "math",
  "template",
  "form",
  "input",
  "button",
  "textarea",
  "head",
];

/**
 * Sanitiza HTML producido por IA a la allowlist del editor, en cualquier runtime
 * (no usa DOM). Elimina scripts/estilos/iframes y TODOS los atributos. Seguro
 * para devolver al cliente, que lo vuelve a sanitizar antes de renderizar.
 */
export function sanitizeAiHtml(html: string): string {
  if (!html) return "";
  let out = html;

  // 1) Comentarios fuera (pueden esconder conditional comments / payloads).
  out = out.replace(/<!--[\s\S]*?-->/g, "");

  // 2) Tags peligrosos con su contenido. Se corre hasta que no quede ninguno
  //    (defensa contra anidamiento del estilo <scr<script>ipt>).
  for (const tag of DROP_CONTENT_TAGS) {
    const open = new RegExp(`<${tag}\\b[\\s\\S]*?</${tag}\\s*>`, "gi");
    const selfOrUnclosed = new RegExp(`<${tag}\\b[^>]*>`, "gi");
    let prev: string;
    do {
      prev = out;
      out = out.replace(open, "");
    } while (out !== prev);
    // Restos sin cierre (p. ej. <script ...> sin </script>): tag y resto fuera.
    out = out.replace(selfOrUnclosed, "");
    out = out.replace(new RegExp(`</${tag}\\s*>`, "gi"), "");
  }

  // 3) Recorre cada tag. Permitidos → se reemiten SIN atributos. No permitidos →
  //    se descarta el wrapper conservando el texto interno (que es solo texto y
  //    tags ya filtrados en pasadas previas).
  out = out.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?(\/?)>/g, (_m, rawName: string, selfClose: string) => {
    const name = rawName.toLowerCase();
    const closing = _m.startsWith("</");
    if (!ALLOWED_TAGS.has(name)) return ""; // wrapper fuera; contenido (texto) queda.
    if (name === "br" || name === "hr") return `<${name} />`;
    if (closing) return `</${name}>`;
    return selfClose ? `<${name}></${name}>` : `<${name}>`;
  });

  return out.trim();
}
