// Datos estáticos de la landing comercial.
//
// IMPORTANTE: los precios y límites NO viven acá. La fuente de verdad es la
// tabla `plans` (editable desde /internal/planes), que la landing lee
// server-side (modules/billing/server.ts → app/(public)/page.tsx). Este archivo
// solo guarda COPY de marketing: el orden visual de los planes y el detalle de
// features por plan, matcheado por `key` con las filas de la DB.

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

// PlanCopy — solo marketing por plan (key, tagline, features destacadas y si va
// resaltado en el grid). Los números (precio, límites) los trae la DB. Se
// matchea por `key` con las filas de `plans`. Si la DB tiene un plan self-service
// que no figura acá, la landing usa fallback genérico (ver Pricing.tsx).
export type PlanCopy = {
  key: string;
  tagline: string;
  highlight: boolean;
  features: string[];
};

export const PLAN_COPY: Record<string, PlanCopy> = {
  start: {
    key: "start",
    tagline: "Para arrancar a trazar tu producción.",
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
  pro: {
    key: "pro",
    tagline: "El núcleo bromatológico completo.",
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
  business: {
    key: "business",
    tagline: "Multi-establecimiento e integraciones.",
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
};

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
