import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireInternal } from "@/modules/internal/server";

// =============================================================================
// POST /api/internal/extend-subscription — extiende current_period_end de la
// suscripción para CUALQUIER estado (generaliza extend-trial, que sigue vivo y
// solo aplica a trial). NO cambia el status ni el billing_mode: solo corre la
// fecha de fin. Pensado para regalar días/meses sin alterar el modo de cobro.
//
// Admin client (sin policy UPDATE para authenticated) + requireInternal() +
// audit_logs before/after (regla dura 4 y 7).
// =============================================================================

export const runtime = "nodejs";

export async function POST(req: Request) {
  const actor = await requireInternal({ api: true });
  if (!actor) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: { tenantId?: string; days?: number; months?: number };
  try {
    body = (await req.json()) as {
      tenantId?: string;
      days?: number;
      months?: number;
    };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const tenantId = String(body.tenantId ?? "").trim();
  const days = Math.max(0, Math.floor(Number(body.days) || 0));
  const months = Math.max(0, Math.floor(Number(body.months) || 0));
  if (!tenantId) {
    return NextResponse.json({ error: "missing_tenant" }, { status: 400 });
  }
  if (days === 0 && months === 0) {
    return NextResponse.json({ error: "missing_amount" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: sub, error: subErr } = await admin
    .from("subscriptions")
    .select("id, status, is_lifetime, current_period_end")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (subErr) {
    return NextResponse.json({ error: "lookup_failed" }, { status: 500 });
  }
  if (!sub) {
    return NextResponse.json(
      { error: "subscription_not_found" },
      { status: 404 },
    );
  }
  if (sub.is_lifetime) {
    // Vitalicio no tiene fecha de fin: extender no aplica.
    return NextResponse.json({ error: "is_lifetime" }, { status: 400 });
  }

  const now = Date.now();
  const currentEnd = sub.current_period_end
    ? new Date(sub.current_period_end).getTime()
    : 0;
  const base = currentEnd > now ? currentEnd : now;
  const end = new Date(base);
  if (months > 0) end.setMonth(end.getMonth() + months);
  if (days > 0) end.setDate(end.getDate() + days);
  const newEndIso = end.toISOString();

  const before = { current_period_end: sub.current_period_end };

  const { error: updErr } = await admin
    .from("subscriptions")
    .update({ current_period_end: newEndIso })
    .eq("id", sub.id);
  if (updErr) {
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }

  await admin.from("audit_logs").insert({
    tenant_id: tenantId,
    actor_user_id: actor.userId,
    entity_type: "subscriptions",
    entity_id: sub.id,
    action: "internal_extend_subscription",
    reason: `Staff Ninja-Soft · +${months ? `${months} mes(es) ` : ""}${days ? `${days} día(s)` : ""}`.trim(),
    before_data: before,
    after_data: { current_period_end: newEndIso },
  });

  return NextResponse.json({ ok: true, current_period_end: newEndIso });
}
