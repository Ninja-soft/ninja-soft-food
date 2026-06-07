import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireInternal } from "@/modules/internal/server";
import type { Database } from "@/types/database";

// =============================================================================
// POST /api/internal/impersonate — genera un magic link de un solo uso para el
// owner de un tenant ("Entrar como dueño"). Acción sensible: queda auditada.
//
// Patrón POS (supabase/functions/internal_impersonate) adaptado a route handler
// con admin client + requireInternal(). Busca el owner del tenant (fallback al
// primer miembro), genera el link con auth.admin.generateLink y devuelve la URL
// para copiar/abrir en incógnito. Audita action 'impersonate' con staff id y
// tenant id (regla dura 4).
// =============================================================================

export const runtime = "nodejs";

const TENANT_OWNER_ROLE: Database["public"]["Enums"]["tenant_role"] = "owner";

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

  // Owner del tenant; fallback a cualquier miembro.
  type Row = { user_id: string; users: { email: string } | { email: string }[] | null };
  const { data: members } = await admin
    .from("tenant_users")
    .select("user_id, role, users(email)")
    .eq("tenant_id", tenantId);

  const rows = (members ?? []) as unknown as (Row & {
    role: Database["public"]["Enums"]["tenant_role"];
  })[];
  const owner =
    rows.find((m) => m.role === TENANT_OWNER_ROLE) ?? rows[0] ?? null;
  const ownerEmail = owner
    ? Array.isArray(owner.users)
      ? owner.users[0]?.email ?? null
      : owner.users?.email ?? null
    : null;

  if (!ownerEmail) {
    return NextResponse.json(
      { error: "tenant_owner_not_found" },
      { status: 404 },
    );
  }

  const { data: linkData, error: linkErr } =
    await admin.auth.admin.generateLink({
      type: "magiclink",
      email: ownerEmail,
    });
  if (linkErr || !linkData) {
    return NextResponse.json(
      { error: "link_generation_failed" },
      { status: 500 },
    );
  }

  await admin.from("audit_logs").insert({
    tenant_id: tenantId,
    actor_user_id: actor.userId,
    entity_type: "impersonation",
    entity_id: tenantId,
    action: "impersonate",
    reason: `Staff Ninja-Soft · acceso como dueño (${ownerEmail})`,
    after_data: { owner_email: ownerEmail, actor_email: actor.email },
  });

  return NextResponse.json({
    ok: true,
    actionLink: linkData.properties.action_link,
    ownerEmail,
  });
}
