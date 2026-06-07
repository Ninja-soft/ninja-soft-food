// =============================================================================
// lib/globalization/permitTypes — catálogo de tipos de permiso/habilitación
// regulatoria por país. Datos puros + helpers. Los ids son contrato fijo: los
// consume una migración SQL paralela (regulatory_permits, tabla genérica que
// reemplaza las columnas RNE/RNPA/RUCA/UTA/URA) y la UI después.
// =============================================================================

import type { CountryCode } from "./countries";

// Entidad a la que aplica el permiso. Coherente con el modelo de datos.
export type PermitEntityType =
  | "tenant"
  | "establishment"
  | "supplier"
  | "vehicle"
  | "recipe";

export type PermitType = {
  id: string;
  // label en español (UI base del producto).
  label: string;
  // description: glosa corta del permiso.
  description: string;
  entityTypes: PermitEntityType[];
  hasExpiry: boolean;
  // country: ISO-2 del país que lo exige, o null si es genérico (todos).
  country: CountryCode | null;
};

export const PERMIT_TYPES: PermitType[] = [
  // --- Argentina ---
  {
    id: "rne",
    label: "RNE",
    description: "Registro Nacional de Establecimiento",
    entityTypes: ["establishment", "supplier"],
    hasExpiry: true,
    country: "AR",
  },
  {
    id: "rnpa",
    label: "RNPA",
    description: "Registro Nacional de Producto Alimenticio",
    entityTypes: ["recipe"],
    hasExpiry: true,
    country: "AR",
  },
  {
    id: "ruca",
    label: "RUCA",
    description: "Registro Único de Operadores de la Cadena Agroalimentaria",
    entityTypes: ["establishment"],
    hasExpiry: true,
    country: "AR",
  },
  {
    id: "uta",
    label: "UTA",
    description: "Unidad de Transporte de Alimentos",
    entityTypes: ["vehicle"],
    hasExpiry: true,
    country: "AR",
  },
  {
    id: "ura",
    label: "URA",
    description: "Unidad de Refrigeración de Alimentos",
    entityTypes: ["vehicle"],
    hasExpiry: true,
    country: "AR",
  },

  // --- México ---
  {
    id: "cofepris_aviso_funcionamiento",
    label: "Aviso de funcionamiento COFEPRIS",
    description: "Aviso de funcionamiento ante COFEPRIS",
    entityTypes: ["establishment", "supplier"],
    hasExpiry: false,
    country: "MX",
  },
  {
    id: "cofepris_registro_sanitario",
    label: "Registro sanitario COFEPRIS",
    description: "Registro sanitario de producto ante COFEPRIS",
    entityTypes: ["recipe"],
    hasExpiry: true,
    country: "MX",
  },
  {
    id: "permiso_sct",
    label: "Permiso SCT",
    description: "Permiso de autotransporte de carga (SCT/SICT)",
    entityTypes: ["vehicle"],
    hasExpiry: true,
    country: "MX",
  },

  // --- Chile ---
  {
    id: "resolucion_sanitaria",
    label: "Resolución sanitaria",
    description: "Resolución sanitaria de la SEREMI de Salud",
    entityTypes: ["establishment", "supplier"],
    hasExpiry: true,
    country: "CL",
  },
  {
    id: "autorizacion_transporte_alimentos",
    label: "Autorización de transporte de alimentos",
    description: "Autorización sanitaria para transporte de alimentos",
    entityTypes: ["vehicle"],
    hasExpiry: true,
    country: "CL",
  },

  // --- Brasil ---
  {
    id: "alvara_sanitario",
    label: "Alvará sanitário",
    description: "Alvará sanitário do estabelecimento (Vigilância Sanitária)",
    entityTypes: ["establishment", "supplier"],
    hasExpiry: true,
    country: "BR",
  },
  {
    id: "registro_anvisa",
    label: "Registro ANVISA",
    description: "Registro de produto na ANVISA",
    entityTypes: ["recipe"],
    hasExpiry: true,
    country: "BR",
  },
  {
    id: "licenca_transporte",
    label: "Licença de transporte",
    description: "Licença sanitária para transporte de alimentos",
    entityTypes: ["vehicle"],
    hasExpiry: true,
    country: "BR",
  },

  // --- España ---
  {
    id: "rgseaa",
    label: "RGSEAA",
    description:
      "Registro General Sanitario de Empresas Alimentarias y Alimentos",
    entityTypes: ["establishment", "supplier"],
    hasExpiry: false,
    country: "ES",
  },
  {
    id: "autorizacion_atp",
    label: "Autorización ATP",
    description: "Certificado ATP para transporte de perecederos",
    entityTypes: ["vehicle"],
    hasExpiry: true,
    country: "ES",
  },

  // --- Estados Unidos ---
  {
    id: "fda_registration",
    label: "FDA registration",
    description: "FDA food facility registration",
    entityTypes: ["establishment", "supplier"],
    hasExpiry: true,
    country: "US",
  },
  {
    id: "dot_permit",
    label: "DOT permit",
    description: "USDOT motor carrier operating authority",
    entityTypes: ["vehicle"],
    hasExpiry: true,
    country: "US",
  },

  // --- Genéricos (válidos para todos los países) ---
  {
    id: "habilitacion_municipal",
    label: "Habilitación municipal",
    description: "Habilitación comercial otorgada por el municipio",
    entityTypes: ["establishment"],
    hasExpiry: true,
    country: null,
  },
  {
    id: "otro",
    label: "Otro",
    description: "Otro permiso o habilitación no listado",
    entityTypes: ["tenant", "establishment", "supplier", "vehicle", "recipe"],
    hasExpiry: false,
    country: null,
  },
];

// getPermitTypes: permisos del país (los específicos + los genéricos country=null),
// opcionalmente filtrados por entidad. País desconocido => solo genéricos.
export function getPermitTypes(
  countryCode?: string | null,
  entityType?: PermitEntityType
): PermitType[] {
  const code = countryCode ? (countryCode.toUpperCase() as CountryCode) : null;
  return PERMIT_TYPES.filter((p) => {
    const matchesCountry = p.country === null || p.country === code;
    if (!matchesCountry) return false;
    if (entityType && !p.entityTypes.includes(entityType)) return false;
    return true;
  });
}

export function getPermitType(id: string): PermitType | undefined {
  return PERMIT_TYPES.find((p) => p.id === id);
}

// getPermitLabel: label legible con fallback al id si el permiso no existe.
export function getPermitLabel(id: string): string {
  return getPermitType(id)?.label ?? id;
}
