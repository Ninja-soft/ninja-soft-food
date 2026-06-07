import { z } from "zod";
import { ingredientSchema } from "@/modules/ingredients/schemas";
import { customerSchema } from "@/modules/dispatch/schemas";
import { supplierSchema } from "@/modules/stock/schemas";
import {
  parseBoolEs,
  parseDateEs,
  parseNumberEs,
  type RawRow,
  type TemplateColumn,
  type TemplateSpec,
} from "@/lib/utils/xlsxImport";

// Specs de importación por módulo. La REGLA DE NEGOCIO no se duplica: cada
// módulo deriva su validación del schema zod del dominio (ingredientes, clientes,
// proveedores). Acá solo vive: columnas de la plantilla, el mapeo de fila cruda
// (es-AR) -> shape que entiende el schema, la clave de duplicado y el insert.

// ── Resultado de validar una fila ─────────────────────────────────────────────

export type RowStatus = "ok" | "error" | "duplicate";

export interface ValidatedRow<T> {
  /** Número de fila de datos (1-based) en el archivo original. */
  rowNumber: number;
  /** Valores crudos por key (para preview y reporte de rechazos). */
  raw: RawRow;
  /** Estado del semáforo de validación. */
  status: RowStatus;
  /** Mensaje de error es-AR (si status !== "ok"). */
  error?: string;
  /** Dato ya parseado y validado (solo si status === "ok"). */
  data?: T;
  /** Clave normalizada de duplicado (para detección entre filas y contra DB). */
  dupKey?: string;
}

// ── Definición genérica de un módulo importable ───────────────────────────────

export interface ImportModuleDef<T> {
  /** Identificador interno. */
  id: string;
  /** Etiqueta es-AR (ej. "Ingredientes"). */
  label: string;
  /** Spec de la plantilla (columnas + instrucciones). */
  template: TemplateSpec;
  /** Nombre base del archivo de plantilla (sin extensión). */
  templateFilename: string;
  /**
   * Valida y mapea UNA fila cruda. Función PURA (testeable sin DB).
   * `existingKeys` = set de claves de duplicado ya existentes (DB + filas previas).
   * Devuelve la fila validada con su estado.
   */
  validateRow: (
    raw: RawRow,
    rowNumber: number,
    existingKeys: Set<string>,
  ) => ValidatedRow<T>;
}

// Columnas reutilizables para acceso a sus keys desde otros archivos del módulo.
export const INGREDIENT_COLUMNS: TemplateColumn[] = [
  {
    header: "Nombre",
    key: "name",
    required: true,
    width: 32,
    hint: "Nombre del ingrediente o materia prima.",
    examples: ["Harina 0000", "Aceite de girasol"],
  },
  {
    header: "Unidad",
    key: "unit",
    required: true,
    width: 12,
    hint: "Unidad de medida: kg, g, l, ml, un.",
    examples: ["kg", "l"],
  },
  {
    header: "Perecedero",
    key: "is_perishable",
    width: 14,
    hint: "Sí / No. Vacío se toma como No.",
    examples: ["No", "Sí"],
  },
  {
    header: "Vida útil (días)",
    key: "default_shelf_days",
    width: 16,
    hint: "Días enteros. Opcional.",
    examples: ["", "180"],
  },
  {
    header: "Stock mínimo",
    key: "low_stock_threshold",
    width: 16,
    hint: "Cantidad para alerta de stock bajo. Opcional.",
    examples: ["10", "5"],
  },
  {
    header: "Descripción",
    key: "description",
    width: 40,
    hint: "Texto libre. Opcional.",
    examples: ["", ""],
  },
];

export const CUSTOMER_COLUMNS: TemplateColumn[] = [
  {
    header: "Nombre / Razón social",
    key: "name",
    required: true,
    width: 34,
    hint: "Nombre del cliente o razón social.",
    examples: ["Panadería La Esquina", "Distribuidora Sur SRL"],
  },
  {
    header: "Localidad",
    key: "locality",
    width: 22,
    hint: "Localidad. Opcional.",
    examples: ["Rosario", "Córdoba"],
  },
  {
    header: "Teléfono",
    key: "phone",
    width: 18,
    hint: "Teléfono de contacto. Opcional.",
    examples: ["3415551234", ""],
  },
  {
    header: "Domicilio",
    key: "address",
    width: 34,
    hint: "Domicilio de entrega. Opcional.",
    examples: ["San Martín 123", ""],
  },
  {
    header: "Email",
    key: "email",
    width: 28,
    hint: "Email válido. Opcional.",
    examples: ["ventas@laesquina.com", ""],
  },
];

