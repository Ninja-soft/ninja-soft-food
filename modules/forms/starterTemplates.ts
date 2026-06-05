import type { TemplateInput } from "./schemas";

// ============================================================================
// Templates default por rubro (BPM/POES/PCC) — PUNTO DE PARTIDA editable.
//
// Regla 10 (nada hardcodeado al cliente): estos templates son un STARTER PACK
// que se siembra al onboardear el tenant SOLO si no tiene planillas todavía.
// El tenant puede editar, desactivar o borrar cualquiera desde el builder: no
// son rígidos ni atados a ningún cliente. Los rangos (temperaturas, °C de
// cocción, áreas, cámaras) son valores genéricos de la normativa argentina
// (CAA / BPM / POES) que cada planta ajusta a su realidad.
//
// Cada objeto valida contra templateSchema de ./schemas (mismo contrato que el
// builder). El rubro proviene del enum tenant_industry / INDUSTRY_OPTIONS:
//   frigorifico · panaderia · lacteos · conservas · catering · otro
//
// Contenido de dominio en español rioplatense (labels, opciones, acciones).
// ============================================================================

/** Rubros válidos (espejo de tenant_industry / auth INDUSTRY_OPTIONS). */
export const STARTER_RUBROS = [
  "frigorifico",
  "panaderia",
  "lacteos",
  "conservas",
  "catering",
  "otro",
] as const;
export type StarterRubro = (typeof STARTER_RUBROS)[number];

// Acción correctiva reutilizable: instrucción concreta para registros 'fail'.
const ACTION_TEMP = {
  instructions:
    "Registrar acción correctiva, notificar al responsable de calidad y volver a medir a los 30 minutos. Si la desviación persiste, reubicar la mercadería a una cámara conforme y dar aviso al servicio técnico de refrigeración.",
} as const;

const ACTION_LIMPIEZA = {
  instructions:
    "Repetir la limpieza y desinfección del área observada con el producto y la dilución del POES, dejar actuar el tiempo de contacto indicado y volver a verificar antes de habilitar el sector.",
} as const;

const ACTION_PLAGAS = {
  instructions:
    "Notificar al responsable de calidad y a la empresa de control de plagas (MIP), registrar la acción tomada y reforzar la frecuencia de monitoreo hasta confirmar la ausencia de actividad.",
} as const;

const ACTION_RECEPCION = {
  instructions:
    "Rechazar o segregar la materia prima no conforme, dejar constancia con el proveedor (remito/nota), notificar al responsable de calidad y no liberar el lote a producción hasta su resolución.",
} as const;

const ACTION_PCC = {
  instructions:
    "Detener el proceso, separar el producto afectado, continuar la cocción hasta alcanzar la temperatura interna objetivo y volver a medir. Si no se alcanza, descartar el lote y registrar la acción correctiva.",
} as const;

// ── Templates comunes a todo rubro ───────────────────────────────────────────

const TEMPLATE_TEMPERATURA_CAMARAS: TemplateInput = {
  name: "Control de temperatura de cámaras",
  kind: "temperatura",
  frequency: { type: "daily" },
  requires_signature: true,
  action_on_fail: ACTION_TEMP,
  fields: [
    {
      key: "camara",
      label: "Cámara",
      type: "select",
      required: true,
      // Opciones genéricas editables por el tenant (regla 10).
      options: ["Cámara 1", "Cámara 2", "Cámara 3"],
    },
    {
      key: "temperatura",
      label: "Temperatura (°C)",
      type: "temperature",
      required: true,
      // Rango amplio cámara fría/congelado; cada cámara ajusta su set point.
      min: -30,
      max: 8,
      unit: "°C",
    },
    {
      key: "observaciones",
      label: "Observaciones",
      type: "text",
      required: false,
    },
  ],
};

