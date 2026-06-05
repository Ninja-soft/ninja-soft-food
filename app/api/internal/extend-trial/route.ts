import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireInternal } from "@/modules/internal/server";

// =============================================================================
// POST /api/internal/extend-trial — extiende el trial de un tenant +14 días.
//
// Defensa server-side: requireInternal() además del guard del layout. Usa admin
// client porque subscriptions/tenants no tienen policy de UPDATE para
// authenticated. Audita en audit_logs con before/after (regla dura 4).
// =============================================================================

export const runtime = "nodejs";

const TRIAL_EXTENSION_DAYS = 14;

export async function POST(req: Request) {
  const actor = await requireInternal({ api: true });
  if (!actor) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: { tenantId?: string };
  try {
    body = (await req.json()) as { tenantId?: string };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const tenantId = String(body.tenantId ?? "").trim();
  if (!tenantId) {
    return NextResponse.json({ error: "missing_tenant" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: sub, error: subErr } = await admin
    .from("subscriptions")
    .select("id, status, current_period_end")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (subErr) {
    return NextResponse.json({ error: "lookup_failed" }, { status: 500 });
  }
  if (!sub) {
    return NextResponse.json({ error: "subscription_not_found" }, { status: 404 });
  }

  // Base: la fecha de fin vigente si es futura, si no hoy.
  const now = Date.now();
  const currentEnd = sub.current_period_end
    ? new Date(sub.current_period_end).getTime()
    : now;
  const base = currentEnd > now ? currentEnd : now;
  const newEnd = new Date(
    base + TRIAL_EXTENSION_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const before = {
    status: sub.status,
    current_period_end: sub.current_period_end,
  };

  const { error: updErr } = await admin
    .from("subscriptions")
    .update({ status: "trial", current_period_end: newEnd })
    .eq("id", sub.id);
  if (updErr) {
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }

  // Sincroniza el estado del tenant (canónico vive en subscriptions).
  await admin.from("tenants").update({ status: "trial" }).eq("id", tenantId);

  await admin.from("audit_logs").insert({
    tenant_id: tenantId,
    actor_user_id: actor.userId,
    entity_type: "subscriptions",
    entity_id: sub.id,
    action: "internal_extend_trial",
    reason: `Staff Ninja-Soft · +${TRIAL_EXTENSION_DAYS} días`,
    before_data: before,
    after_data: { status: "trial", current_period_end: newEnd },
  });

  return NextResponse.json({ ok: true, current_period_end: newEnd });
}