export const SUPPLIER_COLUMNS: TemplateColumn[] = [
  {
    header: "Nombre / Razón social",
    key: "name",
    required: true,
    width: 34,
    hint: "Nombre del proveedor o razón social.",
    examples: ["Molinos del Plata SA", "Lácteos del Centro"],
  },
  {
    header: "RNE",
    key: "rne_number",
    width: 22,
    hint: "Número de RNE del establecimiento. Opcional.",
    examples: ["02-031234", ""],
  },
];

// ── Tipos de datos validados (lo que termina insertándose) ────────────────────

export type IngredientImportData = z.infer<typeof ingredientSchema>;
export type CustomerImportData = z.infer<typeof customerSchema>;
export type SupplierImportData = z.infer<typeof supplierSchema>;

// ── Helpers comunes ───────────────────────────────────────────────────────────

/** Clave de duplicado por nombre (normalizada: sin espacios extra, minúsculas). */
export function nameKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Convierte un ZodError en un mensaje es-AR compacto: "Campo: motivo". */
function zodMessage(
  err: z.ZodError,
  labels: Record<string, string>,
): string {
  return err.errors
    .map((e) => {
      const field = String(e.path[0] ?? "");
      const label = labels[field] ?? field;
      return label ? `${label}: ${e.message}` : e.message;
    })
    .join(" · ");
}

// ── Validadores por módulo (PUROS) ────────────────────────────────────────────

const INGREDIENT_LABELS: Record<string, string> = {
  name: "Nombre",
  unit: "Unidad",
  is_perishable: "Perecedero",
  default_shelf_days: "Vida útil",
  low_stock_threshold: "Stock mínimo",
  description: "Descripción",
};

export function validateIngredientRow(
  raw: RawRow,
  rowNumber: number,
  existingKeys: Set<string>,
): ValidatedRow<IngredientImportData> {
  const base: ValidatedRow<IngredientImportData> = {
    rowNumber,
    raw,
    status: "ok",
  };

  // Pre-parseo es-AR de tipos no-string antes del schema.
  const shelf = parseNumberEs(raw.default_shelf_days ?? null);
  const threshold = parseNumberEs(raw.low_stock_threshold ?? null);

  if (raw.default_shelf_days !== null && shelf !== null && Number.isNaN(shelf)) {
    return { ...base, status: "error", error: "Vida útil: número inválido" };
  }
  if (
    raw.low_stock_threshold !== null &&
    threshold !== null &&
    Number.isNaN(threshold)
  ) {
    return { ...base, status: "error", error: "Stock mínimo: número inválido" };
  }

  const candidate = {
    name: raw.name ?? "",
    family_id: null,
    unit: raw.unit ?? "",
    is_perishable: parseBoolEs(raw.is_perishable ?? null) ?? false,
    description: raw.description ?? null,
    low_stock_threshold:
      raw.low_stock_threshold === null || Number.isNaN(threshold)
        ? null
        : threshold,
    default_shelf_days:
      raw.default_shelf_days === null || Number.isNaN(shelf) ? null : shelf,
  };

  const parsed = ingredientSchema.safeParse(candidate);
  if (!parsed.success) {
    return {
      ...base,
      status: "error",
      error: zodMessage(parsed.error, INGREDIENT_LABELS),
    };
  }

  const dupKey = nameKey(parsed.data.name);
  if (existingKeys.has(dupKey)) {
    return { ...base, status: "duplicate", error: "Ya existe (se omite)", dupKey };
  }

  return { ...base, status: "ok", data: parsed.data, dupKey };
}

const CUSTOMER_LABELS: Record<string, string> = {
  name: "Nombre",
  address: "Domicilio",
  locality: "Localidad",
  phone: "Teléfono",
  email: "Email",
};

export function validateCustomerRow(
  raw: RawRow,
  rowNumber: number,
  existingKeys: Set<string>,
): ValidatedRow<CustomerImportData> {
  const base: ValidatedRow<CustomerImportData> = {
    rowNumber,
    raw,
    status: "ok",
  };

  const candidate = {
    name: raw.name ?? "",
    address: raw.address ?? "",
    locality: raw.locality ?? "",
    phone: raw.phone ?? "",
    email: raw.email ?? "",
  };

  const parsed = customerSchema.safeParse(candidate);
  if (!parsed.success) {
    return {
      ...base,
      status: "error",
      error: zodMessage(parsed.error, CUSTOMER_LABELS),
    };
  }

  const dupKey = nameKey(parsed.data.name);
  if (existingKeys.has(dupKey)) {
    return { ...base, status: "duplicate", error: "Ya existe (se omite)", dupKey };
  }

  return { ...base, status: "ok", data: parsed.data, dupKey };
}