const TEMPLATE_LIMPIEZA: TemplateInput = {
  name: "Limpieza y desinfección por área (POES)",
  kind: "limpieza",
  frequency: { type: "daily" },
  requires_signature: true,
  action_on_fail: ACTION_LIMPIEZA,
  fields: [
    {
      key: "area_produccion",
      label: "Área de producción limpia y desinfectada",
      type: "bool",
      required: true,
    },
    {
      key: "area_camaras",
      label: "Cámaras y heladeras limpias",
      type: "bool",
      required: true,
    },
    {
      key: "area_pisos_desagues",
      label: "Pisos y desagües limpios",
      type: "bool",
      required: true,
    },
    {
      key: "area_sanitarios",
      label: "Sanitarios y vestuarios limpios",
      type: "bool",
      required: true,
    },
    {
      key: "producto_usado",
      label: "Producto de limpieza utilizado",
      type: "text",
      required: true,
    },
    {
      key: "observaciones",
      label: "Observaciones",
      type: "text",
      required: false,
    },
  ],
};

const TEMPLATE_PLAGAS: TemplateInput = {
  name: "Control de plagas (MIP)",
  kind: "plagas",
  frequency: { type: "monthly" },
  requires_signature: false,
  action_on_fail: ACTION_PLAGAS,
  fields: [
    {
      key: "evidencia_plagas",
      label: "Se detectó evidencia de plagas",
      type: "bool",
      required: true,
    },
    {
      key: "cebos_revisados",
      label: "Cebos y trampas revisados",
      type: "bool",
      required: true,
    },
    {
      key: "accion",
      label: "Acción realizada",
      type: "text",
      required: true,
    },
    {
      key: "observaciones",
      label: "Observaciones",
      type: "text",
      required: false,
    },
  ],
};

const TEMPLATE_RECEPCION_MP: TemplateInput = {
  name: "Recepción de materia prima",
  kind: "recepcion_mp",
  frequency: { type: "none" }, // por evento
  requires_signature: true,
  action_on_fail: ACTION_RECEPCION,
  fields: [
    {
      key: "proveedor",
      label: "Proveedor",
      type: "text",
      required: true,
    },
    {
      key: "producto",
      label: "Producto recibido",
      type: "text",
      required: true,
    },
    {
      key: "temperatura_recepcion",
      label: "Temperatura de recepción (°C)",
      type: "temperature",
      required: true,
      min: -30,
      max: 8,
      unit: "°C",
    },
    {
      key: "estado_envases",
      label: "Estado de envases",
      type: "select",
      required: true,
      options: ["OK", "Dañado"],
    },
    {
      key: "vencimiento_visible",
      label: "Fecha de vencimiento visible y vigente",
      type: "bool",
      required: true,
    },
    {
      key: "observaciones",
      label: "Observaciones",
      type: "text",
      required: false,
    },
  ],
};

const TEMPLATE_CAPACITACION: TemplateInput = {
  name: "Capacitación de personal",
  kind: "capacitacion",
  frequency: { type: "monthly" },
  requires_signature: false,
  action_on_fail: null,
  fields: [
    {
      key: "tema",
      label: "Tema de la capacitación",
      type: "text",
      required: true,
    },
    {
      key: "asistentes",
      label: "Cantidad de asistentes",
      type: "number",
      required: true,
      min: 0,
    },
    {
      key: "duracion_horas",
      label: "Duración (horas)",
      type: "number",
      required: true,
      min: 0,
      unit: "h",
    },
    {
      key: "observaciones",
      label: "Observaciones",
      type: "text",
      required: false,
    },
  ],
};

/** Comunes a todos los rubros. */
const COMMON_TEMPLATES: readonly TemplateInput[] = [
  TEMPLATE_TEMPERATURA_CAMARAS,
  TEMPLATE_LIMPIEZA,
  TEMPLATE_PLAGAS,
  TEMPLATE_RECEPCION_MP,
  TEMPLATE_CAPACITACION,
];

// ── Templates específicos: cárnicos (frigorifico) ─────────────────────────────

