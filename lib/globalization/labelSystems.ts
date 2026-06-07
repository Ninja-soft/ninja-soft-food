// =============================================================================
// lib/globalization/labelSystems — catálogo de sistemas de rotulado frontal
// por país. Datos puros + helpers. Los ids son contrato fijo: los consume una
// migración SQL paralela (regulatory_labels) y la UI de recetas. NO cambiar ids
// sin coordinar el wiring completo.
// =============================================================================

import type { CountryCode } from "./countries";

export type LabelSystemId =
  | "ar_octogonos"
  | "mx_nom051"
  | "cl_sellos"
  | "br_anvisa"
  | "eu_nutriscore"
  | "us_fda";

// kind define cómo se selecciona/renderiza el rotulado:
// - multi-seal: 0..N sellos de advertencia (octógonos, ALTO EN, lupa)
// - grade: una sola calificación (Nutri-Score A..E)
// - none: sin sellos frontales (FDA: panel Nutrition Facts, sin advertencias)
export type LabelSystemKind = "multi-seal" | "grade" | "none";

export type LabelSealShape = "octagon" | "rect" | "magnifier" | "scale";

export type LabelValue = {
  id: string;
  // label en español (UI base del producto).
  label: string;
  // labelLocal: texto en el idioma local del sistema cuando difiere del español.
  labelLocal?: string;
};

export type LabelSeal = {
  shape: LabelSealShape;
  // bg/fg como tokens descriptivos, NO hex de diseño (la UI los mapea a tokens).
  bg: string;
  fg: string;
};

export type LabelSystem = {
  id: LabelSystemId;
  name: string;
  shortName: string;
  // country: ISO-2 principal del sistema.
  country: CountryCode;
  // countries: todos los países que adoptan el sistema.
  countries: CountryCode[];
  kind: LabelSystemKind;
  legalRef: string;
  values: LabelValue[];
  seal: LabelSeal;
};

// RegulatoryLabels: selección concreta de un producto.
// Para kind "grade" (eu_nutriscore) values tiene exactamente 1 elemento.
// Para kind "none" (us_fda) values es [].
export type RegulatoryLabels = {
  system: LabelSystemId;
  values: string[];
};

