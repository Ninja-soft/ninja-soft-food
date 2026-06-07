import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// =============================================================================
// modules/billing/server.ts — lectura server-only de planes para superficies
// públicas (landing). La tabla `plans` solo tiene RLS de lectura para
// `authenticated` (migración 0001: plans_public_read), así que la landing
// anónima NO puede leerla con el client anon. Resolvemos server-side con el
// admin client (service role, sin sesión) y pasamos el resultado como props.
//
// Fuente de verdad de precios y límites = tabla `plans` (editable en
// /internal/planes). La landing nunca duplica esos números.
// =============================================================================

/** Plan con los campos comerciales que la landing necesita renderizar. */
export interface PublicPlan {
  key: string;
  name: string;
  monthlyArs: number | null;
  yearlyArs: number | null;
}

/**
 * Planes self-service activos (con precio ARS cobrable), ordenados por precio.
 * Enterprise/Corporativo queda fuera: no tiene precio ARS y se trata aparte en
 * la landing (mailto a ventas). Server-only: usa service role.
 */
export async function listPublicPlans(): Promise<PublicPlan[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("plans")
    .select("key, name, monthly_price_ars, yearly_price_ars")
    .eq("is_active", true)
    .order("monthly_price_ars", { ascending: true, nullsFirst: false });
  if (error) throw error;

  return (data ?? [])
    .filter((p) => (p.monthly_price_ars ?? 0) > 0)
    .map((p) => ({
      key: p.key,
      name: p.name,
      monthlyArs: p.monthly_price_ars,
      yearlyArs: p.yearly_price_ars,
    }));
}
