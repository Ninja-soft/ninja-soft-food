import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";

// =============================================================================
// lib/ai/access.ts — gating de IA por tenant (server-side).
//
// La IA está incluida en planes altos y se vende como add-on en planes bajos
// (doc 07 §"Fase 7", doc 11 Gap 3). tenantHasAI() resuelve el acceso por TRES
// vías, en orden de costo de query:
//   (a) plan del tenant con limits.ai_included === true,
//   (b) subscription_addons activo con addon_key 'ai',
//   (c) tenant_flags 'ai_enabled' enabled (override de staff / cortesía).
//
// Patrón de parseo de limits calcado de lib/billing/limits.ts: limits es jsonb,
// los booleanos son feature gates (=== true, nada de truthy laxo). Usa admin
// client porque algunas de estas tablas se cruzan con plans/subscriptions y
// queremos un resultado consistente independiente de la sesión del caller; el
// chequeo de tenant lo hace el filtro explícito por tenant_id.
// =============================================================================

const AI_ADDON_KEY = "ai";
const AI_FLAG = "ai_enabled";

/** ¿El jsonb de limits marca ai_included? (=== true, como los gates de billing). */
export function planLimitsIncludeAI(raw: Json | null | undefined): boolean {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  return (raw as Record<string, unknown>).ai_included === true;
}

/**
 * ¿El tenant tiene acceso a IA? true si cualquiera de las tres vías habilita.
 * Best-effort por vía: si una query falla, se intenta la siguiente (la ausencia
 * de IA nunca debe romper el flujo del caller). Devuelve false ante todo fallo.
 */
export async function tenantHasAI(tenantId: string): Promise<boolean> {
  if (!tenantId) return false;
  const admin = createAdminClient();

  // (a) Plan del tenant: subscriptions.plan_id -> plans.limits.ai_included.
  try {
    const { data: sub } = await admin
      .from("subscriptions")
      .select("plan:plans(limits)")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    const plan = sub?.plan as { limits?: Json } | { limits?: Json }[] | null;
    const limits = Array.isArray(plan) ? plan[0]?.limits : plan?.limits;
    if (planLimitsIncludeAI(limits ?? null)) return true;
  } catch {
    // sigue con (b)
  }

  // (b) Add-on activo de IA.
  try {
    const { data: addon } = await admin
      .from("subscription_addons")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("addon_key", AI_ADDON_KEY)
      .eq("status", "active")
      .is("deleted_at", null)
      .maybeSingle();
    if (addon) return true;
  } catch {
    // sigue con (c)
  }

  // (c) Flag por tenant (override de staff).
  try {
    const { data: flag } = await admin
      .from("tenant_flags")
      .select("enabled")
      .eq("tenant_id", tenantId)
      .eq("flag", AI_FLAG)
      .maybeSingle();
    if (flag?.enabled === true) return true;
  } catch {
    // cae a false
  }

  return false;
}
