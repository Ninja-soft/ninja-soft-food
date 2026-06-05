// Datos estáticos de la landing comercial.
// Los precios replican el seed (supabase/seed.sql): start/pro/business en ARS,
// yearly = 10 meses (2 de descuento por pago anual). enterprise es a medida.
// No se leen de la base a propósito: la landing es pública/anónima y los precios
// son contenido comercial estático (igual que en el seed).
//
// FUENTE DE VERDAD COMERCIAL = tabla `plans` (editable desde el panel interno,
// /internal/planes). Estos valores son solo marketing estático: si se cambian
// los precios en el panel, SINCRONIZAR MANUALMENTE este archivo.

import type { LucideIcon } from "lucide-react";
import {
  ClipboardCheck,
  FileSpreadsheet,
  FlaskConical,
  PackageSearch,
  QrCode,
  Siren,
} from "lucide-react";

export type Feature = {
  icon: LucideIcon;
  title: string;
  description: string;
};

export const FEATURES: Feature[] = [
  {
    icon: QrCode,
    title: "Trazabilidad completa con QR público",
    description:
      "Del ingreso del ingrediente al despacho: cada lote queda encadenado en un snapshot inmutable que el consumidor verifica escaneando un QR.",
  },
  {
    icon: ClipboardCheck,
    title: "Planillas BPM/POES configurables",
    description:
      "Armá tus propias planillas de higiene y control con firma del operario por PIN. Registros inalterables, listos para auditoría.",
  },
  {
    icon: Siren,
    title: "Recall en minutos",
    description:
      "Trazabilidad inversa CAA Art. 1415: ante un incidente, identificá al instante qué lotes salieron, a qué clientes y por qué proveedor entraron.",
  },
  {
    icon: PackageSearch,
    title: "Stock con lotes y vencimientos",
    description:
      "Ingreso por lote con proveedor, RNE y vencimiento. Alertas anticipadas y la regla de congelados (+60 días) del Código Alimentario aplicada sola.",
  },
  {
    icon: FlaskConical,
    title: "Informes y análisis de laboratorio",
    description:
      "Cargá análisis fisicoquímicos y microbiológicos con conformidad 0-100 e informes bromatológicos versionados, con adjuntos seguros por establecimiento.",
  },
  {
    icon: FileSpreadsheet,
    title: "Excel-first, todo exportable",
    description:
      "Cada listado se baja a Excel y cada planilla se imprime. Tus datos siempre disponibles para el bromatólogo, el contador o el organismo de control.",
  },
];

export type Step = {
  number: string;
  title: string;
  description: string;
};

export const STEPS: Step[] = [
  {
    number: "01",
    title: "Cargá ingredientes y recetas",
    description:
      "Definí tu materia prima, proveedores y fórmulas con RNPA y octógonos de la Ley 27.642 calculados automáticamente.",
  },
  {
    number: "02",
    title: "Producí con lotes trazables",
    description:
      "Cada producción consume lotes por FEFO en una transacción, firma el operario y genera el lote de producto terminado con su vencimiento.",
  },
  {
    number: "03",
    title: "Despachá con remito y QR",
    description:
      "Asociá cliente y vehículo (UTA/URA), emití el remito en PDF y publicá la traza con su QR para el consumidor final.",
  },
];

export type Plan = {
  key: string;
  name: string;
  tagline: string;
  monthlyArs: number;
  yearlyArs: number;
  highlight: boolean;
  features: string[];
};

// Precios ARS espejados del seed (supabase/seed.sql). yearly = 10 meses.
export const PLANS: Plan[] = [
  {
    key: "start",
    name: "Inicio",
    tagline: "Para arrancar a trazar tu producción.",
    monthlyArs: 24990,
    yearlyArs: 249900,
    highlight: false,
    features: [
      "1 establecimiento",
      "Hasta 3 usuarios",
      "Hasta 30 recetas",
      "Hasta 100 producciones por mes",
      "Trazabilidad con QR público",
      "Stock con lotes y vencimientos",
    ],
  },
  {
    key: "pro",
    name: "Pyme",
    tagline: "El núcleo bromatológico completo.",
    monthlyArs: 59990,
    yearlyArs: 599900,
    highlight: true,
    features: [
      "Todo lo de Inicio",
      "Hasta 10 usuarios",
      "Recetas y producciones sin límite mensual ajustado",
      "Planillas BPM/POES configurables",
      "Módulo de calidad e informes",
      "KPIs y reportes avanzados",
    ],
  },
  {
    key: "business",
    name: "Industria",
    tagline: "Multi-establecimiento e integraciones.",
    monthlyArs: 119990,
    yearlyArs: 1199900,
    highlight: false,
    features: [
      "Todo lo de Pyme",
      "Hasta 5 establecimientos",
      "Hasta 30 usuarios",
      "Producciones sin límite",
      "API pública v1 y webhooks",
      "Integraciones",
    ],
  },
];

export type ComplianceItem = {
  abbr: string;
  label: string;
};

export const COMPLIANCE: ComplianceItem[] = [
  { abbr: "CAA", label: "Código Alimentario Argentino" },
  { abbr: "SENASA", label: "Sanidad agroalimentaria" },
  { abbr: "ASSAL", label: "Agencia Santafesina de Seguridad Alimentaria" },
  { abbr: "Ley 27.642", label: "Etiquetado frontal · octógonos" },
];