const TEMPLATE_PCC_COCCION: TemplateInput = {
  name: "PCC — Cocción (temperatura interna)",
  kind: "pcc",
  frequency: { type: "none" }, // por lote / cocción
  requires_signature: true,
  action_on_fail: ACTION_PCC,
  fields: [
    {
      key: "producto",
      label: "Producto / lote",
      type: "text",
      required: true,
    },
    {
      key: "temperatura_interna",
      label: "Temperatura interna alcanzada (°C)",
      type: "temperature",
      required: true,
      // PCC cárnicos: ≥ 70°C en el centro térmico. Sin tope superior.
      min: 70,
      unit: "°C",
    },
    {
      key: "tiempo_sostenido",
      label: "Tiempo sostenido a temperatura objetivo (min)",
      type: "number",
      required: false,
      min: 0,
      unit: "min",
    },
    {
      key: "observaciones",
      label: "Observaciones",
      type: "text",
      required: false,
    },
  ],
};

const TEMPLATE_SANITIZADO_SUPERFICIES: TemplateInput = {
  name: "Sanitizado de superficies en contacto",
  kind: "limpieza",
  frequency: { type: "daily" },
  requires_signature: true,
  action_on_fail: ACTION_LIMPIEZA,
  fields: [
    {
      key: "mesadas_tablas",
      label: "Mesadas y tablas sanitizadas",
      type: "bool",
      required: true,
    },
    {
      key: "cuchillos_utensilios",
      label: "Cuchillos y utensilios sanitizados",
      type: "bool",
      required: true,
    },
    {
      key: "sierra_picadora",
      label: "Sierra / picadora sanitizada",
      type: "bool",
      required: true,
    },
    {
      key: "sanitizante",
      label: "Sanitizante y concentración utilizada",
      type: "text",
      required: true,
    },
    {
      key: "observaciones",
      label: "Observaciones",
      type: "text",
      required: false,
    },
  ],
};

// ── Templates específicos: panificados (panaderia) ────────────────────────────

const TEMPLATE_HORNEADO: TemplateInput = {
  name: "Control de horneado",
  kind: "temperatura",
  frequency: { type: "none" }, // por hornada
  requires_signature: true,
  action_on_fail: {
    instructions:
      "Ajustar la temperatura del horno o el tiempo de cocción, descartar la hornada no conforme y volver a controlar antes de continuar la producción.",
  },
  fields: [
    {
      key: "producto",
      label: "Producto / hornada",
      type: "text",
      required: true,
    },
    {
      key: "temperatura_horno",
      label: "Temperatura del horno (°C)",
      type: "temperature",
      required: true,
      min: 120,
      max: 280,
      unit: "°C",
    },
    {
      key: "tiempo_horneado",
      label: "Tiempo de horneado (min)",
      type: "number",
      required: true,
      min: 0,
      unit: "min",
    },
    {
      key: "observaciones",
      label: "Observaciones",
      type: "text",
      required: false,
    },
  ],
};

// ── Templates específicos: lácteos (lacteos) ──────────────────────────────────

const TEMPLATE_PASTEURIZACION: TemplateInput = {
  name: "PCC — Pasteurización",
  kind: "pcc",
  frequency: { type: "none" }, // por lote
  requires_signature: true,
  action_on_fail: {
    instructions:
      "Detener el envasado, redirigir la leche a re-pasteurización, separar el producto afectado y registrar la acción correctiva. No liberar el lote hasta confirmar el binomio tiempo/temperatura.",
  },
  fields: [
    {
      key: "lote",
      label: "Lote",
      type: "text",
      required: true,
    },
    {
      key: "temperatura_pasteurizacion",
      label: "Temperatura de pasteurización (°C)",
      type: "temperature",
      required: true,
      // Pasteurización alta (HTST): ~72°C/15s como referencia mínima.
      min: 72,
      max: 95,
      unit: "°C",
    },
    {
      key: "tiempo_sostenido",
      label: "Tiempo de sostenimiento (s)",
      type: "number",
      required: true,
      min: 15,
      unit: "s",
    },
    {
      key: "observaciones",
      label: "Observaciones",
      type: "text",
      required: false,
    },
  ],
};

