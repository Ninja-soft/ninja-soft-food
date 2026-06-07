import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireInternal } from "@/modules/internal/server";

// =============================================================================
// POST /api/internal/users/set-active — suspende o reactiva una cuenta global.
//
// Suspender = ban en auth (auth.admin.updateUserById con ban_duration). El user
// no puede iniciar sesión mientras esté baneado. Reactivar = ban_duration:"none".
// Guard: no podés suspenderte a vos mismo. Auditado before/after (regla dura 4).
// =============================================================================

export const runtime = "nodejs";

// Ban efectivamente permanente (100 años). Reactivar lo limpia con "none".
const BAN_DURATION = "876000h";

export async function POST(req: Request) {
  const actor = await requireInternal({ api: true });
  if (!actor) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: { userId?: string; active?: boolean };
  try {
    body = (await req.json()) as { userId?: string; active?: boolean };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const userId = String(body.userId ?? "").trim();
  const active = Boolean(body.active);
  if (!userId) {
    return NextResponse.json({ error: "missing_user" }, { status: 400 });
  }
  if (userId === actor.userId && !active) {
    return NextResponse.json({ error: "cannot_suspend_self" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: current, error: getErr } =
    await admin.auth.admin.getUserById(userId);
  if (getErr || !current.user) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }
  const beforeBanned =
    (current.user as { banned_until?: string | null }).banned_until ?? null;

  const { error: updErr } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: active ? "none" : BAN_DURATION,
  });
  if (updErr) {
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }

  await admin.from("audit_logs").insert({
    tenant_id: null,
    actor_user_id: actor.userId,
    entity_type: "auth_user",
    entity_id: userId,
    action: active ? "internal_user_reactivate" : "internal_user_suspend",
    reason: `Staff Ninja-Soft · ${
      active ? "reactivación" : "suspensión"
    } de cuenta (${current.user.email ?? userId})`,
    before_data: { banned_until: beforeBanned },
    after_data: { suspended: !active },
  });

  return NextResponse.json({ ok: true, suspended: !active });
}
