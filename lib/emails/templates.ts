// =============================================================================
// lib/emails/templates — catálogo de templates del sistema + render puro.
//
// Calcado del POS (lib/email/templates.ts: renderTemplate por {{var}} + catálogo
// de defaults). Diferencias para Ninja Food (regla dura 6 de CLAUDE.md):
//   - SIN emojis, SIN em-dashes (guion simple), separador visual punto medio (·).
//   - Layout HTML tabla 600px con header (logo del tenant o Ninja Food),
//     contenido y footer "Ninja Food · no-reply@ninjasoft.app".
//   - Español rioplatense, mobile-first, plain text fallback.
//
// Este módulo es PURO (sin Supabase, sin fetch): se importa tanto desde el
// cliente, el server y los tests. El envío real vive en lib/emails/enqueue.ts.
// =============================================================================

/** Separador visual de marca (punto medio). Nunca usar guion largo. */
export const DOT = "·";

/** Remitente/footer por defecto. Coincide con EMAIL_FROM del .env. */
export const FROM_LABEL = `Ninja Food ${DOT} no-reply@ninjasoft.app`;

export interface EmailTemplateDef {
  key: string;
  /** Etiqueta para el editor interno (español). */
  label: string;
  /** Descripción de cuándo se dispara. */
  description: string;
  /** Variables interpolables disponibles ({{var}}). */
  variables: string[];
  /** Subject por defecto (puede contener {{var}}). */
  defaultSubject: string;
  /**
   * Cuerpo por defecto del contenido (HTML simple, SIN el layout). El layout
   * 600px con header/footer lo agrega buildEmailLayout al renderizar.
   */
  defaultBody: string;
}

// Variables presentes en todos los templates (branding del tenant).
const BASE_VARS = ["negocio", "logo_url"] as const;

