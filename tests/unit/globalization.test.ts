import { describe, expect, it } from "vitest";
import {
  COUNTRY_PROFILES,
  LABEL_SYSTEMS,
  PERMIT_TYPES,
  getLabelSystem,
  getLabelSystemForCountry,
  getPermitType,
  getPermitTypes,
  getPermitLabel,
  isValidLabelValue,
} from "@/lib/globalization";

// =============================================================================
// tests/unit/globalization — el catálogo de internacionalización debe mapear
// cada país a su sistema de rotulado sin fallback Argentina-first, validar
// valores de sello por sistema y filtrar permisos por país + entidad incluyendo
// siempre los genéricos.
// =============================================================================

describe("getLabelSystemForCountry — mapeo por país", () => {
  const CASES: Array<[string, string]> = [
    ["AR", "ar_octogonos"],
    ["MX", "mx_nom051"],
    ["CL", "cl_sellos"],
    ["BR", "br_anvisa"],
    ["ES", "eu_nutriscore"],
    ["US", "us_fda"],
  ];

  for (const [country, expected] of CASES) {
    it(`${country} -> ${expected}`, () => {
      expect(getLabelSystemForCountry(country)?.id).toBe(expected);
    });
    it(`${country} es case-insensitive`, () => {
      expect(getLabelSystemForCountry(country.toLowerCase())?.id).toBe(expected);
    });
  }

  it("países EU adicionales usan Nutri-Score", () => {
    expect(getLabelSystemForCountry("FR")?.id).toBe("eu_nutriscore");
    expect(getLabelSystemForCountry("DE")?.id).toBe("eu_nutriscore");
    expect(getLabelSystemForCountry("PT")?.id).toBe("eu_nutriscore");
  });

  it("país desconocido devuelve undefined SIN fallback a AR", () => {
    expect(getLabelSystemForCountry("ZZ")).toBeUndefined();
    expect(getLabelSystemForCountry("XX")).toBeUndefined();
  });

  it("país sin sistema modelado devuelve undefined (no AR)", () => {
    // UY/IT/JP no tienen sistema de advertencias frontal modelado.
    expect(getLabelSystemForCountry("UY")).toBeUndefined();
    expect(getLabelSystemForCountry("IT")).toBeUndefined();
  });

  it("nulo/vacío devuelve undefined", () => {
    expect(getLabelSystemForCountry(null)).toBeUndefined();
    expect(getLabelSystemForCountry(undefined)).toBeUndefined();
    expect(getLabelSystemForCountry("")).toBeUndefined();
  });
});

describe("countries.labelSystem coherente con getLabelSystemForCountry", () => {
  for (const profile of Object.values(COUNTRY_PROFILES)) {
    it(`${profile.code} coincide`, () => {
      const fromCountry = getLabelSystemForCountry(profile.code)?.id ?? null;
      expect(profile.labelSystem).toBe(fromCountry);
    });
  }
});

describe("isValidLabelValue", () => {
  it("acepta valores definidos del sistema", () => {
    expect(isValidLabelValue("ar_octogonos", "exceso_sodio")).toBe(true);
    expect(isValidLabelValue("cl_sellos", "alto_en_azucares")).toBe(true);
    expect(isValidLabelValue("eu_nutriscore", "A")).toBe(true);
    expect(isValidLabelValue("eu_nutriscore", "E")).toBe(true);
  });

  it("rechaza valores ajenos al sistema", () => {
    // alto_en_* pertenece a CL, no a AR.
    expect(isValidLabelValue("ar_octogonos", "alto_en_sodio")).toBe(false);
    expect(isValidLabelValue("eu_nutriscore", "F")).toBe(false);
    expect(isValidLabelValue("ar_octogonos", "inexistente")).toBe(false);
  });

  it("us_fda no tiene valores frontales", () => {
    expect(getLabelSystem("us_fda").values).toHaveLength(0);
    expect(isValidLabelValue("us_fda", "exceso_sodio")).toBe(false);
  });
});

describe("LABEL_SYSTEMS — integridad", () => {
  it("kind grade (Nutri-Score) tiene 5 grados", () => {
    expect(getLabelSystem("eu_nutriscore").kind).toBe("grade");
    expect(getLabelSystem("eu_nutriscore").values.map((v) => v.id)).toEqual([
      "A",
      "B",
      "C",
      "D",
      "E",
    ]);
  });

  it("ids de valores únicos por sistema", () => {
    for (const system of Object.values(LABEL_SYSTEMS)) {
      const ids = system.values.map((v) => v.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe("getPermitTypes — filtro por país + genéricos", () => {
  it("AR incluye permisos argentinos y genéricos", () => {
    const ids = getPermitTypes("AR").map((p) => p.id);
    expect(ids).toContain("rne");
    expect(ids).toContain("rnpa");
    expect(ids).toContain("uta");
    // genéricos siempre presentes
    expect(ids).toContain("habilitacion_municipal");
    expect(ids).toContain("otro");
    // no debe traer permisos de otros países
    expect(ids).not.toContain("cofepris_aviso_funcionamiento");
  });

  it("filtra por entidad vehicle", () => {
    const ids = getPermitTypes("AR", "vehicle").map((p) => p.id);
    expect(ids).toContain("uta");
    expect(ids).toContain("ura");
    expect(ids).toContain("otro"); // genérico aplica a vehicle
    expect(ids).not.toContain("rne"); // rne no es de vehicle
    expect(ids).not.toContain("habilitacion_municipal"); // solo establishment
  });

  it("filtra por entidad recipe (MX)", () => {
    const ids = getPermitTypes("MX", "recipe").map((p) => p.id);
    expect(ids).toContain("cofepris_registro_sanitario");
    expect(ids).toContain("otro");
    expect(ids).not.toContain("permiso_sct");
  });

  it("país desconocido devuelve solo genéricos", () => {
    const ids = getPermitTypes("ZZ").map((p) => p.id);
    expect(ids).toEqual(
      expect.arrayContaining(["habilitacion_municipal", "otro"])
    );
    expect(ids.every((id) => ["habilitacion_municipal", "otro"].includes(id)))
      .toBe(true);
  });

  it("sin país devuelve solo genéricos", () => {
    const ids = getPermitTypes(null).map((p) => p.id);
    expect(ids.every((id) => ["habilitacion_municipal", "otro"].includes(id)))
      .toBe(true);
  });
});

describe("getPermitType / getPermitLabel", () => {
  it("getPermitType devuelve el tipo o undefined", () => {
    expect(getPermitType("rne")?.label).toBe("RNE");
    expect(getPermitType("nope")).toBeUndefined();
  });

  it("getPermitLabel hace fallback al id", () => {
    expect(getPermitLabel("rnpa")).toBe("RNPA");
    expect(getPermitLabel("id_desconocido")).toBe("id_desconocido");
  });

  it("ids de permisos únicos", () => {
    const ids = PERMIT_TYPES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
