import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireInternal } from "@/modules/internal/server";

// =============================================================================
// POST /api/internal/change-plan — cambia el plan de un tenant desde la consola.
//
// El estado canónico vive en subscriptions (regla dura 7). Acá solo movemos el
// plan_id; NO tocamos status ni período (eso lo hacen las acciones de cobro). El
// catálogo es plans (subscriptions.plan_id → plans.id). Admin client (sin policy
// UPDATE para authenticated) + defensa requireInternal(). Audita before/after.
// =============================================================================

export const runtime = "nodejs";

export async function POST(req: Request) {
  const actor = await requireInternal({ api: true });
  if (!actor) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: { tenantId?: string; planId?: string };
  try {
    body = (await req.json()) as { tenantId?: string; planId?: string };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const tenantId = String(body.tenantId ?? "").trim();
  const planId = String(body.planId ?? "").trim();
  if (!tenantId) {
    return NextResponse.json({ error: "missing_tenant" }, { status: 400 });
  }
  if (!planId) {
    return NextResponse.json({ error: "missing_plan" }, { status: 400 });
  }

  const admin = createAdminClient();

  const [{ data: sub }, { data: plan }] = await Promise.all([
    admin
      .from("subscriptions")
      .select("id, plan_id, plans(key, name)")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    admin
      .from("plans")
      .select("id, key, name")
      .eq("id", planId)
      .eq("is_active", true)
      .maybeSingle(),
  ]);
  if (!sub) {
    return NextResponse.json(
      { error: "subscription_not_found" },
      { status: 404 },
    );
  }
  if (!plan) {
    return NextResponse.json({ error: "plan_not_found" }, { status: 404 });
  }

  const prevPlan = sub.plans as { key: string; name: string } | null;
  const before = { plan_id: sub.plan_id, plan_key: prevPlan?.key ?? null };

  const { error: updErr } = await admin
    .from("subscriptions")
    .update({ plan_id: plan.id })
    .eq("id", sub.id);
  if (updErr) {
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }

  await admin.from("audit_logs").insert({
    tenant_id: tenantId,
    actor_user_id: actor.userId,
    entity_type: "subscriptions",
    entity_id: sub.id,
    action: "internal_change_plan",
    reason: `Staff Ninja-Soft · plan ${prevPlan?.key ?? "—"} -> ${plan.key}`,
    before_data: before,
    after_data: { plan_id: plan.id, plan_key: plan.key },
  });

  return NextResponse.json({ ok: true, planKey: plan.key });
}
