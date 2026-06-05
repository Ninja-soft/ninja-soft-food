// =============================================================================
// Edge Function: send_email — envia un email del sistema por SMTP propio.
//
// Calcada del POS (supabase/functions/send_email: Deno + denomailer + SMTPClient,
// config en system_email_smtp solo service_role). Diferencias para Ninja Food:
//   - Resuelve TEMPLATES: { tenant_id?, template_key | subject+html, to, variables }.
//     Override por tenant en email_templates (con fallback al catalogo global de
//     abajo). Interpolacion {{var}}.
//   - LOGUEA todo envio en system_emails (pending -> sent | failed + error_message).
//   - Esquema de system_email_smtp de Food: hostname/port/secure/username/
//     password/from_email/from_name (el POS usa host/secure).
//   - Auth: la funcion la invoca el backend con service_role (sin sesion de
//     usuario) desde lib/emails/enqueue. No exige is_internal como el POS porque
//     los disparadores son del sistema (informes, billing, alertas).
//
// Deploy (lo hace Lucas, NO esta sesion): supabase functions deploy send_email
// Secrets necesarios (supabase secrets set): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// La config SMTP NO es secret: vive en la tabla system_email_smtp.
// =============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...cors, "Content-Type": "application/json" },
  });
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// -----------------------------------------------------------------------------
// Catalogo de defaults globales (espejo de lib/emails/templates.ts). Se usa
// cuando el tenant no tiene override en email_templates. Mantener en sync con
// el catalogo del repo. SIN emojis, SIN em-dashes, separador punto medio (regla
// dura 6 de CLAUDE.md).
// -----------------------------------------------------------------------------
const DOT = "·"; // punto medio
const FROM_LABEL = `Ninja Food ${DOT} no-reply@ninjasoft.app`;

interface DefaultTemplate {
  subject: string;
  body: string;
}
const DEFAULT_TEMPLATES: Record<string, DefaultTemplate> = {
  welcome: {
    subject: "Bienvenido a Ninja Food",
    body:
      "<p>Hola {{nombre}},</p><p><strong>{{negocio}}</strong> ya esta activo en Ninja Food. Tenes {{dias_trial}} dias de prueba con todas las funciones: trazabilidad con QR, planillas BPM/POES, stock con lotes y recall en minutos.</p>" +
      "<p>Te sugerimos empezar cargando tus ingredientes y recetas.</p>" +
      '<p><a class="btn" href="{{link}}">Entrar a mi panel</a></p>' +
      '<p class="muted">Avalado tecnicamente por Asesoria Bromatologica Rosario.</p>',
  },
  verify_account: {
    subject: "Confirma tu cuenta en Ninja Food",
    body:
      "<p>Hola {{nombre}},</p><p>Gracias por sumarte a Ninja Food. Para activar tu cuenta confirma tu direccion de correo.</p>" +
      '<p><a class="btn" href="{{link}}">Confirmar mi cuenta</a></p>' +
      '<p class="muted">Si vos no creaste esta cuenta, podes ignorar este mensaje.</p>',
  },
  password_reset: {
    subject: "Restablece tu contrasena de Ninja Food",
    body:
      "<p>Hola {{nombre}},</p><p>Pediste restablecer tu contrasena. El enlace vence en una hora.</p>" +
      '<p><a class="btn" href="{{link}}">Cambiar mi contrasena</a></p>' +
      '<p class="muted">Si no fuiste vos, ignora este correo: tu contrasena no cambia.</p>',
  },
  report_notification: {
    subject: "Nuevo informe bromatologico {{fecha}} en {{negocio}}",
    body:
      "<p>Hola {{nombre}},</p><p>Se registro un nuevo informe bromatologico en <strong>{{negocio}}</strong>.</p>" +
      '<table class="data" role="presentation"><tbody>' +
      '<tr><td class="k">Fecha</td><td class="v">{{fecha}}</td></tr>' +
      '<tr><td class="k">Importancia</td><td class="v">{{importancia}} / 100</td></tr></tbody></table>' +
      '<blockquote class="quote">{{extracto}}</blockquote>' +
      '<p><a class="btn" href="{{link}}">Ver el informe completo</a></p>',
  },
  stock_low: {
    subject: "Stock bajo de {{ingrediente}} en {{negocio}}",
    body:
      "<p>El stock de <strong>{{ingrediente}}</strong> esta por debajo del umbral configurado.</p>" +
      '<table class="data" role="presentation"><tbody>' +
      '<tr><td class="k">Stock actual</td><td class="v">{{stock_actual}} {{unidad}}</td></tr>' +
      '<tr><td class="k">Umbral minimo</td><td class="v">{{umbral}} {{unidad}}</td></tr></tbody></table>' +
      '<p><a class="btn" href="{{link}}">Revisar el inventario</a></p>',
  },
  expiry_alert: {
    subject: "Vencimiento proximo {{tipo}} en {{negocio}}",
    body:
      "<p>Hay un vencimiento de tipo <strong>{{tipo}}</strong> que requiere tu atencion.</p>" +
      '<table class="data" role="presentation"><tbody>' +
      '<tr><td class="k">Detalle</td><td class="v">{{detalle}}</td></tr>' +
      '<tr><td class="k">Vence</td><td class="v">{{vence}} (en {{dias}} dias)</td></tr></tbody></table>' +
      '<p><a class="btn" href="{{link}}">Ver el detalle</a></p>',
  },
  trial_ending: {
    subject: "Tu prueba de Ninja Food vence en {{dias}} dias",
    body:
      "<p>Tu periodo de prueba de <strong>{{negocio}}</strong> termina en <strong>{{dias}} dias</strong> ({{vence}}).</p>" +
      "<p>Activa tu plan para no perder acceso a la trazabilidad y los informes.</p>" +
      '<p><a class="btn" href="{{link}}">Activar mi plan</a></p>',
  },
  payment_confirmed: {
    subject: "Recibimos tu pago en Ninja Food",
    body:
      "<p>Confirmamos tu pago. Gracias por seguir con Ninja Food.</p>" +
      '<table class="data" role="presentation"><tbody>' +
      '<tr><td class="k">Plan</td><td class="v">{{plan}}</td></tr>' +
      '<tr><td class="k">Monto</td><td class="v">{{monto}}</td></tr>' +
      '<tr><td class="k">Periodo</td><td class="v">{{periodo}}</td></tr></tbody></table>' +
      '<p><a class="btn" href="{{link}}">Ver mi suscripcion</a></p>',
  },
  payment_failed: {
    subject: "No pudimos procesar tu pago en Ninja Food",
    body:
      "<p>No pudimos procesar el pago de tu suscripcion de <strong>{{negocio}}</strong>.</p>" +
      '<table class="data" role="presentation"><tbody>' +
      '<tr><td class="k">Plan</td><td class="v">{{plan}}</td></tr>' +
      '<tr><td class="k">Monto</td><td class="v">{{monto}}</td></tr></tbody></table>' +
      "<p>Actualiza tu medio de pago para mantener el servicio activo y evitar la suspension.</p>" +
      '<p><a class="btn" href="{{link}}">Actualizar el pago</a></p>',
  },
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderTemplate(tpl: string, vars: Record<string, unknown>): string {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key: string) => {
    const v = vars[key];
    return v === undefined || v === null ? "" : String(v);
  });
}

