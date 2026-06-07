import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireInternal } from "@/modules/internal/server";

// =============================================================================
// POST /api/internal/flags/set — alta/toggle de un feature flag por tenant.
//
// tenant_flags es flag por string libre (ej. ai_enabled, beta_features),
// independiente del catálogo feature_flags de 0001. unique(tenant_id, flag), así
// que upserteamos por ese par. Admin client + requireInternal() + audit.
// =============================================================================

export const runtime = "nodejs";

export async function POST(req: Request) {
  const actor = await requireInternal({ api: true });
  if (!actor) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: {
    tenantId?: string;
    flag?: string;
    enabled?: boolean;
    note?: string;
  };
  try {
    body = (await req.json()) as {
      tenantId?: string;
      flag?: string;
      enabled?: boolean;
      note?: string;
    };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const tenantId = String(body.tenantId ?? "").trim();
  // Normalizamos a snake_case minúsculas (claves estables tipo ai_enabled).
  const flag = String(body.flag ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  const enabled = body.enabled !== false;
  const note = body.note ? String(body.note).trim() : null;
  if (!tenantId) {
    return NextResponse.json({ error: "missing_tenant" }, { status: 400 });
  }
  if (!flag) {
    return NextResponse.json({ error: "missing_flag" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("tenant_flags")
    .select("id, enabled, note")
    .eq("tenant_id", tenantId)
    .eq("flag", flag)
    .maybeSingle();

  const before = existing
    ? { enabled: existing.enabled, note: existing.note }
    : null;

  const { error } = await admin
    .from("tenant_flags")
    .upsert(
      { tenant_id: tenantId, flag, enabled, note, set_by: actor.userId },
      { onConflict: "tenant_id,flag" },
    );
  if (error) {
    return NextResponse.json({ error: "upsert_failed" }, { status: 500 });
  }

  await admin.from("audit_logs").insert({
    tenant_id: tenantId,
    actor_user_id: actor.userId,
    entity_type: "tenant_flags",
    action: "internal_set_flag",
    reason: `Staff Ninja-Soft · flag ${flag} = ${enabled ? "on" : "off"}`,
    before_data: before,
    after_data: { flag, enabled, note },
  });

  return NextResponse.json({ ok: true });
}
