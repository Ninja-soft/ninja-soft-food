import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireInternal } from "@/modules/internal/server";

// POST /api/internal/notes/create — alta de nota interna por tenant. El autor es
// el staff logueado. Admin client + requireInternal() + audit.

export const runtime = "nodejs";

export async function POST(req: Request) {
  const actor = await requireInternal({ api: true });
  if (!actor) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: { tenantId?: string; body?: string };
  try {
    body = (await req.json()) as { tenantId?: string; body?: string };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const tenantId = String(body.tenantId ?? "").trim();
  const text = String(body.body ?? "").trim();
  if (!tenantId) {
    return NextResponse.json({ error: "missing_tenant" }, { status: 400 });
  }
  if (!text) {
    return NextResponse.json({ error: "missing_body" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: note, error } = await admin
    .from("internal_notes")
    .insert({ tenant_id: tenantId, author_id: actor.userId, body: text })
    .select("id")
    .single();
  if (error || !note) {
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }

  await admin.from("audit_logs").insert({
    tenant_id: tenantId,
    actor_user_id: actor.userId,
    entity_type: "internal_notes",
    entity_id: note.id,
    action: "internal_note_created",
    reason: "Staff Ninja-Soft · nota interna",
    after_data: { body: text },
  });

  return NextResponse.json({ ok: true, id: note.id });
}
