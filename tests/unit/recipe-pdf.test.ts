import { describe, expect, it } from "vitest";
import {
  buildFormulaItems,
  buildNutritionItems,
  buildSeals,
  buildShelfLife,
  slugify,
} from "@/modules/recipes/pdf";
import type { Recipe, RecipeIngredientRow } from "@/modules/recipes/api";

// Tests de las funciones PURAS de armado de datos de la ficha técnica PDF
// (sin tocar jspdf ni Supabase). El render jspdf no se testea acá.

function ri(
  over: Partial<RecipeIngredientRow> & { id: string; ingredient_id: string },
): RecipeIngredientRow {
  return {
    quantity: 0,
    unit: "kg",
    is_substitute: false,
    source_ingredient_id: null,
    ingredient: { name: "X", unit: "kg" },
    ...over,
  };
}

function recipe(over: Partial<Recipe> = {}): Recipe {
  return {
    id: "r1",
    title: "Bondiola curada",
    commercial_name: null,
    group_id: null,
    category: "carnes",
    product_type: "solido",
    description: null,
    shelf_life_days: 30,
    aging_days: 0,
    packaging_delay_type: "none",
    rnpa_number: null,
    rnpa_expiry: null,
    rnpa_exempt: false,
    rnpa_exempt_reason: null,
    image_url: null,
    front_labels: [],
    regulatory_labels: null,
    nutrition: {},
    group: null,
    recipe_ingredients: [],
    ...over,
  };
}

// ── buildFormulaItems ──────────────────────────────────────────────────────────

describe("buildFormulaItems", () => {
  it("calcula % sobre el total de las filas principales", () => {
    const r = recipe({
      recipe_ingredients: [
        ri({
          id: "a",
          ingredient_id: "i1",
          quantity: 75,
          ingredient: { name: "Carne", unit: "kg" },
        }),
        ri({
          id: "b",
          ingredient_id: "i2",
          quantity: 25,
          ingredient: { name: "Sal", unit: "kg" },
        }),
      ],
    });
    const items = buildFormulaItems(r);
    expect(items).toHaveLength(2);
    expect(items[0].percent).toBeCloseTo(75);
    expect(items[1].percent).toBeCloseTo(25);
    expect(items[0].quantityPerKg).toBe(75);
    expect(items[0].unit).toBe("kg");
  });

  it("los sustitutos NO suman al total ni reciben %", () => {
    const r = recipe({
      recipe_ingredients: [
        ri({
          id: "a",
          ingredient_id: "i1",
          quantity: 100,
          ingredient: { name: "Carne de cerdo", unit: "kg" },
        }),
        ri({
          id: "b",
          ingredient_id: "i2",
          quantity: 100,
          is_substitute: true,
          source_ingredient_id: "i1",
          ingredient: { name: "Carne de vaca", unit: "kg" },
        }),
      ],
    });
    const items = buildFormulaItems(r);
    // El % de la principal es 100 (el sustituto no entra al total).
    expect(items[0].percent).toBeCloseTo(100);
    expect(items[1].percent).toBeNull();
    expect(items[1].isSubstitute).toBe(true);
    expect(items[1].substitutesFor).toBe("Carne de cerdo");
  });

  it("sin total principal (>0) deja % en null", () => {
    const r = recipe({
      recipe_ingredients: [
        ri({
          id: "a",
          ingredient_id: "i1",
          quantity: 0,
          ingredient: { name: "Agua", unit: "l" },
        }),
      ],
    });
    expect(buildFormulaItems(r)[0].percent).toBeNull();
  });

  it("usa la unidad del ingrediente si está disponible", () => {
    const r = recipe({
      recipe_ingredients: [
        ri({
          id: "a",
          ingredient_id: "i1",
          quantity: 5,
          unit: "kg",
          ingredient: { name: "Pimentón", unit: "g" },
        }),
      ],
    });
    expect(buildFormulaItems(r)[0].unit).toBe("g");
  });

  it("fórmula vacía devuelve []", () => {
    expect(buildFormulaItems(recipe())).toEqual([]);
  });
});

// ── buildNutritionItems ─────────────────────────────────────────────────────────

