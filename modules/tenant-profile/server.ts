import { createClient } from "@/lib/supabase/server";
import { buildOperatingProfile, type OperatingProfile } from "./api";

// Equivalente server-side de getOperatingProfile (para Server Components, PDFs,
// route handlers). Resuelve el tenant del usuario autenticado vía RLS — no
// recibe tenantId porque las tablas ya están scopeadas por current_tenant_id().

/** Perfil operativo del tenant autenticado en contexto de servidor. */
export async function getOperatingProfileServer(): Promise<OperatingProfile> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const tenantId = user?.app_metadata?.tenant_id as string | undefined;

  const [tenantRes, profileRes] = await Promise.all([
    tenantId
      ? supabase.from("tenants").select("country").eq("id", tenantId).maybeSingle()
      : Promise.resolve({ data: null }),
    tenantId
      ? supabase
          .from("tenant_operating_profiles")
          .select(
            "country, locale, currency, timezone, tax_id_label, compliance_frameworks",
          )
          .eq("tenant_id", tenantId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const tenant = tenantRes.data as { country: string | null } | null;
  const profile = profileRes.data as {
    country: string | null;
    locale: string | null;
    currency: string | null;
    timezone: string | null;
    tax_id_label: string | null;
    compliance_frameworks: string[] | null;
  } | null;

  return buildOperatingProfile({
    country: profile?.country ?? tenant?.country,
    locale: profile?.locale,
    currency: profile?.currency,
    timezone: profile?.timezone,
    taxIdLabel: profile?.tax_id_label,
    complianceFrameworks: profile?.compliance_frameworks,
  });
}
