import { z } from "zod";
import type { LabelSystemId } from "@/lib/globalization/labelSystems";

export const FOOD_CATEGORIES = [
  { value: "carnes", label: "Carnes y derivados" },
  { value: "lacteos", label: "Lácteos" },
  { value: "panificados", label: "Panificados y pastas" },
  { value: "conservas", label: "Conservas y elaborados" },
  { value: "bebidas", label: "Bebidas" },
  { value: "aditivos", label: "Aditivos" },
  { value: "otros", label: "Otros" },
] as const;

export const PRODUCT_TYPES = [
  { value: "solido", label: "Sólido" },
  { value: "liquido", label: "Líquido" },
  { value: "semisolido", label: "Semisólido" },
  { value: "polvo", label: "Polvo" },
  { value: "concentrado", label: "Concentrado" },
] as const;

export const PACKAGING_DELAYS = [
  { value: "none", label: "Se envasa al producir" },
  { value: "aging", label: "Estacionamiento previo (maduración)" },
  { value: "freeze", label: "Congelado previo al envasado" },
] as const;

/**
 * @deprecated Octógonos Ley 27.642 (AR-only). El rotulado frontal ahora se
 * resuelve por país vía lib/globalization/labelSystems y se persiste en
 * recipes.regulatory_labels. Se conserva solo como fallback de lectura legacy.
 */
export const FRONT_LABELS = [
  { value: "exceso_azucares", label: "Exceso en azúcares" },
  { value: "exceso_sodio", label: "Exceso en sodio" },
  { value: "exceso_grasas_totales", label: "Exceso en grasas totales" },
  { value: "exceso_grasas_saturadas", label: "Exceso en grasas saturadas" },
  { value: "exceso_calorias", label: "Exceso en calorías" },
  { value: "contiene_cafeina", label: "Contiene cafeína" },
  { value: "contiene_edulcorantes", label: "Contiene edulcorantes" },
] as const;

/**
 * Rotulado frontal resuelto por país: {system, values}. Reemplaza front_labels.
 * Para kind "grade" (Nutri-Score) values tiene 1 elemento; para "none" (US), [].
 */
export const regulatoryLabelsSchema = z.object({
  system: z.custom<LabelSystemId>(),
  values: z.array(z.string()),
});
export type RegulatoryLabelsInput = z.infer<typeof regulatoryLabelsSchema>;

/**
 * Catálogo de alérgenos comunes (set transversal CAA art. 235 séptimo / ANVISA
 * RDC 26/2015 / FDA FALCPA + sésamo FASTER Act / UE Anexo II 1169/2011). NO se
 * hardcodea al país (regla dura 11): es el denominador común de los marcos que
 * el producto soporta; el `value` es el id estable que se persiste en
 * recipes.allergens y el `label` el texto en español de la UI/rótulo.
 */
export const COMMON_ALLERGENS = [
  { value: "gluten", label: "Gluten" },
  { value: "leche", label: "Leche" },
  { value: "huevo", label: "Huevo" },
  { value: "soja", label: "Soja" },
  { value: "mani", label: "Maní" },
  { value: "frutos_secos", label: "Frutos secos" },
  { value: "pescado", label: "Pescado" },
  { value: "mariscos", label: "Mariscos" },
  { value: "sesamo", label: "Sésamo" },
  { value: "sulfitos", label: "Sulfitos" },
] as const;

/** Texto legible (es) de un id de alérgeno; cae al id crudo si no está en el catálogo. */
export function allergenLabel(id: string): string {
  return COMMON_ALLERGENS.find((a) => a.value === id)?.label ?? id;
}

export const recipeIngredientSchema = z.object({
  ingredient_id: z.string().uuid({ message: "Elegí un ingrediente" }),
  quantity: z
    .number({ invalid_type_error: "Cantidad inválida" })
    .positive("Debe ser mayor a 0"),
  unit: z.string().min(1),
  is_substitute: z.boolean(),
  source_ingredient_id: z.string().uuid().nullable(),
});
export type RecipeIngredientInput = z.infer<typeof recipeIngredientSchema>;

export const recipeSchema = z
  .object({
    title: z.string().min(1, "Ingresá un nombre").max(120),
    commercial_name: z
      .string()
      .max(120)
      .transform((v) => v.trim() || null)
      .nullable(),
    group_id: z.string().uuid().nullable(),
    category: z.enum([
      "carnes",
      "lacteos",
      "panificados",
      "conservas",
      "bebidas",
      "aditivos",
      "otros",
    ]),
    product_type: z.enum([
      "solido",
      "liquido",
      "semisolido",
      "polvo",
      "concentrado",
    ]),
    description: z
      .string()
      .max(1000)
      .transform((v) => v.trim() || null)
      .nullable(),
    shelf_life_days: z
      .number({ invalid_type_error: "Días inválidos" })
      .int()
      .positive("Debe ser mayor a 0"),
    aging_days: z
      .number({ invalid_type_error: "Días inválidos" })
      .int()
      .nonnegative(),
    packaging_delay_type: z.enum(["none", "aging", "freeze"]),
    rnpa_number: z
      .string()
      .max(40)
      .transform((v) => v.trim() || null)
      .nullable(),
    rnpa_expiry: z.string().nullable(),
    rnpa_exempt: z.boolean(),
    rnpa_exempt_reason: z
      .string()
      .max(200)
      .transform((v) => v.trim() || null)
      .nullable(),
    front_labels: z.array(z.string()),
    regulatory_labels: regulatoryLabelsSchema.nullable(),
    // Alérgenos declarados (ids de COMMON_ALLERGENS). ADITIVO (Fase 7): se
    // resaltan en negrita en la lista de ingredientes del rótulo print-ready.
    // text[] en DB; recetas viejas validan con [] por default.
    allergens: z.array(z.string()),
    // Nutrición por 100 g/ml. Los 5 campos base existían desde Fase 1; los 5
    // ampliados (saturated_fats, trans_fats, sugars, fiber, salt) se agregan
    // ADITIVAMENTE para el cálculo de sellos frontales (Fase 7). jsonb: sin
    // migración. Todos opcionales/nullable → recetas viejas siguen validando.
    nutrition: z.object({
      calories: z.number().nonnegative().nullable(),
      proteins: z.number().nonnegative().nullable(),
      fats: z.number().nonnegative().nullable(),
      carbs: z.number().nonnegative().nullable(),
      sodium: z.number().nonnegative().nullable(),
      saturated_fats: z.number().nonnegative().nullable().optional(),
      trans_fats: z.number().nonnegative().nullable().optional(),
      sugars: z.number().nonnegative().nullable().optional(),
      fiber: z.number().nonnegative().nullable().optional(),
      salt: z.number().nonnegative().nullable().optional(),
    }),
  })
  .refine((v) => !v.rnpa_exempt || v.rnpa_exempt_reason, {
    message: "Indicá el motivo de la exención (ej: venta al mostrador)",
    path: ["rnpa_exempt_reason"],
  });
export type RecipeInput = z.infer<typeof recipeSchema>;

export const recipeGroupSchema = z.object({
  name: z.string().min(1, "Ingresá un nombre").max(80),
});
export type RecipeGroupInput = z.infer<typeof recipeGroupSchema>;

/** Filtros RNPA heredados de La Jamonera. */
export type RnpaFilter = "todos" | "sin_rnpa" | "vence_6m" | "vence_60d";
