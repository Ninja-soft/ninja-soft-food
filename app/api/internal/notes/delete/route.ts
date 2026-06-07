import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireInternal } from "@/modules/internal/server";

// POST /api/internal/notes/delete — borrado soft de una nota interna (deleted_at).
// Admin client + requireInternal() + audit.

export const runtime = "nodejs";

export async function POST(req: Request) {
  const actor = await requireInternal({ api: true });
  if (!actor) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: { noteId?: string };
  try {
    body = (await req.json()) as { noteId?: string };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const noteId = String(body.noteId ?? "").trim();
  if (!noteId) {
    return NextResponse.json({ error: "missing_note" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: note } = await admin
    .from("internal_notes")
    .select("id, tenant_id")
    .eq("id", noteId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!note) {
    return NextResponse.json({ error: "note_not_found" }, { status: 404 });
  }

  const { error } = await admin
    .from("internal_notes")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", noteId);
  if (error) {
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }

  await admin.from("audit_logs").insert({
    tenant_id: note.tenant_id,
    actor_user_id: actor.userId,
    entity_type: "internal_notes",
    entity_id: noteId,
    action: "internal_note_deleted",
    reason: "Staff Ninja-Soft · baja de nota interna",
  });

  return NextResponse.json({ ok: true });
}