const SUPPLIER_LABELS: Record<string, string> = {
  name: "Nombre",
  rne_number: "RNE",
};

export function validateSupplierRow(
  raw: RawRow,
  rowNumber: number,
  existingKeys: Set<string>,
): ValidatedRow<SupplierImportData> {
  const base: ValidatedRow<SupplierImportData> = {
    rowNumber,
    raw,
    status: "ok",
  };

  const candidate = {
    name: raw.name ?? "",
    rne_number: raw.rne_number ?? "",
  };

  const parsed = supplierSchema.safeParse(candidate);
  if (!parsed.success) {
    return {
      ...base,
      status: "error",
      error: zodMessage(parsed.error, SUPPLIER_LABELS),
    };
  }

  const dupKey = nameKey(parsed.data.name);
  if (existingKeys.has(dupKey)) {
    return { ...base, status: "duplicate", error: "Ya existe (se omite)", dupKey };
  }

  return { ...base, status: "ok", data: parsed.data, dupKey };
}

// ── Plantillas (specs completas) ──────────────────────────────────────────────

const COMMON_INSTRUCTIONS: string[] = [
  "Cargá un registro por fila debajo de los encabezados de la hoja de datos.",
  "Las columnas marcadas con asterisco (*) son obligatorias.",
  "Borrá las dos filas de ejemplo (en verde claro) antes de subir el archivo.",
  "No cambies los nombres de los encabezados ni el orden de las columnas.",
  "Las fechas van en formato dd/mm/aaaa (ejemplo: 31/12/2026).",
  "Los números decimales pueden usar coma o punto (ejemplo: 12,5 o 12.5).",
  "Las filas con error o duplicadas se muestran antes de confirmar y no se importan.",
];

export const INGREDIENT_TEMPLATE: TemplateSpec = {
  sheetName: "Ingredientes",
  title: "Plantilla de importación · Ingredientes",
  columns: INGREDIENT_COLUMNS,
  instructions: [
    ...COMMON_INSTRUCTIONS,
    "Perecedero: escribí Sí o No (vacío se toma como No).",
    "Vida útil (días): días enteros de durabilidad. Dejalo vacío si no aplica.",
    "Unidad válida: kg, g, l, ml o un.",
  ],
};

export const CUSTOMER_TEMPLATE: TemplateSpec = {
  sheetName: "Clientes",
  title: "Plantilla de importación · Clientes",
  columns: CUSTOMER_COLUMNS,
  instructions: [
    ...COMMON_INSTRUCTIONS,
    "Email: si lo cargás debe ser válido; podés dejarlo vacío.",
    "Los clientes duplicados (mismo nombre) se omiten.",
  ],
};

export const SUPPLIER_TEMPLATE: TemplateSpec = {
  sheetName: "Proveedores",
  title: "Plantilla de importación · Proveedores",
  columns: SUPPLIER_COLUMNS,
  instructions: [
    ...COMMON_INSTRUCTIONS,
    "RNE: número de Registro Nacional de Establecimiento del proveedor. Opcional.",
    "Los proveedores duplicados (mismo nombre) se omiten.",
  ],
};

// ── Catálogo de módulos importables ───────────────────────────────────────────

export const IMPORT_MODULES = {
  ingredients: {
    id: "ingredients",
    label: "Ingredientes",
    template: INGREDIENT_TEMPLATE,
    templateFilename: "plantilla-ingredientes",
    validateRow: validateIngredientRow,
  } satisfies ImportModuleDef<IngredientImportData>,
  customers: {
    id: "customers",
    label: "Clientes",
    template: CUSTOMER_TEMPLATE,
    templateFilename: "plantilla-clientes",
    validateRow: validateCustomerRow,
  } satisfies ImportModuleDef<CustomerImportData>,
  suppliers: {
    id: "suppliers",
    label: "Proveedores",
    template: SUPPLIER_TEMPLATE,
    templateFilename: "plantilla-proveedores",
    validateRow: validateSupplierRow,
  } satisfies ImportModuleDef<SupplierImportData>,
} as const;

export type ImportModuleId = keyof typeof IMPORT_MODULES;
