import { createClient } from "@/lib/supabase/client";
import type { Json } from "@/types/database";

// =============================================================================
// lib/billing/limits.ts — parseo tipado de plans.limits + chequeo de consumo.
//
// Soft-block (doc 05 §2): al exceder un límite NUNCA se pierde dato; la UI
// muestra un banner de upgrade. Estos helpers se consumen desde modules/*/api.ts
// (antes de mutaciones) y desde la card de Suscripción.
//
// limits jsonb (patrón POS): null = ilimitado. Booleans = feature gates.
// =============================================================================

/** Recursos contables con tope numérico en plans.limits. */
export type CountableResource =
  | "establishments"
  | "users"
  | "members"
  | "recipes"
  | "productions_per_month";

/** Features booleanas (gates por plan). */
export type PlanFeature =
  | "configurable_forms"
  | "api_access"
  | "integrations"
  | "advanced_kpis"
  | "quality_module"
  | "white_label";

/** Forma tipada de plans.limits. null en un contable = ilimitado. */
export interface PlanLimits {
  max_establishments: number | null;
  max_users: number | null;
  max_members: number | null;
  max_recipes: number | null;
  max_productions_per_month: number | null;
  configurable_forms: boolean;
  api_access: boolean;
  integrations: boolean;
  advanced_kpis: boolean;
  quality_module: boolean;
  white_label: boolean;
}

const DEFAULT_LIMITS: PlanLimits = {
  max_establishments: null,
  max_users: null,
  max_members: null,
  max_recipes: null,
  max_productions_per_month: null,
  configurable_forms: false,
  api_access: false,
  integrations: false,
  advanced_kpis: false,
  quality_module: false,
  white_label: false,
};

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function bool(v: unknown): boolean {
  return v === true;
}

/** Parsea el jsonb crudo de plans.limits a la forma tipada. */
export function parsePlanLimits(raw: Json | null | undefined): PlanLimits {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...DEFAULT_LIMITS };
  }
  const o = raw as Record<string, unknown>;
  return {
    max_establishments: num(o.max_establishments),
    max_users: num(o.max_users),
    max_members: num(o.max_members),
    max_recipes: num(o.max_recipes),
    max_productions_per_month: num(o.max_productions_per_month),
    configurable_forms: bool(o.configurable_forms),
    api_access: bool(o.api_access),
    integrations: bool(o.integrations),
    advanced_kpis: bool(o.advanced_kpis),
    quality_module: bool(o.quality_module),
    white_label: bool(o.white_label),
  };
}

/** Tope numérico de un recurso (null = ilimitado). */
export function limitFor(
  limits: PlanLimits,
  resource: CountableResource,
): number | null {
  switch (resource) {
    case "establishments":
      return limits.max_establishments;
    case "users":
      return limits.max_users;
    case "members":
      return limits.max_members;
    case "recipes":
      return limits.max_recipes;
    case "productions_per_month":
      return limits.max_productions_per_month;
  }
}

/** ¿El plan habilita esta feature? */
export function hasFeature(limits: PlanLimits, feature: PlanFeature): boolean {
  return limits[feature];
}

export interface LimitCheck {
  resource: CountableResource;
  /** Uso actual del tenant. */
  used: number;
  /** Tope del plan (null = ilimitado). */
  limit: number | null;
  /** ¿Ya alcanzó o superó el tope? (false si ilimitado). */
  reached: boolean;
  /** ¿Puede crear uno más? (true si ilimitado). */
  canAdd: boolean;
}

function monthRange(): { from: string; to: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return {
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
  };
}

/** Uso actual de un recurso para el tenant de la sesión (vía RLS). */
async function currentUsage(resource: CountableResource): Promise<number> {
  const supabase = createClient();

  if (resource === "establishments") {
    const { count, error } = await supabase
      .from("establishments")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null);
    if (error) throw error;
    return count ?? 0;
  }

  if (resource === "users") {
    const { count, error } = await supabase
      .from("tenant_users")
      .select("id", { count: "exact", head: true });
    if (error) throw error;
    return count ?? 0;
  }

  if (resource === "members") {
    // "members" = operarios con PIN. La tabla puede no existir en esta fase;
    // si la consulta falla, tratamos el uso como 0 (no bloqueamos de más).
    const { count, error } = await supabase
      .from("members")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null);
    if (error) return 0;
    return count ?? 0;
  }

  if (resource === "recipes") {
    const { count, error } = await supabase
      .from("recipes")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null);
    if (error) throw error;
    return count ?? 0;
  }

  // productions_per_month: producciones completadas del mes en curso.
  const { from, to } = monthRange();
  const { count, error } = await supabase
    .from("productions")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null)
    .eq("status", "completed")
    .gte("production_date", from)
    .lt("production_date", to);
  if (error) throw error;
  return count ?? 0;
}

/**
 * Chequea si el tenant puede sumar un recurso bajo su plan.
 * `limits` se pasa ya parseado (lo tiene la card de Suscripción / el hook del
 * plan), evitando una query extra. Soft-block: el caller decide qué hacer con
 * `reached` / `canAdd` (banner de upgrade, nunca bloqueo destructivo).
 */
export async function checkPlanLimit(
  limits: PlanLimits,
  resource: CountableResource,
): Promise<LimitCheck> {
  const limit = limitFor(limits, resource);
  const used = await currentUsage(resource);
  const reached = limit !== null && used >= limit;
  return { resource, used, limit, reached, canAdd: limit === null || used < limit };
}
