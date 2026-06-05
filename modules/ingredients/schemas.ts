import { z } from "zod";

export const familySchema = z.object({
  name: z.string().min(1, "Ingresá un nombre").max(80),
});
export type FamilyInput = z.infer<typeof familySchema>;

export const ingredientSchema = z.object({
  name: z.string().min(1, "Ingresá un nombre").max(120),
  family_id: z.string().uuid().nullable(),
  unit: z.string().min(1, "Elegí una unidad"),
  is_perishable: z.boolean(),
  description: z
    .string()
    .max(500)
    .transform((v) => v.trim() || null)
    .nullable(),
  low_stock_threshold: z
    .number({ invalid_type_error: "Número inválido" })
    .positive("Debe ser mayor a 0")
    .nullable(),
  default_shelf_days: z
    .number({ invalid_type_error: "Número inválido" })
    .int("Días enteros")
    .positive("Debe ser mayor a 0")
    .nullable(),
});
export type IngredientInput = z.infer<typeof ingredientSchema>;
