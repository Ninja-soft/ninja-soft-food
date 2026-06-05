import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireInternal } from "@/modules/internal/server";
import type { Database } from "@/types/database";

// =============================================================================
// POST /api/internal/set-status — cambia el estado de un tenant (staff).
//
// Estado canónico vive en subscriptions.status (regla dura 7). Sincroniza
// tenants.status. Admin client (sin policy UPDATE para authenticated) + defensa
// requireInternal(). Audita before/after en audit_logs.
// =============================================================================

export const runtime = "nodejs";

type TenantStatus = Database["public"]["Enums"]["tenant_status"];
const ALLOWED: TenantStatus[] = [
  "trial",
  "active",
  "past_due",
  "suspended",
  "cancelled",
];

export async function POST(req: Request) {
  const actor = await requireInternal({ api: true });
  if (!actor) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: { tenantId?: string; status?: string };
  try {
    body = (await req.json()) as { tenantId?: string; status?: string };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const tenantId = String(body.tenantId ?? "").trim();
  const status = String(body.status ?? "").trim() as TenantStatus;
  if (!tenantId) {
    return NextResponse.json({ error: "missing_tenant" }, { status: 400 });
  }
  if (!ALLOWED.includes(status)) {
    return NextResponse.json({ error: "invalid_status" }, { status: 400 });
  }

  const admin = createAdminClient();

  const [tenantRes, subRes] = await Promise.all([
    admin.from("tenants").select("id, status").eq("id", tenantId).maybeSingle(),
    admin
      .from("subscriptions")
      .select("id, status")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
  ]);
  if (!tenantRes.data) {
    return NextResponse.json({ error: "tenant_not_found" }, { status: 404 });
  }

  const before = {
    tenant_status: tenantRes.data.status,
    subscription_status: subRes.data?.status ?? null,
  };

  if (subRes.data) {
    const { error } = await admin
      .from("subscriptions")
      .update({ status })
      .eq("id", subRes.data.id);
    if (error) {
      return NextResponse.json({ error: "sub_update_failed" }, { status: 500 });
    }
  }

  const { error: tErr } = await admin
    .from("tenants")
    .update({ status })
    .eq("id", tenantId);
  if (tErr) {
    return NextResponse.json({ error: "tenant_update_failed" }, { status: 500 });
  }

  await admin.from("audit_logs").insert({
    tenant_id: tenantId,
    actor_user_id: actor.userId,
    entity_type: "tenants",
    entity_id: tenantId,
    action: "internal_set_status",
    reason: "Staff Ninja-Soft · cambio de estado",
    before_data: before,
    // subscription_status real: null si el tenant no tenía fila de subscriptions
    after_data: {
      tenant_status: status,
      subscription_status: subRes.data ? status : null,
    },
  });

  return NextResponse.json({ ok: true, status });
}
