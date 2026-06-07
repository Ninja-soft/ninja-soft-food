import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireInternal } from "@/modules/internal/server";
import { canEditPlans, parseUpdateAddon } from "@/modules/internal/plans";

// =============================================================================
// POST /api/internal/update-addon — edita el catálogo plan_addons (precio/estado).
//
// Espejo de update-plan: defensa server-side en dos capas
//   1. requireInternal({ api: true }) → 403 si no es staff Ninja-Soft.
//   2. internal_level === 'admin' → 403 (cambiar precios es sensible).
// plan_addons solo tiene policy de SELECT para authenticated; la escritura va por
// admin client (service_role). Audita before/after (regla dura 4). tenant_id null:
// es un cambio global de catálogo, no de un tenant.
// =============================================================================

export const runtime = "nodejs";

export async function POST(req: Request) {
  const actor = await requireInternal({ api: true });
  if (!actor) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!canEditPlans(actor.level)) {
    return NextResponse.json({ error: "forbidden_level" }, { status: 403 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = parseUpdateAddon(raw);
  if (!parsed.ok || !parsed.data) {
    return NextResponse.json(
      { error: parsed.error ?? "invalid_input" },
      { status: 400 },
    );
  }
  const { key, monthly_price_ars, monthly_price_usd, is_active, description } =
    parsed.data;

  const admin = createAdminClient();

  const { data: current, error: lookupErr } = await admin
    .from("plan_addons")
    .select("key, monthly_price_ars, monthly_price_usd, is_active, description")
    .eq("key", key)
    .maybeSingle();
  if (lookupErr) {
    return NextResponse.json({ error: "lookup_failed" }, { status: 500 });
  }
  if (!current) {
    return NextResponse.json({ error: "addon_not_found" }, { status: 404 });
  }

  const before = {
    monthly_price_ars: current.monthly_price_ars,
    monthly_price_usd: current.monthly_price_usd,
    is_active: current.is_active,
    description: current.description,
  };

  const update: {
    monthly_price_ars: number | null;
    monthly_price_usd: number | null;
    is_active?: boolean;
    description?: string | null;
  } = {
    monthly_price_ars,
    monthly_price_usd,
  };
  if (typeof is_active === "boolean") update.is_active = is_active;
  if (description !== undefined) update.description = description.trim() || null;

  const { data: updated, error: updErr } = await admin
    .from("plan_addons")
    .update(update)
    .eq("key", key)
    .select("key, name, monthly_price_ars, monthly_price_usd, is_active, description")
    .single();
  if (updErr || !updated) {
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }

  await admin.from("audit_logs").insert({
    tenant_id: null,
    actor_user_id: actor.userId,
    entity_type: "plan_addons",
    entity_id: key,
    action: "internal_update_addon",
    reason: `Staff Ninja-Soft · add-on ${key}`,
    before_data: before,
    after_data: {
      monthly_price_ars: updated.monthly_price_ars,
      monthly_price_usd: updated.monthly_price_usd,
      is_active: updated.is_active,
      description: updated.description,
    },
  });

  return NextResponse.json({ ok: true, addon: updated });
}