describe("buildNutritionItems", () => {
  it("omite los nutrientes null/undefined", () => {
    const r = recipe({
      nutrition: { calories: 250, proteins: null, fats: 10, sodium: 0 },
    });
    const items = buildNutritionItems(r);
    const labels = items.map((i) => i.label);
    expect(labels).toContain("Valor energético");
    expect(labels).toContain("Grasas totales");
    expect(labels).toContain("Sodio"); // 0 es un valor válido, no se omite
    expect(labels).not.toContain("Proteínas");
    expect(labels).not.toContain("Hidratos de carbono");
  });

  it("sin nutrición devuelve []", () => {
    expect(buildNutritionItems(recipe())).toEqual([]);
  });

  it("mantiene el orden canónico y las unidades", () => {
    const r = recipe({
      nutrition: { sodium: 400, calories: 200 },
    });
    const items = buildNutritionItems(r);
    expect(items[0].label).toBe("Valor energético");
    expect(items[0].unit).toBe("kcal");
    expect(items[1].label).toBe("Sodio");
    expect(items[1].unit).toBe("mg");
  });
});

// ── buildShelfLife ───────────────────────────────────────────────────────────

describe("buildShelfLife", () => {
  it("envasado directo: texto base sin estacionamiento", () => {
    const s = buildShelfLife(recipe({ shelf_life_days: 45 }));
    expect(s.text).toBe("45 días");
    expect(s.detail).toBe("Se envasa al producir");
  });

  it("aging: incluye los días de estacionamiento en el detalle", () => {
    const s = buildShelfLife(
      recipe({ packaging_delay_type: "aging", aging_days: 21 }),
    );
    expect(s.detail).toContain("21 días");
  });

  it("congelado: muestra la etiqueta de envasado correspondiente", () => {
    const s = buildShelfLife(recipe({ packaging_delay_type: "freeze" }));
    expect(s.detail).toBe("Congelado previo al envasado");
  });
});

// ── buildSeals ───────────────────────────────────────────────────────────────

describe("buildSeals", () => {
  it("resuelve octógonos AR desde regulatory_labels", () => {
    const r = recipe({
      regulatory_labels: {
        system: "ar_octogonos",
        values: ["exceso_sodio", "exceso_azucares"],
      },
    });
    const seals = buildSeals(r);
    expect(seals).not.toBeNull();
    expect(seals!.shape).toBe("octagon");
    expect(seals!.items).toHaveLength(2);
    expect(seals!.items[0].text).toBe("EXCESO EN SODIO");
  });

  it("usa labelLocal para sistemas con texto local (NOM-051 MX)", () => {
    const r = recipe({
      regulatory_labels: { system: "mx_nom051", values: ["exceso_sodio"] },
    });
    const seals = buildSeals(r);
    expect(seals!.shape).toBe("octagon");
    expect(seals!.items[0].text).toBe("EXCESO SODIO");
    expect(seals!.systemName).toContain("NOM-051");
  });

  it("ANVISA BR usa la forma lupa (magnifier)", () => {
    const r = recipe({
      regulatory_labels: { system: "br_anvisa", values: ["alto_em_sodio"] },
    });
    expect(buildSeals(r)!.shape).toBe("magnifier");
  });

  it("fallback a front_labels legacy (octógonos AR)", () => {
    const r = recipe({ front_labels: ["exceso_calorias"] });
    const seals = buildSeals(r);
    expect(seals!.shape).toBe("octagon");
    expect(seals!.items[0].text).toBe("EXCESO EN CALORÍAS");
  });

  it("sin sellos devuelve null", () => {
    expect(buildSeals(recipe())).toBeNull();
    expect(
      buildSeals(recipe({ regulatory_labels: { system: "us_fda", values: [] } })),
    ).toBeNull();
  });
});

// ── slugify ──────────────────────────────────────────────────────────────────

describe("slugify", () => {
  it("quita acentos, espacios y símbolos", () => {
    expect(slugify("Bondiola Curada")).toBe("bondiola-curada");
    expect(slugify("Jamón cocido & queso")).toBe("jamon-cocido-queso");
  });

  it("colapsa separadores y recorta los extremos", () => {
    expect(slugify("  ¡Salame!!  ")).toBe("salame");
  });

  it("vacío o solo símbolos cae a 'receta'", () => {
    expect(slugify("")).toBe("receta");
    expect(slugify("###")).toBe("receta");
  });
});