// Variables interpoladas en contexto HTML: SIEMPRE escapadas. Valores como
// tenants.name o members.full_name los controla el tenant y no pueden inyectar
// markup en el cuerpo del mail. El template en sí es contenido confiado.
function renderTemplateHtml(
  tpl: string,
  vars: Record<string, unknown>,
): string {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key: string) => {
    const v = vars[key];
    return v === undefined || v === null ? "" : escapeHtml(String(v));
  });
}

function buildLayout(
  content: string,
  opts: { logoUrl?: string | null; negocio?: string | null },
): string {
  const negocio = (opts.negocio ?? "Ninja Food").trim() || "Ninja Food";
  const header = opts.logoUrl
    ? `<img src="${opts.logoUrl}" alt="${escapeHtml(negocio)}" height="36" style="display:block;max-height:36px;border:0;outline:none;text-decoration:none;" />`
    : `<span style="font-size:20px;font-weight:700;letter-spacing:-0.02em;color:#0f172a;">Ninja Food</span>`;
  return `<!doctype html>
<html lang="es"><head>
<meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="x-apple-disable-message-reformatting" />
<style>
  body { margin:0; padding:0; background:#f1f5f9; }
  a { color:#0f766e; }
  .btn { display:inline-block; background:#0f766e; color:#ffffff !important; text-decoration:none; padding:12px 22px; border-radius:10px; font-weight:600; }
  .data { width:100%; border-collapse:collapse; margin:16px 0; }
  .data .k { padding:8px 0; color:#64748b; font-size:14px; width:40%; }
  .data .v { padding:8px 0; color:#0f172a; font-size:14px; font-weight:600; }
  .quote { margin:16px 0; padding:12px 16px; border-left:3px solid #0f766e; background:#f8fafc; color:#334155; font-style:italic; border-radius:0 8px 8px 0; }
  .muted { color:#64748b; font-size:13px; }
  @media only screen and (max-width:600px) { .container { width:100% !important; } .px { padding-left:24px !important; padding-right:24px !important; } }
</style></head>
<body>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;"><tr>
<td align="center" style="padding:32px 12px;">
<table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
<tr><td class="px" style="padding:28px 40px;border-bottom:1px solid #e2e8f0;">${header}</td></tr>
<tr><td class="px" style="padding:32px 40px;color:#0f172a;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;">${content}</td></tr>
<tr><td class="px" style="padding:24px 40px;border-top:1px solid #e2e8f0;color:#94a3b8;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;">${escapeHtml(FROM_LABEL)}<br />Trazabilidad y gestion bromatologica.</td></tr>
</table></td></tr></table>
</body></html>`;
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
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

interface Body {
  to?: string;
  tenant_id?: string | null;
  template_key?: string | null;
  subject?: string | null;
  html?: string | null;
  variables?: Record<string, unknown> | null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  let b: Body;
  try {
    b = (await req.json()) as Body;
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const to = String(b.to ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(to)) return json({ error: "invalid_to" }, 400);
  const tenantId = b.tenant_id ?? null;
  const vars: Record<string, unknown> = { ...(b.variables ?? {}) };

  // 1) Resolver subject + cuerpo. Prioridad:
  //    a) subject+html directos en el body (ad-hoc).
  //    b) template del tenant en email_templates (override).
  //    c) default global del catalogo.
  let subjectTpl = "";
  let bodyTpl = "";
  let inlineHtml = false;

  if (b.subject && b.html) {
    subjectTpl = String(b.subject);
    bodyTpl = String(b.html);
    inlineHtml = true; // se asume layout completo provisto por el llamador
  } else {
    const key = String(b.template_key ?? "").trim();
    if (!key) return json({ error: "missing_template_or_html" }, 400);

    if (tenantId) {
      const { data: tpl } = await admin
        .from("email_templates")
        .select("subject, html, enabled")
        .eq("tenant_id", tenantId)
        .eq("key", key)
        .maybeSingle();
      if (tpl && tpl.enabled !== false) {
        subjectTpl = String(tpl.subject ?? "");
        bodyTpl = String(tpl.html ?? "");
      }
    }
    if (!bodyTpl) {
      const def = DEFAULT_TEMPLATES[key];
      if (!def) return json({ error: "unknown_template", detail: key }, 400);
      subjectTpl = def.subject;
      bodyTpl = def.body;
    }
  }

  // Subject: texto plano (sin escape HTML). Body: contexto HTML (escapado).
  const subject = renderTemplate(subjectTpl, vars).trim() || "Ninja Food";
  const renderedBody = renderTemplateHtml(bodyTpl, vars);
  const html = inlineHtml
    ? renderedBody
    : buildLayout(renderedBody, {
        logoUrl: typeof vars.logo_url === "string" ? vars.logo_url : null,
        negocio: typeof vars.negocio === "string" ? vars.negocio : null,
      });
  const text = htmlToText(html);

  // 2) Registrar el envio en system_emails (pending). Es la fuente de verdad del
  //    log; si el insert falla seguimos igual (no bloqueamos el envio).
  let logId: string | null = null;
  {
    const { data: row } = await admin
      .from("system_emails")
      .insert({
        tenant_id: tenantId,
        recipient: to,
        subject,
        html_content: html,
        status: "pending",
      })
      .select("id")
      .maybeSingle();
    logId = row?.id ?? null;
  }

  const markFailed = async (msg: string) => {
    if (!logId) return;
    await admin
      .from("system_emails")
      .update({ status: "failed", error_message: msg.slice(0, 1000) })
      .eq("id", logId);
  };

  // 3) Config SMTP (solo service_role). Esquema de Food: hostname/secure/...
  const { data: cfg } = await admin
    .from("system_email_smtp")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (!cfg?.hostname || !cfg?.from_email) {
    await markFailed("smtp_not_configured");
    return json(
      { error: "smtp_not_configured", detail: "Configura el SMTP en system_email_smtp." },
      400,
    );
  }

  // 4) Enviar por SMTP (denomailer, identico al POS).
  const client = new SMTPClient({
    connection: {
      hostname: cfg.hostname,
      port: cfg.port || 587,
      tls: !!cfg.secure,
      auth: cfg.username ? { username: cfg.username, password: cfg.password } : undefined,
    },
  });
  try {
    await client.send({
      from: `${cfg.from_name || "Ninja Food"} <${cfg.from_email}>`,
      to,
      subject,
      content: text || "Este mensaje se ve mejor con un cliente que soporte HTML.",
      html,
    });
    await client.close();
  } catch (e) {
    try {
      await client.close();
    } catch (_) {
      /* noop */
    }
    const msg = e instanceof Error ? e.message : String(e);
    await markFailed(msg);
    return json({ error: "send_failed", detail: msg }, 502);
  }

  // 5) Marcar como enviado.
  if (logId) {
    await admin
      .from("system_emails")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("id", logId);
  }
  return json({ ok: true, id: logId });
});
