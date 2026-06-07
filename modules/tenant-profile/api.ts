import { createClient } from "@/lib/supabase/client";
import {
  getCountryProfile,
  getDefaultOperatingProfile,
  type CountryProfile,
} from "@/lib/globalization/countries";
import {
  getLabelSystemForCountry,
  type LabelSystem,
} from "@/lib/globalization/labelSystems";
import { getTenantId } from "@/lib/utils/tenant";

// =============================================================================
// modules/tenant-profile — contexto operativo del tenant resuelto por país.
// Fuente de verdad de country/locale/currency/labelSystem/frameworks para TODA
// la UI. Un tenant MX nunca ve octógonos/RNE/RNPA/ABR: lo decide este módulo,
// no cada pantalla. Lógica de negocio fuera de los componentes (regla CLAUDE.md).
// =============================================================================

export type OperatingProfile = {
  /** ISO-3166 alpha-2 del país operativo del tenant. */
  country: string;
  locale: string;
  currency: string;
  timezone: string;
  /** Etiqueta del identificador fiscal del país (CUIT/RFC/CNPJ/EIN/...). */
  taxIdLabel: string;
  /** Marcos regulatorios del tenant (operating profile, con fallback a país). */
  complianceFrameworks: string[];
  /** Sistema de rotulado frontal del país (undefined si el país no tiene). */
  labelSystem: LabelSystem | undefined;
  /** Perfil del país completo (catálogo lib/globalization) para datos derivados. */
  countryProfile: CountryProfile;
};

/** Construye el OperatingProfile combinando el operating profile guardado del
 *  tenant con el catálogo de país (lib/globalization) como fallback. */
export function buildOperatingProfile(input: {
  country?: string | null;
  locale?: string | null;
  currency?: string | null;
  timezone?: string | null;
  taxIdLabel?: string | null;
  complianceFrameworks?: string[] | null;
}): OperatingProfile {
  const country = input.country ?? "AR";
  const countryProfile = getCountryProfile(country);
  return {
    country,
    locale: input.locale ?? countryProfile.locale,
    currency: input.currency ?? countryProfile.currency,
    timezone: input.timezone ?? countryProfile.timezone,
    taxIdLabel: input.taxIdLabel ?? countryProfile.taxIdLabel,
    complianceFrameworks:
      input.complianceFrameworks && input.complianceFrameworks.length > 0
        ? input.complianceFrameworks
        : countryProfile.complianceFrameworks,
    labelSystem: getLabelSystemForCountry(country),
    countryProfile,
  };
}

/** Lee el perfil operativo del tenant actual (cliente). Resuelve país desde
 *  tenants.country y el resto desde tenant_operating_profiles, con fallback al
 *  catálogo de país. */
export async function getOperatingProfile(): Promise<OperatingProfile> {
  const supabase = createClient();
  const tenantId = await getTenantId();

  const [{ data: tenant }, { data: profile }] = await Promise.all([
    supabase.from("tenants").select("country").eq("id", tenantId).maybeSingle(),
    supabase
      .from("tenant_operating_profiles")
      .select("country, locale, currency, timezone, tax_id_label, compliance_frameworks")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
  ]);

  return buildOperatingProfile({
    country: profile?.country ?? tenant?.country,
    locale: profile?.locale,
    currency: profile?.currency,
    timezone: profile?.timezone,
    taxIdLabel: profile?.tax_id_label,
    complianceFrameworks: profile?.compliance_frameworks,
  });
}

/**
 * Fija el país operativo del tenant: actualiza tenants.country + tax_id y
 * (re)crea el tenant_operating_profiles con los defaults del país. Necesario en
 * onboarding porque el trigger de la migración 0013 solo cubre el INSERT del
 * tenant (que nace AR por default); acá pisamos con el país elegido.
 */
export async function setTenantCountry(
  country: string,
  taxId?: string | null,
): Promise<void> {
  const supabase = createClient();
  const db = supabase as unknown as {
    from: (t: string) => {
      upsert: (v: unknown, o?: unknown) => Promise<{ error: unknown }>;
    };
  };
  const tenantId = await getTenantId();

  const { error: tenantError } = await supabase
    .from("tenants")
    .update({ country, tax_id: taxId?.trim() || null })
    .eq("id", tenantId);
  if (tenantError) throw tenantError;

  const base = getDefaultOperatingProfile(country);
  const { error: profileError } = await db.from("tenant_operating_profiles").upsert(
    {
      tenant_id: tenantId,
      country: base.country,
      locale: base.locale,
      currency: base.currency,
      timezone: base.timezone,
      tax_id_label: base.tax_id_label,
      tax_id_value: taxId?.trim() || null,
      tax_label: base.tax_label,
      default_tax_rate: base.default_tax_rate,
      measurement_system: base.measurement_system,
      weight_unit: base.weight_unit,
      volume_unit: base.volume_unit,
      temperature_unit: base.temperature_unit,
      date_format: base.date_format,
      compliance_frameworks: base.compliance_frameworks,
      label_languages: base.label_languages,
      traceability_config: base.traceability_config,
    },
    { onConflict: "tenant_id" },
  );
  if (profileError) throw profileError;
}
