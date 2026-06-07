import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireInternal } from "@/modules/internal/server";

// =============================================================================
// POST /api/internal/staff/set-internal — alta/baja de staff Ninja-Soft.
//
// Food usa un boolean is_internal (NO niveles como el POS). El alta se hace por
// email (la persona ya debe tener cuenta). Guard: no podés quitarte el acceso a
// vos mismo. Auditado before/after (regla dura 4). users no tiene policy de
// UPDATE para authenticated → admin client.
// =============================================================================

export const runtime = "nodejs";

export async function POST(req: Request) {
  const actor = await requireInternal({ api: true });
  if (!actor) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: { userId?: string; email?: string; isInternal?: boolean };
  try {
    body = (await req.json()) as {
      userId?: string;
      email?: string;
      isInternal?: boolean;
    };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const isInternal = Boolean(body.isInternal);
  const userId = String(body.userId ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!userId && !email) {
    return NextResponse.json({ error: "missing_target" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Resolver el target por id o email.
  const targetQuery = admin.from("users").select("id, email, is_internal");
  const { data: target, error: tErr } = userId
    ? await targetQuery.eq("id", userId).maybeSingle()
    : await targetQuery.eq("email", email).maybeSingle();
  if (tErr) {
    return NextResponse.json({ error: "lookup_failed" }, { status: 500 });
  }
  if (!target) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }

  // No podés quitarte el acceso a vos mismo.
  if (target.id === actor.userId && !isInternal) {
    return NextResponse.json(
      { error: "cannot_revoke_self" },
      { status: 400 },
    );
  }

  if (target.is_internal === isInternal) {
    return NextResponse.json({ ok: true, isInternal });
  }

  const { error: updErr } = await admin
    .from("users")
    .update({ is_internal: isInternal })
    .eq("id", target.id);
  if (updErr) {
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }

  await admin.from("audit_logs").insert({
    tenant_id: null,
    actor_user_id: actor.userId,
    entity_type: "users",
    entity_id: target.id,
    action: isInternal ? "internal_staff_grant" : "internal_staff_revoke",
    reason: `Staff Ninja-Soft · ${
      isInternal ? "alta" : "baja"
    } de staff (${target.email})`,
    before_data: { is_internal: target.is_internal },
    after_data: { is_internal: isInternal },
  });

  return NextResponse.json({ ok: true, isInternal });
}
