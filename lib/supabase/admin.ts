import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// Cliente Supabase con service_role — bypassa RLS. SOLO server-side
// (route handlers / server actions): el webhook de Mercado Pago no tiene sesión
// de usuario, así que necesita service_role para leer secretos y escribir
// subscriptions / payment_events. Patrón calcado de las Edge Functions del POS
// (mp_billing_webhook usa SUPABASE_SERVICE_ROLE_KEY con persistSession: false).
//
// NUNCA importar este módulo desde código de cliente: la service role key no
// puede filtrarse al navegador.

let cached: ReturnType<typeof createSupabaseClient<Database>> | null = null;

export function createAdminClient() {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY",
    );
  }

  cached = createSupabaseClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
