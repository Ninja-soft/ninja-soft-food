// Sanitizador HTML por allowlist para contenido enriquecido (informes Tiptap).
//
// Por qué existe: el HTML de reports.content_html lo produce NUESTRO editor en
// el camino feliz, pero cualquier miembro del tenant puede escribir por el
// cliente Supabase directo (RLS permite same-tenant), así que el render NUNCA
// puede confiar en que el editor fue el único camino de escritura (stored XSS).
// Sin DOMPurify (sin deps nuevas): DOMParser nativo + allowlist estricta.
//
// Estrategia conservadora: solo se conservan los tags que genera nuestro
// RichTextEditor (StarterKit con heading 2/3) y NINGÚN atributo salvo href en
// <a> con esquema http(s). Todo lo demás se elimina (el texto interno de tags
// desconocidos inline se conserva; script/style/iframe se eliminan enteros).

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
  "a",
]);

/** Tags cuyo CONTENIDO también se descarta (no solo el wrapper). */
const DROP_CONTENT_TAGS = new Set([
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
]);

function escapeText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function isSafeHref(href: string): boolean {
  try {
    const url = new URL(href, "https://placeholder.invalid");
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function serializeNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return escapeText(node.textContent ?? "");
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return ""; // comentarios, CDATA, etc.

  const el = node as Element;
  const tag = el.tagName.toLowerCase();

  if (DROP_CONTENT_TAGS.has(tag)) return "";

  const children = Array.from(el.childNodes).map(serializeNode).join("");

  if (!ALLOWED_TAGS.has(tag)) {
    // Tag desconocido: se descarta el wrapper pero se conserva el contenido ya
    // sanitizado (p. ej. <div> o <span> que pegó el usuario).
    return children;
  }

  if (tag === "br" || tag === "hr") return `<${tag} />`;

  // Único atributo permitido en todo el documento: href http(s) en <a>.
  if (tag === "a") {
    const href = el.getAttribute("href") ?? "";
    if (isSafeHref(href)) {
      const safe = escapeText(href).replace(/"/g, "&quot;");
      return `<a href="${safe}" rel="noopener noreferrer" target="_blank">${children}</a>`;
    }
    return children;
  }

  return `<${tag}>${children}</${tag}>`;
}

/**
 * Sanitiza HTML a la allowlist del editor de informes. Seguro contra XSS
 * almacenado: elimina scripts, handlers (on*), estilos, iframes y cualquier
 * atributo. Si DOMParser no está disponible (SSR), devuelve el texto escapado:
 * preferimos perder formato antes que renderizar HTML sin sanitizar.
 */
export function sanitizeRichHtml(html: string): string {
  if (!html) return "";
  if (typeof window === "undefined" || typeof DOMParser === "undefined") {
    return `<p>${escapeText(html.replace(/<[^>]*>/g, " "))}</p>`;
  }
  const doc = new DOMParser().parseFromString(html, "text/html");
  return Array.from(doc.body.childNodes).map(serializeNode).join("");
}
