import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";

// =============================================================================
// POST /api/recipes/audit — registra en audit_logs un cambio de receta.
//
// Las recetas se editan client-side (modules/recipes/api.updateRecipe) y hasta
// Fase 7 no dejaban traza. Acá auditamos best-effort el before/after de los
// campos sensibles de rotulado y nutrición (regla dura 4: auditoría en cambios
// críticos), porque la nutrición ahora puede venir generada por IA y los sellos
// son legales: queremos saber qué se guardó y con qué base.
//
// audit_logs NO tiene policy de INSERT para authenticated (solo SELECT del
// owner/staff), así que la escritura va por service_role (admin). La verificación
// de pertenencia es explícita: confirmamos que la receta es del tenant de la
// sesión antes de escribir, con el tenant resuelto del claim (no de la sesión a
// ciegas). Best-effort: cualquier fallo responde ok:false sin romper el guardado
// de la receta, que ya ocurrió.
//
// Body: { recipeId, before: {nutrition, regulatory_labels}, after: {...},
//         aiGenerated?: boolean }
// =============================================================================

export const runtime = "nodejs"; // service_role: nunca edge/cliente.
export const dynamic = "force-dynamic";

type Snapshot = {
  nutrition?: unknown;
  regulatory_labels?: unknown;
};

export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const tenantId = user.app_metadata?.tenant_id;
  if (typeof tenantId !== "string" || !tenantId) {
    return NextResponse.json({ ok: false, error: "no_tenant" }, { status: 401 });
  }

  let body: {
    recipeId?: string;
    before?: Snapshot;
    after?: Snapshot;
    aiGenerated?: boolean;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const recipeId = String(body.recipeId ?? "").trim();
  if (!recipeId) {
    return NextResponse.json({ ok: false, error: "missing_recipe" }, { status: 400 });
  }

  // Pertenencia: la receta debe ser del tenant de la sesión (RLS-scoped read).
  const { data: recipe } = await supabase
    .from("recipes")
    .select("id, tenant_id")
    .eq("id", recipeId)
    .maybeSingle();
  if (!recipe || recipe.tenant_id !== tenantId) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  try {
    const admin = createAdminClient();
    await admin.from("audit_logs").insert({
      tenant_id: tenantId,
      actor_user_id: user.id,
      entity_type: "recipe",
      entity_id: recipeId,
      action: "recipe_labeling_update",
      before_data: {
        nutrition: (body.before?.nutrition ?? null) as Json,
        regulatory_labels: (body.before?.regulatory_labels ?? null) as Json,
      },
      after_data: {
        nutrition: (body.after?.nutrition ?? null) as Json,
        regulatory_labels: (body.after?.regulatory_labels ?? null) as Json,
      },
      reason: body.aiGenerated
        ? "Edición de receta · nutrición propuesta por IA, confirmada por el usuario"
        : "Edición de receta · rotulado/nutrición",
    });
  } catch {
    // best-effort: la receta ya se guardó; el audit no rompe el flujo.
    return NextResponse.json({ ok: false });
  }

  return NextResponse.json({ ok: true });
}