// -----------------------------------------------------------------------------
// Catálogo de templates del sistema (defaults globales). El override por tenant
// vive en email_templates (key + subject + html). report_notification es el
// único que se dispara hoy desde la app; el resto quedan listos para sus jobs.
// -----------------------------------------------------------------------------
export const EMAIL_TEMPLATES: EmailTemplateDef[] = [
  {
    key: "verify_account",
    label: "Verificacion de cuenta",
    description: "Confirma el email al crear la cuenta.",
    variables: [...BASE_VARS, "nombre", "link"],
    defaultSubject: "Confirma tu cuenta en Ninja Food",
    defaultBody:
      "<p>Hola {{nombre}},</p>" +
      "<p>Gracias por sumarte a Ninja Food. Para activar tu cuenta confirma tu direccion de correo.</p>" +
      '<p><a class="btn" href="{{link}}">Confirmar mi cuenta</a></p>' +
      "<p class=\"muted\">Si vos no creaste esta cuenta, podes ignorar este mensaje.</p>",
  },
  {
    key: "password_reset",
    label: "Recuperacion de contrasena",
    description: "Enlace para restablecer la contrasena.",
    variables: [...BASE_VARS, "nombre", "link"],
    defaultSubject: "Restablece tu contrasena de Ninja Food",
    defaultBody:
      "<p>Hola {{nombre}},</p>" +
      "<p>Pediste restablecer tu contrasena. El enlace vence en una hora.</p>" +
      '<p><a class="btn" href="{{link}}">Cambiar mi contrasena</a></p>' +
      "<p class=\"muted\">Si no fuiste vos, ignora este correo: tu contrasena no cambia.</p>",
  },
  {
    key: "report_notification",
    label: "Informe bromatologico notificado",
    description: "Avisa a un operario que hay un nuevo informe bromatologico.",
    variables: [...BASE_VARS, "nombre", "fecha", "importancia", "extracto", "link"],
    defaultSubject: "Nuevo informe bromatologico {{fecha}} en {{negocio}}",
    defaultBody:
      "<p>Hola {{nombre}},</p>" +
      "<p>Se registro un nuevo informe bromatologico en <strong>{{negocio}}</strong>.</p>" +
      '<table class="data" role="presentation"><tbody>' +
      "<tr><td class=\"k\">Fecha</td><td class=\"v\">{{fecha}}</td></tr>" +
      "<tr><td class=\"k\">Importancia</td><td class=\"v\">{{importancia}} / 100</td></tr>" +
      "</tbody></table>" +
      '<blockquote class="quote">{{extracto}}</blockquote>' +
      '<p><a class="btn" href="{{link}}">Ver el informe completo</a></p>',
  },
  {
    key: "stock_low",
    label: "Alerta de stock bajo",
    description: "Avisa cuando un ingrediente cae bajo su umbral.",
    variables: [...BASE_VARS, "ingrediente", "stock_actual", "umbral", "unidad", "link"],
    defaultSubject: "Stock bajo de {{ingrediente}} en {{negocio}}",
    defaultBody:
      "<p>El stock de <strong>{{ingrediente}}</strong> esta por debajo del umbral configurado.</p>" +
      '<table class="data" role="presentation"><tbody>' +
      "<tr><td class=\"k\">Stock actual</td><td class=\"v\">{{stock_actual}} {{unidad}}</td></tr>" +
      "<tr><td class=\"k\">Umbral minimo</td><td class=\"v\">{{umbral}} {{unidad}}</td></tr>" +
      "</tbody></table>" +
      '<p><a class="btn" href="{{link}}">Revisar el inventario</a></p>',
  },
  {
    key: "expiry_alert",
    label: "Alerta de vencimiento",
    description: "Aviso de vencimiento proximo (lote, RNE, RNPA o UTA-URA).",
    variables: [...BASE_VARS, "tipo", "detalle", "vence", "dias", "link"],
    defaultSubject: "Vencimiento proximo {{tipo}} en {{negocio}}",
    defaultBody:
      "<p>Hay un vencimiento de tipo <strong>{{tipo}}</strong> que requiere tu atencion.</p>" +
      '<table class="data" role="presentation"><tbody>' +
      "<tr><td class=\"k\">Detalle</td><td class=\"v\">{{detalle}}</td></tr>" +
      "<tr><td class=\"k\">Vence</td><td class=\"v\">{{vence}} (en {{dias}} dias)</td></tr>" +
      "</tbody></table>" +
      '<p><a class="btn" href="{{link}}">Ver el detalle</a></p>',
  },
  {
    key: "trial_ending",
    label: "Prueba por vencer",
    description: "Aviso 7 dias antes de que termine la prueba.",
    variables: [...BASE_VARS, "dias", "vence", "link"],
    defaultSubject: "Tu prueba de Ninja Food vence en {{dias}} dias",
    defaultBody:
      "<p>Tu periodo de prueba de <strong>{{negocio}}</strong> termina en <strong>{{dias}} dias</strong> ({{vence}}).</p>" +
      "<p>Activa tu plan para no perder acceso a la trazabilidad y los informes.</p>" +
      '<p><a class="btn" href="{{link}}">Activar mi plan</a></p>',
  },
  {
    key: "payment_confirmed",
    label: "Pago confirmado",
    description: "Confirmacion de un cobro exitoso.",
    variables: [...BASE_VARS, "monto", "plan", "periodo", "link"],
    defaultSubject: "Recibimos tu pago en Ninja Food",
    defaultBody:
      "<p>Confirmamos tu pago. Gracias por seguir con Ninja Food.</p>" +
      '<table class="data" role="presentation"><tbody>' +
      "<tr><td class=\"k\">Plan</td><td class=\"v\">{{plan}}</td></tr>" +
      "<tr><td class=\"k\">Monto</td><td class=\"v\">{{monto}}</td></tr>" +
      "<tr><td class=\"k\">Periodo</td><td class=\"v\">{{periodo}}</td></tr>" +
      "</tbody></table>" +
      '<p><a class="btn" href="{{link}}">Ver mi suscripcion</a></p>',
  },
  {
    key: "payment_failed",
    label: "Pago rechazado",
    description: "Aviso de un cobro rechazado o vencido.",
    variables: [...BASE_VARS, "monto", "plan", "link"],
    defaultSubject: "No pudimos procesar tu pago en Ninja Food",
    defaultBody:
      "<p>No pudimos procesar el pago de tu suscripcion de <strong>{{negocio}}</strong>.</p>" +
      '<table class="data" role="presentation"><tbody>' +
      "<tr><td class=\"k\">Plan</td><td class=\"v\">{{plan}}</td></tr>" +
      "<tr><td class=\"k\">Monto</td><td class=\"v\">{{monto}}</td></tr>" +
      "</tbody></table>" +
      "<p>Actualiza tu medio de pago para mantener el servicio activo y evitar la suspension.</p>" +
      '<p><a class="btn" href="{{link}}">Actualizar el pago</a></p>',
  },
];

/** Acceso indexado por key (lookup O(1) en el render). */
export const EMAIL_TEMPLATES_BY_KEY: Record<string, EmailTemplateDef> =
  Object.fromEntries(EMAIL_TEMPLATES.map((t) => [t.key, t]));

/**
 * Reemplaza {{variable}} por su valor. Si la variable falta, deja el contenido
 * vacio (no el placeholder) para no filtrar "{{var}}" al destinatario. Mismo
 * patron de regex que el POS pero con fallback a "" en vez del placeholder.
 */
export function renderTemplate(
  template: string,
  vars: Record<string, string | number | null | undefined>,
): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key: string) => {
    const value = vars[key];
    return value === undefined || value === null ? "" : String(value);
  });
}

