import { z } from "zod";

export const productionInputSchema = z.object({
  ingredient_id: z.string().uuid(),
  stock_entry_id: z.string().uuid().nullable(), // null = stock infinito
  taken_qty: z
    .number({ invalid_type_error: "Cantidad inválida" })
    .positive("Debe ser mayor a 0"),
  is_substitute: z.boolean(),
  source_ingredient_id: z.string().uuid().nullable(),
});
export type ProductionInputRow = z.infer<typeof productionInputSchema>;

export const productionSchema = z.object({
  recipe_id: z.string().uuid({ message: "Elegí una receta" }),
  quantity_kg: z
    .number({ invalid_type_error: "Cantidad inválida" })
    .positive("Debe ser mayor a 0"),
  production_date: z.string().min(1, "Elegí la fecha"),
  product_lot_number: z
    .string()
    .max(60)
    .transform((v) => v.trim() || null)
    .nullable(),
  notes: z
    .string()
    .max(500)
    .transform((v) => v.trim() || null)
    .nullable(),
});
export type ProductionInput = z.infer<typeof productionSchema>;
