import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireInternal } from "@/modules/internal/server";
import {
  applyAiIncludedToLimits,
  canEditPlans,
  parseUpdatePlan,
} from "@/modules/internal/plans";
import type { Json } from "@/types/database";

// =============================================================================
// POST /api/internal/update-plan — edita precios ARS y estado de un plan.
//
// Defensa server-side en dos capas (regla dura: requireInternal SIEMPRE antes
// del admin client):
//   1. requireInternal({ api: true }) → 403 si no es staff Ninja-Soft.
//   2. internal_level === 'admin' → 403 si es editor/viewer. Cambiar precios es
//      sensible: solo admin.
// La tabla plans NO tiene policy de UPDATE para authenticated, así que la
// escritura va por admin client (service_role). Audita before/after en
// audit_logs (regla dura 4): los 3 campos editables.
// =============================================================================

export const runtime = "nodejs";

export async function POST(req: Request) {
  const actor = await requireInternal({ api: true });
  if (!actor) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!canEditPlans(actor.level)) {
    // Editor/viewer no pueden tocar precios.
    return NextResponse.json({ error: "forbidden_level" }, { status: 403 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = parseUpdatePlan(raw);
  if (!parsed.ok || !parsed.data) {
    return NextResponse.json({ error: parsed.error ?? "invalid_input" }, {
      status: 400,
    });
  }
  const { plan_id, monthly_price_ars, yearly_price_ars, is_active, ai_included } =
    parsed.data;

  const admin = createAdminClient();

  // Snapshot previo (solo los campos auditados) para el before/after.
  const { data: current, error: lookupErr } = await admin
    .from("plans")
    .select("id, key, monthly_price_ars, yearly_price_ars, is_active, limits")
    .eq("id", plan_id)
    .maybeSingle();
  if (lookupErr) {
    return NextResponse.json({ error: "lookup_failed" }, { status: 500 });
  }
  if (!current) {
    return NextResponse.json({ error: "plan_not_found" }, { status: 404 });
  }

  const beforeLimits = current.limits;
  const before = {
    monthly_price_ars: current.monthly_price_ars,
    yearly_price_ars: current.yearly_price_ars,
    is_active: current.is_active,
    limits: beforeLimits,
  };

  const update: {
    monthly_price_ars: number | null;
    yearly_price_ars: number | null;
    is_active?: boolean;
    limits?: Json;
  } = {
    monthly_price_ars,
    yearly_price_ars,
  };
  if (typeof is_active === "boolean") update.is_active = is_active;
  // Toggle "IA incluida": preserva el resto de limits, solo cambia ai_included.
  if (typeof ai_included === "boolean") {
    update.limits = applyAiIncludedToLimits(beforeLimits, ai_included) as Json;
  }

  const { data: updated, error: updErr } = await admin
    .from("plans")
    .update(update)
    .eq("id", plan_id)
    .select(
      "id, key, name, monthly_price_ars, yearly_price_ars, monthly_price_usd, limits, is_active",
    )
    .single();
  if (updErr || !updated) {
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }

  const after = {
    monthly_price_ars: updated.monthly_price_ars,
    yearly_price_ars: updated.yearly_price_ars,
    is_active: updated.is_active,
    limits: updated.limits,
  };

  await admin.from("audit_logs").insert({
    // Cambio global (no es de un tenant): tenant_id null.
    tenant_id: null,
    actor_user_id: actor.userId,
    entity_type: "plans",
    entity_id: plan_id,
    action: "internal_update_plan",
    reason: `Staff Ninja-Soft · precios plan ${current.key}`,
    before_data: before,
    after_data: after,
  });

  return NextResponse.json({ ok: true, plan: updated });
}
