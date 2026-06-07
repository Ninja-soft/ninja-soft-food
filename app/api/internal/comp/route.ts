import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireInternal } from "@/modules/internal/server";

// =============================================================================
// POST /api/internal/comp — cortesía o acceso vitalicio (suscripción sin cobro).
//
// mode = "courtesy": billing_mode 'comp', status 'active', current_period_end +N
//        meses elegibles (acceso temporal sin cobro).
// mode = "lifetime": billing_mode 'comp', is_lifetime true, current_period_end
//        null (nunca vence, no entra en revenue).
//
// Ambos quedan exentos de la reconciliación diaria con MP (lib/billing/sync:
// isReconciliationExempt). Admin client + requireInternal() + audit before/after.
// =============================================================================

export const runtime = "nodejs";

export async function POST(req: Request) {
  const actor = await requireInternal({ api: true });
  if (!actor) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: { tenantId?: string; mode?: string; months?: number };
  try {
    body = (await req.json()) as {
      tenantId?: string;
      mode?: string;
      months?: number;
    };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const tenantId = String(body.tenantId ?? "").trim();
  const mode = String(body.mode ?? "").trim();
  if (!tenantId) {
    return NextResponse.json({ error: "missing_tenant" }, { status: 400 });
  }
  if (mode !== "courtesy" && mode !== "lifetime") {
    return NextResponse.json({ error: "invalid_mode" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: sub, error: subErr } = await admin
    .from("subscriptions")
    .select("id, status, billing_mode, is_lifetime, current_period_end")
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

  const before = {
    status: sub.status,
    billing_mode: sub.billing_mode,
    is_lifetime: sub.is_lifetime,
    current_period_end: sub.current_period_end,
  };

  let patch: {
    status: "active";
    billing_mode: "comp";
    is_lifetime: boolean;
    cancel_at_period_end: boolean;
    current_period_end: string | null;
  };

  if (mode === "lifetime") {
    patch = {
      status: "active",
      billing_mode: "comp",
      is_lifetime: true,
      cancel_at_period_end: false,
      current_period_end: null,
    };
  } else {
    const months = Math.max(1, Math.floor(Number(body.months) || 1));
    const now = Date.now();
    const currentEnd = sub.current_period_end
      ? new Date(sub.current_period_end).getTime()
      : 0;
    const base = currentEnd > now ? currentEnd : now;
    const end = new Date(base);
    end.setMonth(end.getMonth() + months);
    patch = {
      status: "active",
      billing_mode: "comp",
      is_lifetime: false,
      cancel_at_period_end: false,
      current_period_end: end.toISOString(),
    };
  }

  const { error: updErr } = await admin
    .from("subscriptions")
    .update(patch)
    .eq("id", sub.id);
  if (updErr) {
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }

  await admin.from("tenants").update({ status: "active" }).eq("id", tenantId);

  await admin.from("audit_logs").insert({
    tenant_id: tenantId,
    actor_user_id: actor.userId,
    entity_type: "subscriptions",
    entity_id: sub.id,
    action: mode === "lifetime" ? "internal_grant_lifetime" : "internal_grant_courtesy",
    reason:
      mode === "lifetime"
        ? "Staff Ninja-Soft · acceso vitalicio (sin cobro)"
        : `Staff Ninja-Soft · cortesía hasta ${patch.current_period_end?.slice(0, 10)}`,
    before_data: before,
    after_data: patch,
  });

  return NextResponse.json({ ok: true });
}
