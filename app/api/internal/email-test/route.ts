import { NextResponse } from "next/server";
import { requireInternal } from "@/modules/internal/server";
import { parseTest, sampleVars } from "@/modules/internal-emails/schemas";
import {
  buildEmailLayout,
  renderTemplate,
  renderTemplateHtml,
} from "@/lib/emails/templates";
import { sendSystemEmail } from "@/lib/emails/enqueue";

// =============================================================================
// POST /api/internal/email-test — envia un email de prueba al staff logueado.
//
// Renderiza subject (texto plano) + html (escapado, dentro del layout de marca)
// con variables de ejemplo y lo manda al email del propio staff. Pasa subject +
// html inline a sendSystemEmail (la Edge Function no re-resuelve template). El
// destinatario es SIEMPRE el actor: no se puede mandar a terceros desde aca.
// =============================================================================

export const runtime = "nodejs";

export async function POST(req: Request) {
  const actor = await requireInternal({ api: true });
  if (!actor) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!actor.email) {
    return NextResponse.json({ error: "no_recipient" }, { status: 400 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = parseTest(raw);
  if (!parsed.ok || !parsed.data) {
    return NextResponse.json(
      { error: parsed.error ?? "invalid_input" },
      { status: 400 },
    );
  }

  const vars = sampleVars("Ninja Food");
  const subject = renderTemplate(parsed.data.subject, vars).trim() || "Ninja Food";
  const html = buildEmailLayout(renderTemplateHtml(parsed.data.html, vars), {
    negocio: "Ninja Food",
  });

  const result = await sendSystemEmail({
    to: actor.email,
    subject,
    html,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "send_failed" },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true, to: actor.email });
}
