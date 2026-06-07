import { z } from "zod";

export const stockEntrySchema = z.object({
  ingredient_id: z.string().uuid({ message: "Elegí un ingrediente" }),
  quantity: z
    .number({ invalid_type_error: "Cantidad inválida" })
    .positive("Debe ser mayor a 0"),
  lot_number: z.string().min(1, "Ingresá o generá el lote").max(60),
  expiry_date: z.string().nullable(), // YYYY-MM-DD
  manufacture_date: z.string().nullable(),
  is_frozen: z.boolean(),
  supplier_id: z.string().uuid().nullable(),
  unit_cost: z
    .number({ invalid_type_error: "Costo inválido" })
    .nonnegative("No puede ser negativo")
    .nullable(),
  is_internal_use: z.boolean(),
});
export type StockEntryInput = z.infer<typeof stockEntrySchema>;

export const supplierSchema = z.object({
  name: z.string().min(1, "Ingresá un nombre").max(120),
  // Identificador fiscal genérico (CUIT/RFC/CNPJ/...). Etiqueta por país vía
  // OperatingProfile.taxIdLabel. La columna `cuit` legacy quedó congelada (0013).
  tax_id: z
    .string()
    .max(40)
    .transform((v) => v.trim() || null)
    .nullable()
    .optional(),
  // RNE/registro: AR-only legacy. El permiso fino se gestiona con PermitsSection
  // (regulatory_permits). Opcional para no romper el alta completa.
  rne_number: z
    .string()
    .max(40)
    .transform((v) => v.trim() || null)
    .nullable()
    .optional(),
});
export type SupplierInput = z.infer<typeof supplierSchema>;

export const adjustSchema = z.object({
  delta: z
    .number({ invalid_type_error: "Cantidad inválida" })
    .refine((v) => v !== 0, "No puede ser 0"),
  reason: z.string().min(3, "Indicá el motivo (auditoría)"),
});
export type AdjustInput = z.infer<typeof adjustSchema>;

/** Regla CAA: congelados extienden vencimiento +60 días por defecto. */
export const FROZEN_EXTRA_DAYS = 60;
/** Umbral global de stock bajo (kg) — heredado de La Jamonera. */
export const GLOBAL_LOW_STOCK_THRESHOLD = 5;
/** Días para "vence pronto" — heredado de La Jamonera. */
export const EXPIRING_SOON_DAYS = 2;
