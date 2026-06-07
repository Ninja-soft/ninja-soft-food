import { describe, expect, it } from "vitest";
import {
  getLabelSystemForCountry,
  getPermitTypes,
} from "@/lib/globalization";
import { buildOperatingProfile } from "@/modules/tenant-profile/api";
import { resolvePlanPrice } from "@/lib/billing/pricing";

// =============================================================================
// tests/unit/compliance-mx — criterio de salida de Fase 4 (motor de compliance
// internacional): un tenant de México debe resolverse SIEMPRE por su país, sin
// arrastrar conceptos argentinos. Todo lo que se valida acá son funciones puras
// (catálogo de globalization + helpers de tenant-profile/billing): SIN tocar DB.
//
// La resolución SQL de default_compliance_frameworks (migración 0013) se valida
// en tests/integration/rls.test.ts — acá no se cubre a propósito.
// =============================================================================

describe("MX — sistema de rotulado frontal", () => {
  it("resuelve NOM-051 (no octógonos AR)", () => {
    const system = getLabelSystemForCountry("MX");
    expect(system?.id).toBe("mx_nom051");
    expect(system?.id).not.toBe("ar_octogonos");
  });

  it("expone solo valores válidos NOM-051", () => {
    const ids = getLabelSystemForCountry("MX")?.values.map((v) => v.id) ?? [];
    // Sellos propios de NOM-051.
    expect(ids).toContain("exceso_calorias");
    expect(ids).toContain("exceso_azucares");
    expect(ids).toContain("exceso_grasas_saturadas");
    expect(ids).toContain("exceso_grasas_trans");
    expect(ids).toContain("exceso_sodio");
    expect(ids).toContain("contiene_cafeina");
    expect(ids).toContain("contiene_edulcorantes");
    // NO debe traer un valor que solo exista en otro sistema (CL "alto_en_*").
    expect(ids).not.toContain("alto_en_sodio");
  });

  it("AR sigue resolviendo octógonos (no se rompe el caso base)", () => {
    expect(getLabelSystemForCountry("AR")?.id).toBe("ar_octogonos");
  });

  it("país desconocido devuelve undefined SIN fallback a AR", () => {
    expect(getLabelSystemForCountry("ZZ")).toBeUndefined();
    expect(getLabelSystemForCountry("XX")).toBeUndefined();
  });
});

describe("MX — permisos regulatorios por país", () => {
  it("establishment usa COFEPRIS y NO el RNE argentino", () => {
    const ids = getPermitTypes("MX", "establishment").map((p) => p.id);
    expect(ids).toContain("cofepris_aviso_funcionamiento");
    expect(ids).not.toContain("rne");
    expect(ids).not.toContain("ruca");
  });

  it("vehicle no incluye UTA/URA argentinos", () => {
    const ids = getPermitTypes("MX", "vehicle").map((p) => p.id);
    expect(ids).not.toContain("uta");
    expect(ids).not.toContain("ura");
    // El permiso de transporte de MX sí debe estar.
    expect(ids).toContain("permiso_sct");
  });
});

describe("MX — buildOperatingProfile (tenant sin perfil cargado)", () => {
  // Caso: el tenant tiene país MX pero NO tiene tenant_operating_profiles aún.
  // El perfil debe completarse con los defaults del catálogo de país.
  const profile = buildOperatingProfile({ country: "MX" });

  it("resuelve moneda MXN", () => {
    expect(profile.currency).toBe("MXN");
  });

  it("resuelve locale es-MX", () => {
    expect(profile.locale).toBe("es-MX");
  });

  it("resuelve identificador fiscal RFC (no CUIT)", () => {
    expect(profile.taxIdLabel).toBe("RFC");
    expect(profile.taxIdLabel).not.toBe("CUIT");
  });

  it("resuelve labelSystem mx_nom051", () => {
    expect(profile.labelSystem?.id).toBe("mx_nom051");
  });

  it("no arrastra marcos regulatorios argentinos", () => {
    expect(profile.complianceFrameworks).not.toContain("RNE");
    expect(profile.complianceFrameworks).not.toContain("RNPA");
    expect(profile.complianceFrameworks).not.toContain("CAA");
    // Marco propio de MX presente.
    expect(profile.complianceFrameworks).toContain("NOM-051");
  });

  it("respeta overrides del perfil guardado cuando existen", () => {
    const overridden = buildOperatingProfile({
      country: "MX",
      currency: "USD",
      complianceFrameworks: ["HACCP"],
    });
    expect(overridden.currency).toBe("USD");
    expect(overridden.complianceFrameworks).toEqual(["HACCP"]);
    // El país no cambia: el labelSystem sigue siendo el de MX.
    expect(overridden.labelSystem?.id).toBe("mx_nom051");
  });
});

describe("MX — resolución de precio del plan (billing)", () => {
  const prices = {
    monthly_price_ars: 59990,
    yearly_price_ars: 599900,
    monthly_price_usd: 69,
  };

  it("MXN cae a USD como fallback documentado (no cobra en ARS)", () => {
    // Comportamiento actual documentado en lib/billing/pricing.ts: cualquier
    // moneda no-ARS cobra en USD (no hay precios por moneda todavía).
    expect(resolvePlanPrice(prices, "monthly", "MXN")).toEqual({
      currency: "USD",
      amount: 69,
    });
  });

  it("MXN anual compone USD mensual × 12 (no hay yearly_usd)", () => {
    expect(resolvePlanPrice(prices, "yearly", "MXN")).toEqual({
      currency: "USD",
      amount: 828,
    });
  });

  it("sin precio USD cargado, el tenant MXN no tiene precio cobrable", () => {
    const noUsd = { ...prices, monthly_price_usd: null };
    expect(resolvePlanPrice(noUsd, "monthly", "MXN")).toBeNull();
  });
});
