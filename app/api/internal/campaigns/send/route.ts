import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireInternal } from "@/modules/internal/server";
import {
  CAMPAIGN_PREFIX,
  checkRecipientLimit,
  interpolateCampaign,
  normalizeFilter,
  parseSend,
} from "@/modules/internal-campaigns/schemas";
import { resolveAudience } from "@/modules/internal-campaigns/server";
import {
  buildEmailLayout,
  renderTemplate,
  renderTemplateHtml,
} from "@/lib/emails/templates";
import { sendSystemEmail } from "@/lib/emails/enqueue";

// =============================================================================
// POST /api/internal/campaigns/send — envia una campaña a los suscriptores.
//
// Dos modos:
//   - test=true: manda UN email de prueba al staff logueado (sin tocar la
//     audiencia ni el limite). Interpola con datos de muestra.
//   - real: re-resuelve la audiencia con los filtros, valida el limite (max 200)
//     y el conteo exacto de la confirmacion (anti-cambio entre preview y envio),
//     y manda UN email por tenant al owner. Best-effort por destinatario: si uno
//     falla, sigue. El subject logueado lleva el prefijo CAMPAIGN_PREFIX para
//     derivar el historial desde system_emails (no hay columna de metadata).
//
// Todo subject/html va INLINE a sendSystemEmail (la Edge Function no re-resuelve
// template). Audita la campaña (before/after con resumen).
// =============================================================================

export const runtime = "nodejs";
// Una campaña a ~200 destinos invoca la Edge Function en serie; damos margen.
export const maxDuration = 300;

export async function POST(req: Request) {
  const actor = await requireInternal({ api: true });
  if (!actor) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = parseSend(raw);
  if (!parsed.ok || !parsed.data) {
    return NextResponse.json(
      { error: parsed.error ?? "invalid_input" },
      { status: 400 },
    );
  }
  const {
    subject: subjectTpl,
    html: bodyTpl,
    test,
    confirmCount,
  } = parsed.data;
  const filter = normalizeFilter(parsed.data.filter);

  // ── Modo prueba: un solo email al staff logueado ───────────────────────────
  if (test) {
    if (!actor.email) {
      return NextResponse.json({ error: "no_recipient" }, { status: 400 });
    }
    const sample = {
      tenantName: "Tu Negocio",
      ownerName: actor.fullName ?? "Lucas",
    };
    const subject =
      renderTemplate(interpolateCampaign(subjectTpl, sample), {}).trim() ||
      "Ninja Food";
    const html = buildEmailLayout(
      renderTemplateHtml(interpolateCampaign(bodyTpl, sample), {}),
      { negocio: "Ninja Food" },
    );
    const result = await sendSystemEmail({ to: actor.email, subject, html });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error ?? "send_failed" },
        { status: 502 },
      );
    }
    return NextResponse.json({ ok: true, test: true, to: actor.email });
  }

  // ── Modo real: re-resolver audiencia FRESCA ────────────────────────────────
  let audience;
  try {
    audience = await resolveAudience(filter);
  } catch {
    return NextResponse.json({ error: "audience_failed" }, { status: 500 });
  }

  if (audience.length === 0) {
    return NextResponse.json({ error: "empty_audience" }, { status: 400 });
  }

  // Limite de seguridad (max 200).
  const limitError = checkRecipientLimit(audience.length);
  if (limitError) {
    return NextResponse.json(
      { error: "limit_exceeded", detail: limitError, total: audience.length },
      { status: 400 },
    );
  }

  // Confirmacion fuerte: el conteo que vio el staff debe coincidir con la
  // audiencia fresca. Si cambio (alta/baja de tenant entre preview y envio),
  // abortamos y pedimos re-confirmar.
  if (typeof confirmCount === "number" && confirmCount !== audience.length) {
    return NextResponse.json(
      {
        error: "count_mismatch",
        detail: `La audiencia cambió: ahora son ${audience.length} negocios (confirmaste ${confirmCount}). Volvé a previsualizar.`,
        total: audience.length,
      },
      { status: 409 },
    );
  }

  // Envio batch best-effort: UN email por tenant al owner.
  let sent = 0;
  let failed = 0;
  for (const m of audience) {
    const subject =
      renderTemplate(interpolateCampaign(subjectTpl, m), {}).trim() ||
      "Ninja Food";
    const html = buildEmailLayout(
      renderTemplateHtml(interpolateCampaign(bodyTpl, m), {}),
      { negocio: "Ninja Food" },
    );
    // Prefijo de campaña en el subject LOGUEADO (system_emails) para derivar el
    // historial; el email que recibe el negocio NO lleva el prefijo.
    const result = await sendSystemEmail({
      to: m.ownerEmail,
      tenantId: m.tenantId,
      subject: `${CAMPAIGN_PREFIX} ${subject}`,
      html,
    });
    if (result.ok) sent += 1;
    else failed += 1;
  }

  // Auditoria de la campaña (sin tenant: es una accion de plataforma).
  const admin = createAdminClient();
  await admin.from("audit_logs").insert({
    tenant_id: null,
    actor_user_id: actor.userId,
    entity_type: "system_emails",
    entity_id: null,
    action: "internal_send_campaign",
    reason: `Staff Ninja-Soft · campaña "${subjectTpl}" a ${audience.length} negocios`,
    before_data: {
      statuses: filter.statuses,
      planKeys: filter.planKeys,
      billingModes: filter.billingModes,
      countries: filter.countries,
    },
    after_data: { total: audience.length, sent, failed, subject: subjectTpl },
  });

  return NextResponse.json({ ok: true, total: audience.length, sent, failed });
}