export const LABEL_SYSTEMS: Record<LabelSystemId, LabelSystem> = {
  ar_octogonos: {
    id: "ar_octogonos",
    name: "Octógonos de advertencia",
    shortName: "Octógonos",
    country: "AR",
    countries: ["AR"],
    kind: "multi-seal",
    legalRef: "Ley 27.642 (Etiquetado Frontal)",
    values: [
      { id: "exceso_azucares", label: "Exceso en azúcares" },
      { id: "exceso_sodio", label: "Exceso en sodio" },
      { id: "exceso_grasas_totales", label: "Exceso en grasas totales" },
      { id: "exceso_grasas_saturadas", label: "Exceso en grasas saturadas" },
      { id: "exceso_calorias", label: "Exceso en calorías" },
      { id: "contiene_cafeina", label: "Contiene cafeína" },
      { id: "contiene_edulcorantes", label: "Contiene edulcorantes" },
    ],
    seal: { shape: "octagon", bg: "black", fg: "white" },
  },
  mx_nom051: {
    id: "mx_nom051",
    name: "Sellos de advertencia NOM-051",
    shortName: "NOM-051",
    country: "MX",
    countries: ["MX"],
    kind: "multi-seal",
    legalRef: "NOM-051-SCFI/SSA1-2010",
    values: [
      { id: "exceso_calorias", label: "Exceso de calorías", labelLocal: "EXCESO CALORÍAS" },
      { id: "exceso_azucares", label: "Exceso de azúcares", labelLocal: "EXCESO AZÚCARES" },
      {
        id: "exceso_grasas_saturadas",
        label: "Exceso de grasas saturadas",
        labelLocal: "EXCESO GRASAS SATURADAS",
      },
      {
        id: "exceso_grasas_trans",
        label: "Exceso de grasas trans",
        labelLocal: "EXCESO GRASAS TRANS",
      },
      { id: "exceso_sodio", label: "Exceso de sodio", labelLocal: "EXCESO SODIO" },
      { id: "contiene_cafeina", label: "Contiene cafeína", labelLocal: "CONTIENE CAFEÍNA" },
      {
        id: "contiene_edulcorantes",
        label: "Contiene edulcorantes",
        labelLocal: "CONTIENE EDULCORANTES",
      },
    ],
    seal: { shape: "octagon", bg: "black", fg: "white" },
  },
  cl_sellos: {
    id: "cl_sellos",
    name: 'Sellos "ALTO EN"',
    shortName: "ALTO EN",
    country: "CL",
    countries: ["CL"],
    kind: "multi-seal",
    legalRef: "Ley 20.606 (Etiquetado de Alimentos)",
    values: [
      { id: "alto_en_calorias", label: "Alto en calorías", labelLocal: "ALTO EN CALORÍAS" },
      { id: "alto_en_azucares", label: "Alto en azúcares", labelLocal: "ALTO EN AZÚCARES" },
      {
        id: "alto_en_grasas_saturadas",
        label: "Alto en grasas saturadas",
        labelLocal: "ALTO EN GRASAS SATURADAS",
      },
      { id: "alto_en_sodio", label: "Alto en sodio", labelLocal: "ALTO EN SODIO" },
    ],
    seal: { shape: "octagon", bg: "black", fg: "white" },
  },
  br_anvisa: {
    id: "br_anvisa",
    name: "Lupa de advertencia ANVISA",
    shortName: "Lupa ANVISA",
    country: "BR",
    countries: ["BR"],
    kind: "multi-seal",
    legalRef: "RDC 429/2020",
    values: [
      {
        id: "alto_em_acucar_adicionado",
        label: "Alto en azúcar añadido",
        labelLocal: "ALTO EM AÇÚCAR ADICIONADO",
      },
      {
        id: "alto_em_gordura_saturada",
        label: "Alto en grasa saturada",
        labelLocal: "ALTO EM GORDURA SATURADA",
      },
      { id: "alto_em_sodio", label: "Alto en sodio", labelLocal: "ALTO EM SÓDIO" },
    ],
    seal: { shape: "magnifier", bg: "white", fg: "black" },
  },
  eu_nutriscore: {
    id: "eu_nutriscore",
    name: "Nutri-Score",
    shortName: "Nutri-Score",
    country: "ES",
    countries: ["ES", "FR", "DE", "PT"],
    kind: "grade",
    legalRef: "Nutri-Score (esquema voluntario UE)",
    values: [
      { id: "A", label: "A" },
      { id: "B", label: "B" },
      { id: "C", label: "C" },
      { id: "D", label: "D" },
      { id: "E", label: "E" },
    ],
    seal: { shape: "rect", bg: "gradient", fg: "white" },
  },
  us_fda: {
    id: "us_fda",
    name: "FDA Nutrition Facts",
    shortName: "Nutrition Facts",
    country: "US",
    countries: ["US"],
    kind: "none",
    legalRef: "FDA 21 CFR 101.9",
    values: [],
    seal: { shape: "rect", bg: "white", fg: "black" },
  },
};

// Mapeo país -> sistema de rotulado. SIN fallback a AR: país desconocido o sin
// sistema definido devuelve undefined (la decisión de qué hacer es del caller).
const COUNTRY_LABEL_SYSTEM: Partial<Record<CountryCode, LabelSystemId>> = {
  AR: "ar_octogonos",
  MX: "mx_nom051",
  CL: "cl_sellos",
  BR: "br_anvisa",
  ES: "eu_nutriscore",
  FR: "eu_nutriscore",
  DE: "eu_nutriscore",
  PT: "eu_nutriscore",
  US: "us_fda",
};

export function getLabelSystem(id: LabelSystemId): LabelSystem {
  return LABEL_SYSTEMS[id];
}

export function getLabelSystemForCountry(
  countryCode?: string | null
): LabelSystem | undefined {
  if (!countryCode) return undefined;
  const id = COUNTRY_LABEL_SYSTEM[countryCode.toUpperCase() as CountryCode];
  return id ? LABEL_SYSTEMS[id] : undefined;
}

export function isValidLabelValue(
  systemId: LabelSystemId,
  value: string
): boolean {
  const system = LABEL_SYSTEMS[systemId];
  if (!system) return false;
  return system.values.some((v) => v.id === value);
}
