import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireInternal } from "@/modules/internal/server";

// =============================================================================
// POST /api/internal/addon — otorga o cancela el add-on IA de un tenant.
//
// action = "grant":  inserta/reactiva subscription_addons (addon_key 'ai',
//          source 'granted', status 'active'). El índice unique parcial garantiza
//          un solo activo por (tenant, addon).
// action = "cancel": status 'cancelled' + deleted_at (libera el unique parcial).
//
// Admin client + requireInternal() + audit before/after.
// =============================================================================

export const runtime = "nodejs";

const ADDON_KEY = "ai";

export async function POST(req: Request) {
  const actor = await requireInternal({ api: true });
  if (!actor) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: { tenantId?: string; action?: string };
  try {
    body = (await req.json()) as { tenantId?: string; action?: string };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const tenantId = String(body.tenantId ?? "").trim();
  const action = String(body.action ?? "").trim();
  if (!tenantId) {
    return NextResponse.json({ error: "missing_tenant" }, { status: 400 });
  }
  if (action !== "grant" && action !== "cancel") {
    return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: sub } = await admin
    .from("subscriptions")
    .select("id")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const { data: existing } = await admin
    .from("subscription_addons")
    .select("id, status, source")
    .eq("tenant_id", tenantId)
    .eq("addon_key", ADDON_KEY)
    .is("deleted_at", null)
    .eq("status", "active")
    .maybeSingle();

  if (action === "grant") {
    if (existing) {
      return NextResponse.json({ ok: true, alreadyActive: true });
    }
    const { error } = await admin.from("subscription_addons").insert({
      tenant_id: tenantId,
      subscription_id: sub?.id ?? null,
      addon_key: ADDON_KEY,
      status: "active",
      source: "granted",
    });
    if (error) {
      return NextResponse.json({ error: "insert_failed" }, { status: 500 });
    }
    await admin.from("audit_logs").insert({
      tenant_id: tenantId,
      actor_user_id: actor.userId,
      entity_type: "subscription_addons",
      action: "internal_grant_addon",
      reason: "Staff Ninja-Soft · add-on IA otorgado (cortesía)",
      after_data: { addon_key: ADDON_KEY, source: "granted", status: "active" },
    });
    return NextResponse.json({ ok: true });
  }

  // cancel
  if (!existing) {
    return NextResponse.json({ ok: true, alreadyInactive: true });
  }
  const { error } = await admin
    .from("subscription_addons")
    .update({ status: "cancelled", deleted_at: new Date().toISOString() })
    .eq("id", existing.id);
  if (error) {
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }
  await admin.from("audit_logs").insert({
    tenant_id: tenantId,
    actor_user_id: actor.userId,
    entity_type: "subscription_addons",
    entity_id: existing.id,
    action: "internal_cancel_addon",
    reason: "Staff Ninja-Soft · add-on IA cancelado",
    before_data: { status: existing.status, source: existing.source },
    after_data: { status: "cancelled" },
  });
  return NextResponse.json({ ok: true });
}
