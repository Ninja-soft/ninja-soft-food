import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireInternal } from "@/modules/internal/server";
import { parseTemplate } from "@/modules/internal-emails/schemas";
import { EMAIL_TEMPLATES_BY_KEY } from "@/lib/emails/templates";

// =============================================================================
// POST /api/internal/email-templates — guarda un override GLOBAL de plantilla.
//
// Persiste subject/html por `key` en system_email_templates (solo service_role).
// La key debe existir en el catalogo (lib/emails/templates). El schema aplica el
// guard de la regla dura 6 (sin emojis, sin em-dashes). Audita before/after.
// =============================================================================

export const runtime = "nodejs";

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

  const parsed = parseTemplate(raw);
  if (!parsed.ok || !parsed.data) {
    return NextResponse.json(
      { error: parsed.error ?? "invalid_input" },
      { status: 400 },
    );
  }
  const { key, subject, html } = parsed.data;

  // La key tiene que ser una del catalogo del sistema (no plantillas libres).
  if (!EMAIL_TEMPLATES_BY_KEY[key]) {
    return NextResponse.json({ error: "unknown_template" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: current } = await admin
    .from("system_email_templates")
    .select("subject, html")
    .eq("key", key)
    .maybeSingle();

  const { error: upErr } = await admin.from("system_email_templates").upsert(
    {
      key,
      subject,
      html,
      updated_by: actor.userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );
  if (upErr) {
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }

  await admin.from("audit_logs").insert({
    tenant_id: null,
    actor_user_id: actor.userId,
    entity_type: "system_email_templates",
    entity_id: null,
    action: "internal_update_email_template",
    reason: `Staff Ninja-Soft · plantilla ${key}`,
    before_data: current
      ? { subject: current.subject, html: current.html }
      : null,
    after_data: { subject, html },
  });

  return NextResponse.json({ ok: true });
}

// DELETE: vuelve la plantilla al default de codigo (borra el override global).
export async function DELETE(req: Request) {
  const actor = await requireInternal({ api: true });
  if (!actor) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const key = String(searchParams.get("key") ?? "").trim();
  if (!key || !EMAIL_TEMPLATES_BY_KEY[key]) {
    return NextResponse.json({ error: "unknown_template" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: current } = await admin
    .from("system_email_templates")
    .select("subject, html")
    .eq("key", key)
    .maybeSingle();
  if (!current) return NextResponse.json({ ok: true }); // ya estaba en default

  const { error } = await admin
    .from("system_email_templates")
    .delete()
    .eq("key", key);
  if (error) {
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }

  await admin.from("audit_logs").insert({
    tenant_id: null,
    actor_user_id: actor.userId,
    entity_type: "system_email_templates",
    entity_id: null,
    action: "internal_reset_email_template",
    reason: `Staff Ninja-Soft · plantilla ${key} vuelta al default`,
    before_data: { subject: current.subject, html: current.html },
    after_data: null,
  });

  return NextResponse.json({ ok: true });
}