export interface EmailLayoutOptions {
  /** Logo del tenant. Si falta, el header usa el wordmark de Ninja Food. */
  logoUrl?: string | null;
  /** Nombre del negocio para el alt del logo / fallback de header. */
  negocio?: string | null;
}

/**
 * Envuelve el contenido en el layout de marca: tabla 600px, header con logo,
 * cuerpo y footer "Ninja Food · no-reply@ninjasoft.app". Mobile-first con
 * estilos inline + media query basica. Sin hex del design system: paleta neutra
 * propia del email (los clientes de correo no leen las CSS vars de la app).
 */
export function buildEmailLayout(
  contentHtml: string,
  options: EmailLayoutOptions = {},
): string {
  const negocio = (options.negocio ?? "Ninja Food").trim() || "Ninja Food";
  const header = options.logoUrl
    ? `<img src="${options.logoUrl}" alt="${escapeHtml(negocio)}" height="36" style="display:block;max-height:36px;border:0;outline:none;text-decoration:none;" />`
    : `<span style="font-size:20px;font-weight:700;letter-spacing:-0.02em;color:#0f172a;">Ninja Food</span>`;

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="x-apple-disable-message-reformatting" />
<title></title>
<style>
  body { margin:0; padding:0; background:#f1f5f9; }
  a { color:#0f766e; }
  .btn { display:inline-block; background:#0f766e; color:#ffffff !important; text-decoration:none; padding:12px 22px; border-radius:10px; font-weight:600; }
  .data { width:100%; border-collapse:collapse; margin:16px 0; }
  .data .k { padding:8px 0; color:#64748b; font-size:14px; width:40%; }
  .data .v { padding:8px 0; color:#0f172a; font-size:14px; font-weight:600; }
  .quote { margin:16px 0; padding:12px 16px; border-left:3px solid #0f766e; background:#f8fafc; color:#334155; font-style:italic; border-radius:0 8px 8px 0; }
  .muted { color:#64748b; font-size:13px; }
  @media only screen and (max-width:600px) {
    .container { width:100% !important; }
    .px { padding-left:24px !important; padding-right:24px !important; }
  }
</style>
</head>
<body>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;">
  <tr>
    <td align="center" style="padding:32px 12px;">
      <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
        <tr>
          <td class="px" style="padding:28px 40px;border-bottom:1px solid #e2e8f0;">
            ${header}
          </td>
        </tr>
        <tr>
          <td class="px" style="padding:32px 40px;color:#0f172a;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;">
            ${contentHtml}
          </td>
        </tr>
        <tr>
          <td class="px" style="padding:24px 40px;border-top:1px solid #e2e8f0;color:#94a3b8;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;">
            ${escapeHtml(FROM_LABEL)}<br />
            Trazabilidad y gestion bromatologica.
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

/** Texto plano a partir de HTML (fallback del email). Sin deps. */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>(?=)/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// -----------------------------------------------------------------------------
// Armado del payload de la Edge Function (funcion PURA, exportada para tests).
// La Edge Function `send_email` acepta { to, subject, html } como minimo y,
// opcionalmente, { tenant_id, template_key, variables } para resolver el
// template del tenant. enqueue.ts usa esta funcion para construir el body.
// -----------------------------------------------------------------------------

export interface SendEmailPayload {
  to: string;
  tenant_id?: string;
  template_key?: string;
  subject?: string;
  html?: string;
  variables?: Record<string, string>;
}

export interface BuildPayloadArgs {
  to: string;
  tenantId?: string | null;
  templateKey?: string | null;
  subject?: string | null;
  html?: string | null;
  variables?: Record<string, string | number | null | undefined>;
}

/**
 * Normaliza los argumentos de sendSystemEmail en el body que recibe la Edge
 * Function. Mantiene to en minusculas y descarta claves vacias. Las variables
 * se serializan a string (la interpolacion final la hace la Edge Function con
 * el subject/html del template resuelto, o se hace inline si vienen subject+html).
 */
export function buildSendEmailPayload(args: BuildPayloadArgs): SendEmailPayload {
  const to = args.to.trim().toLowerCase();
  const payload: SendEmailPayload = { to };
  if (args.tenantId) payload.tenant_id = args.tenantId;
  if (args.templateKey) payload.template_key = args.templateKey;
  if (args.subject) payload.subject = args.subject;
  if (args.html) payload.html = args.html;
  if (args.variables) {
    const vars: Record<string, string> = {};
    for (const [k, v] of Object.entries(args.variables)) {
      vars[k] = v === undefined || v === null ? "" : String(v);
    }
    payload.variables = vars;
  }
  return payload;
}