// ── Templates específicos: conservas (conservas) ──────────────────────────────

const TEMPLATE_PCC_ESTERILIZACION: TemplateInput = {
  name: "PCC — Tratamiento térmico / pH",
  kind: "pcc",
  frequency: { type: "none" }, // por lote
  requires_signature: true,
  action_on_fail: {
    instructions:
      "Separar el lote, repetir el tratamiento térmico o corregir el pH/acidificación según corresponda, y no liberar el producto hasta validar los parámetros críticos. Registrar la acción correctiva.",
  },
  fields: [
    {
      key: "lote",
      label: "Lote",
      type: "text",
      required: true,
    },
    {
      key: "temperatura_proceso",
      label: "Temperatura de proceso (°C)",
      type: "temperature",
      required: true,
      min: 85,
      max: 130,
      unit: "°C",
    },
    {
      key: "ph_producto",
      label: "pH del producto",
      type: "number",
      required: true,
      min: 0,
      max: 14,
    },
    {
      key: "observaciones",
      label: "Observaciones",
      type: "text",
      required: false,
    },
  ],
};

// ── Templates específicos: catering / cocina central (catering) ───────────────

const TEMPLATE_TEMP_SERVICIO: TemplateInput = {
  name: "Control de temperatura en línea de servicio",
  kind: "temperatura",
  frequency: { type: "daily" },
  requires_signature: true,
  action_on_fail: {
    instructions:
      "Recalentar el alimento caliente por encima de 65°C o reubicar el frío por debajo de 5°C, descartar lo que haya estado en zona de peligro más de 2 horas y registrar la acción correctiva.",
  },
  fields: [
    {
      key: "preparacion",
      label: "Preparación",
      type: "text",
      required: true,
    },
    {
      key: "tipo_servicio",
      label: "Tipo de servicio",
      type: "select",
      required: true,
      options: ["Caliente", "Frío"],
    },
    {
      key: "temperatura",
      label: "Temperatura (°C)",
      type: "temperature",
      required: true,
      // Rango amplio cubre frío (≤5) y caliente (≥65); la zona de peligro
      // 5..65 queda como referencia, el operario aclara en observaciones.
      min: -5,
      max: 90,
      unit: "°C",
    },
    {
      key: "observaciones",
      label: "Observaciones",
      type: "text",
      required: false,
    },
  ],
};

// ── Catálogo por rubro ────────────────────────────────────────────────────────

// Solo templates ESPECÍFICOS del rubro (los comunes se agregan en runtime).
const RUBRO_TEMPLATES: Record<StarterRubro, readonly TemplateInput[]> = {
  frigorifico: [TEMPLATE_PCC_COCCION, TEMPLATE_SANITIZADO_SUPERFICIES],
  panaderia: [TEMPLATE_HORNEADO],
  lacteos: [TEMPLATE_PASTEURIZACION],
  conservas: [TEMPLATE_PCC_ESTERILIZACION],
  catering: [TEMPLATE_TEMP_SERVICIO],
  otro: [],
};

function isStarterRubro(rubro: string): rubro is StarterRubro {
  return (STARTER_RUBROS as readonly string[]).includes(rubro);
}

/**
 * Devuelve los templates iniciales para un rubro: comunes + específicos.
 * Rubro desconocido (o "otro") → solo los comunes.
 *
 * Son un PUNTO DE PARTIDA editable (regla 10): el tenant los ajusta a su planta.
 */
export function getStarterTemplates(rubro: string): TemplateInput[] {
  const specific = isStarterRubro(rubro) ? RUBRO_TEMPLATES[rubro] : [];
  return [...COMMON_TEMPLATES, ...specific];
}
