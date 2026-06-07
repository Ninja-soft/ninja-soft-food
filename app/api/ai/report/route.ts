import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { tenantHasAI } from "@/lib/ai/access";
import { getActiveProvider } from "@/lib/ai/config";
import { logAIUsage } from "@/lib/ai/usage";
import { AIError } from "@/lib/ai/types";
import {
  buildReportPrompt,
  type ReportAIAction,
} from "@/modules/quality/ai";
import { sanitizeAiHtml } from "@/lib/utils/sanitizeAiHtml";

// =============================================================================
// POST /api/ai/report — asiste la redacción de un informe bromatológico con IA.
//
// La IA ASISTE, el humano CONFIRMA: este endpoint NO guarda nada. Recibe el HTML
// del editor en curso y una acción (improve | structure | summarize) y devuelve
// { html } con la propuesta. La UI muestra un preview y recién al confirmar
// vuelca el resultado en el editor (regla 5: el operario es responsable del
// registro; la IA no decide sola). El informe se guarda como borrador normal
// (reports es EDITABLE, a diferencia de form_submissions inmutable).
//
// Guardas, en orden (idénticas a /api/ai/nutrition):
//   1) sesión válida (401 si no),
//   2) tenant del claim (sin tenant → 401),
//   3) tenantHasAI(tenant) (403 { upgrade:true } si el plan no incluye IA),
//   4) provider activo configurado en /internal (503 si no hay key de plataforma).
//
// El HTML de salida se SANITIZA server-side por allowlist (sin scripts/estilos)
// antes de devolverlo; el editor y el render lo vuelven a sanitizar (defensa en
// profundidad). logAIUsage es best-effort (no rompe el flujo).
// =============================================================================

export const runtime = "nodejs"; // service_role (usage) + crypto: nunca edge.
export const dynamic = "force-dynamic";

// Tope de entrada: el cuerpo de un informe no debería superar esto; evita pasar
// payloads gigantes al provider (reportSchema admite hasta 60k al persistir).
const MAX_INPUT_HTML = 60000;

const VALID_ACTIONS: ReportAIAction[] = ["improve", "structure", "summarize"];

function isAction(v: unknown): v is ReportAIAction {
  return typeof v === "string" && (VALID_ACTIONS as string[]).includes(v);
}

export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const tenantId = user.app_metadata?.tenant_id;
  if (typeof tenantId !== "string" || !tenantId) {
    return NextResponse.json({ error: "no_tenant" }, { status: 401 });
  }

  // Gating de IA por plan/add-on/flag. 403 con upgrade para que la UI ofrezca el add-on.
  const hasAI = await tenantHasAI(tenantId);
  if (!hasAI) {
    return NextResponse.json(
      {
        error: "La asistencia con IA está disponible con el add-on de IA.",
        upgrade: true,
      },
      { status: 403 },
    );
  }

  let body: { action?: unknown; html?: unknown };
  try {
    body = (await req.json()) as { action?: unknown; html?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!isAction(body.action)) {
    return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  }
  const action = body.action;

  const html = typeof body.html === "string" ? body.html : "";
  if (html.length > MAX_INPUT_HTML) {
    return NextResponse.json({ error: "html_too_long" }, { status: 413 });
  }
  // Para resumir/estructurar hace falta contenido real; sin texto plano no hay nada.
  if (html.replace(/<[^>]*>/g, "").trim().length === 0) {
    return NextResponse.json({ error: "empty_report" }, { status: 422 });
  }

  const provider = await getActiveProvider();
  if (!provider) {
    // La key de plataforma no está configurada en /internal.
    return NextResponse.json(
      { error: "El servicio de IA no está configurado. Contactá a soporte." },
      { status: 503 },
    );
  }

  const { system, prompt, schema } = buildReportPrompt(action, html);

  let raw: unknown;
  try {
    raw = await provider.generateJson({ system, prompt, schema, maxTokens: 4096 });
  } catch (e) {
    const status = e instanceof AIError ? e.status || 502 : 502;
    return NextResponse.json(
      { error: "La asistencia con IA falló. Probá de nuevo en unos segundos." },
      { status: status >= 400 && status < 600 ? 502 : 502 },
    );
  }

  // Metering best-effort (control de costo, no rompe el flujo).
  void logAIUsage({
    tenantId,
    feature: "report_assist",
    provider: provider.providerId,
    model: "",
  });

  const proposed = extractHtml(raw);
  if (proposed === null) {
    return NextResponse.json(
      { error: "La IA devolvió un resultado inválido. Probá de nuevo." },
      { status: 502 },
    );
  }

  // Sanitización en el borde: allowlist de tags del editor, cero scripts/estilos.
  // (El editor y el render del informe vuelven a sanitizar: defensa en profundidad.)
  const html_out = sanitizeAiHtml(proposed);
  if (html_out.replace(/<[^>]*>/g, "").trim().length === 0) {
    return NextResponse.json(
      { error: "La IA devolvió un resultado vacío. Probá de nuevo." },
      { status: 502 },
    );
  }

  return NextResponse.json({ html: html_out });
}

/** Saca el string `html` de la respuesta cruda del provider. null si no hay. */
function extractHtml(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const v = (raw as Record<string, unknown>).html;
  return typeof v === "string" && v.trim().length > 0 ? v : null;
}
