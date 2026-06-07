import { describe, expect, it } from "vitest";
import {
  computeSeals,
  computeNutriScore,
  missingFieldsForSystem,
  type NutritionPer100,
} from "@/lib/globalization/labelThresholds";
import {
  buildNutritionPrompt,
  NUTRITION_JSON_SCHEMA,
} from "@/modules/recipes/ai";
import { recipeSchema } from "@/modules/recipes/schemas";

// =============================================================================
// tests/unit/label-thresholds — cálculo DETERMINÍSTICO de sellos frontales.
// Esto es LEGAL: cubrimos casos borde en los umbrales exactos por sistema,
// Nutri-Score con casos conocidos, retrocompatibilidad del schema ampliado y la
// pureza del prompt builder. (Las fuentes normativas están en labelThresholds.ts.)
// =============================================================================

// Helper: ¿el resultado multi-seal contiene exactamente este set (sin orden)?
function sealSet(systemId: Parameters<typeof computeSeals>[0], n: NutritionPer100, productType?: string) {
  const r = computeSeals(systemId, n, undefined, productType);
  if (r.kind !== "multi-seal") throw new Error("esperaba multi-seal");
  return new Set(r.values);
}

// ── AR — octógonos Ley 27.642 (perfil OPS, por % de energía) ─────────────────
describe("computeSeals · ar_octogonos", () => {
  it("azúcares: dispara en el umbral exacto de 10% de energía", () => {
    // kcal=100, sugars=2.5 g → 2.5*4 = 10 kcal = 10% exacto → dispara.
    expect(sealSet("ar_octogonos", { calories: 100, sugars: 2.5 })).toContain(
      "exceso_azucares",
    );
    // justo por debajo (sugars=2.4 → 9.6%) → NO dispara.
    expect(
      sealSet("ar_octogonos", { calories: 100, sugars: 2.4 }),
    ).not.toContain("exceso_azucares");
  });

  it("grasas totales: dispara en 30% de energía", () => {
    // kcal=100, fats=3.34 g → 3.34*9 = 30.06% → dispara.
    expect(sealSet("ar_octogonos", { calories: 100, fats: 3.34 })).toContain(
      "exceso_grasas_totales",
    );
    expect(
      sealSet("ar_octogonos", { calories: 100, fats: 3.3 }),
    ).not.toContain("exceso_grasas_totales");
  });

  it("grasas saturadas: dispara en 10% de energía", () => {
    // kcal=100, sat=1.12 g → 1.12*9 = 10.08% → dispara.
    expect(
      sealSet("ar_octogonos", { calories: 100, saturated_fats: 1.12 }),
    ).toContain("exceso_grasas_saturadas");
    expect(
      sealSet("ar_octogonos", { calories: 100, saturated_fats: 1.1 }),
    ).not.toContain("exceso_grasas_saturadas");
  });

  it("sodio: dispara por relación 1 mg/kcal (sólido)", () => {
    // kcal=100, sodium=100 mg → ratio 1.0 → dispara.
    expect(
      sealSet("ar_octogonos", { calories: 100, sodium: 100 }),
    ).toContain("exceso_sodio");
    expect(
      sealSet("ar_octogonos", { calories: 100, sodium: 99 }),
    ).not.toContain("exceso_sodio");
  });

  it("sodio: dispara por atajo absoluto 300 mg/100 g aunque la relación no llegue", () => {
    // kcal alto baja la relación, pero el absoluto en sólido manda.
    expect(
      sealSet("ar_octogonos", { calories: 1000, sodium: 300 }),
    ).toContain("exceso_sodio");
  });

  it("calorías: sólidos ≥275, líquidos ≥70", () => {
    expect(sealSet("ar_octogonos", { calories: 275 })).toContain(
      "exceso_calorias",
    );
    expect(sealSet("ar_octogonos", { calories: 274 })).not.toContain(
      "exceso_calorias",
    );
    // líquido: umbral 70.
    expect(
      sealSet("ar_octogonos", { calories: 70 }, "liquido"),
    ).toContain("exceso_calorias");
    expect(
      sealSet("ar_octogonos", { calories: 69 }, "liquido"),
    ).not.toContain("exceso_calorias");
  });

  it("flags de ingredientes: edulcorantes y cafeína", () => {
    const r = computeSeals("ar_octogonos", {}, {
      contains_sweeteners: true,
      contains_caffeine: true,
    });
    if (r.kind !== "multi-seal") throw new Error("multi-seal");
    expect(new Set(r.values)).toEqual(
      new Set(["contiene_edulcorantes", "contiene_cafeina"]),
    );
  });

  it("sin datos: no dispara nada (no se puede afirmar un exceso)", () => {
    expect(sealSet("ar_octogonos", {})).toEqual(new Set());
  });
});

// ── MX — NOM-051 (tiene grasas trans, no tiene grasas totales) ───────────────
describe("computeSeals · mx_nom051", () => {
  it("grasas trans: dispara en 1% de energía", () => {
    // kcal=100, trans=0.112 g → 0.112*9 = 1.008% → dispara.
    expect(
      sealSet("mx_nom051", { calories: 100, trans_fats: 0.112 }),
    ).toContain("exceso_grasas_trans");
    expect(
      sealSet("mx_nom051", { calories: 100, trans_fats: 0.1 }),
    ).not.toContain("exceso_grasas_trans");
  });

  it("NO emite 'exceso_grasas_totales' (no existe en NOM-051)", () => {
    // grasas muy altas: solo afectaría a AR, no a MX.
    expect(sealSet("mx_nom051", { calories: 100, fats: 50 })).not.toContain(
      "exceso_grasas_totales",
    );
  });

  it("azúcares/saturadas/sodio/calorías como OPS", () => {
    const s = sealSet("mx_nom051", {
      calories: 300,
      sugars: 10,
      saturated_fats: 5,
      sodium: 300,
    });
    expect(s).toContain("exceso_calorias");
    expect(s).toContain("exceso_azucares");
    expect(s).toContain("exceso_grasas_saturadas");
    expect(s).toContain("exceso_sodio");
  });
});

// ── CL — sellos "ALTO EN" (absolutos por 100 g) ──────────────────────────────
describe("computeSeals · cl_sellos", () => {
  it("dispara cada sello en su umbral absoluto exacto", () => {
    expect(sealSet("cl_sellos", { calories: 275 })).toContain(
      "alto_en_calorias",
    );
    expect(sealSet("cl_sellos", { sugars: 10 })).toContain("alto_en_azucares");
    expect(sealSet("cl_sellos", { saturated_fats: 4 })).toContain(
      "alto_en_grasas_saturadas",
    );
    expect(sealSet("cl_sellos", { sodium: 400 })).toContain("alto_en_sodio");
  });

  it("justo por debajo no dispara", () => {
    expect(sealSet("cl_sellos", { calories: 274 })).not.toContain(
      "alto_en_calorias",
    );
    expect(sealSet("cl_sellos", { sugars: 9.99 })).not.toContain(
      "alto_en_azucares",
    );
    expect(sealSet("cl_sellos", { saturated_fats: 3.99 })).not.toContain(
      "alto_en_grasas_saturadas",
    );
    expect(sealSet("cl_sellos", { sodium: 399 })).not.toContain("alto_en_sodio");
  });

  it("NO usa % de energía (un producto bajo en kcal pero alto en azúcar absoluto dispara)", () => {
    expect(sealSet("cl_sellos", { calories: 50, sugars: 12 })).toContain(
      "alto_en_azucares",
    );
  });
});

// ── BR — ANVISA (lupa, absolutos) ────────────────────────────────────────────
describe("computeSeals · br_anvisa", () => {
  it("umbrales 15g azúcar / 6g satfat / 600mg sodio", () => {
    expect(sealSet("br_anvisa", { sugars: 15 })).toContain(
      "alto_em_acucar_adicionado",
    );
    expect(sealSet("br_anvisa", { saturated_fats: 6 })).toContain(
      "alto_em_gordura_saturada",
    );
    expect(sealSet("br_anvisa", { sodium: 600 })).toContain("alto_em_sodio");
    expect(sealSet("br_anvisa", { sugars: 14.9 })).not.toContain(
      "alto_em_acucar_adicionado",
    );
  });
});

// ── US — FDA (sin sellos frontales) ──────────────────────────────────────────
describe("computeSeals · us_fda", () => {
  it("nunca emite sellos de advertencia", () => {
    expect(sealSet("us_fda", { calories: 9999, sugars: 999, sodium: 9999 })).toEqual(
      new Set(),
    );
  });
});

// ── EU — Nutri-Score (grade) ─────────────────────────────────────────────────
describe("computeNutriScore", () => {
  it("agua / producto inocuo → A", () => {
    expect(
      computeNutriScore({
        calories: 0,
        sugars: 0,
        saturated_fats: 0,
        sodium: 0,
      }),
    ).toBe("A");
  });

  it("alimento muy denso (alto en todo) → E", () => {
    expect(
      computeNutriScore({
        calories: 500,
        sugars: 50,
        saturated_fats: 15,
        sodium: 800,
        proteins: 2,
        fiber: 0,
      }),
    ).toBe("E");
  });

  it("alimento saludable con fibra y proteína → A", () => {
    expect(
      computeNutriScore({
        calories: 30,
        sugars: 2,
        saturated_fats: 0.1,
        sodium: 10,
        proteins: 3,
        fiber: 4,
      }),
    ).toBe("A");
  });

  it("devuelve null si faltan datos mínimos (no inventa una nota)", () => {
    expect(computeNutriScore({ calories: 100 })).toBeNull();
    expect(computeNutriScore({})).toBeNull();
  });

  it("computeSeals(eu_nutriscore) devuelve grade", () => {
    const r = computeSeals("eu_nutriscore", {
      calories: 0,
      sugars: 0,
      saturated_fats: 0,
      sodium: 0,
    });
    expect(r).toEqual({ kind: "grade", grade: "A" });
  });

  it("computeSeals(eu_nutriscore) con datos faltantes → grade vacío", () => {
    const r = computeSeals("eu_nutriscore", { calories: 100 });
    expect(r).toEqual({ kind: "grade", grade: "" });
  });
});

// ── Cobertura de campos faltantes por sistema ────────────────────────────────
describe("missingFieldsForSystem", () => {
  it("AR pide calorías/azúcares/grasas/saturadas/sodio", () => {
    expect(missingFieldsForSystem("ar_octogonos", {})).toEqual([
      "calorías",
      "azúcares",
      "grasas totales",
      "grasas saturadas",
      "sodio",
    ]);
  });

  it("MX pide grasas trans en lugar de grasas totales", () => {
    const missing = missingFieldsForSystem("mx_nom051", {});
    expect(missing).toContain("grasas trans");
    expect(missing).not.toContain("grasas totales");
  });

  it("nada falta cuando todo está cargado", () => {
    expect(
      missingFieldsForSystem("cl_sellos", {
        calories: 1,
        sugars: 1,
        saturated_fats: 1,
        sodium: 1,
      }),
    ).toEqual([]);
  });

  it("US no requiere ningún campo (sin sellos)", () => {
    expect(missingFieldsForSystem("us_fda", {})).toEqual([]);
  });
});

// ── Schema de nutrición ampliado: RETROCOMPATIBLE ────────────────────────────
describe("recipeSchema.nutrition · ampliación aditiva", () => {
  const base = {
    title: "Test",
    commercial_name: null,
    group_id: null,
    category: "otros" as const,
    product_type: "solido" as const,
    description: null,
    shelf_life_days: 30,
    aging_days: 0,
    packaging_delay_type: "none" as const,
    rnpa_number: null,
    rnpa_expiry: null,
    rnpa_exempt: false,
    rnpa_exempt_reason: null,
    front_labels: [] as string[],
    regulatory_labels: null,
  };

  it("acepta una receta vieja con solo los 5 campos base", () => {
    const r = recipeSchema.safeParse({
      ...base,
      nutrition: {
        calories: 100,
        proteins: 5,
        fats: 2,
        carbs: 10,
        sodium: 50,
      },
    });
    expect(r.success).toBe(true);
  });

  it("acepta los 10 campos (base + ampliados)", () => {
    const r = recipeSchema.safeParse({
      ...base,
      nutrition: {
        calories: 100,
        proteins: 5,
        fats: 2,
        carbs: 10,
        sodium: 50,
        saturated_fats: 1,
        trans_fats: 0,
        sugars: 3,
        fiber: 1.5,
        salt: 0.125,
      },
    });
    expect(r.success).toBe(true);
  });

  it("rechaza valores negativos en campos ampliados", () => {
    const r = recipeSchema.safeParse({
      ...base,
      nutrition: {
        calories: 100,
        proteins: 5,
        fats: 2,
        carbs: 10,
        sodium: 50,
        sugars: -1,
      },
    });
    expect(r.success).toBe(false);
  });
});

// ── Prompt builder: PURO ─────────────────────────────────────────────────────
describe("buildNutritionPrompt", () => {
  const ctx = {
    recipeTitle: "Bondiola curada",
    productType: "solido",
    country: "AR",
    labelSystemName: "Octógonos de advertencia",
    lines: [
      { name: "Bondiola", quantity: 80, unit: "kg", percent: 80 },
      { name: "Sal", quantity: 20, unit: "kg", percent: 20 },
    ],
  };

  it("es determinístico (misma entrada → misma salida)", () => {
    expect(buildNutritionPrompt(ctx)).toEqual(buildNutritionPrompt(ctx));
  });

  it("incluye título, país, sistema de rotulado y la fórmula con %", () => {
    const { prompt, system, schema } = buildNutritionPrompt(ctx);
    expect(prompt).toContain("Bondiola curada");
    expect(prompt).toContain("AR");
    expect(prompt).toContain("Octógonos de advertencia");
    expect(prompt).toContain("Bondiola: 80 kg (80% de la fórmula)");
    expect(system).toContain("bromatólogo");
    expect(schema).toBe(NUTRITION_JSON_SCHEMA);
  });

  it("maneja fórmula vacía sin romper", () => {
    const { prompt } = buildNutritionPrompt({ ...ctx, lines: [] });
    expect(prompt).toContain("(sin ingredientes cargados)");
  });

  it("el schema usa solo el subset Gemini-compatible (sin additionalProperties/$ref/oneOf)", () => {
    const json = JSON.stringify(NUTRITION_JSON_SCHEMA);
    expect(json).not.toContain("additionalProperties");
    expect(json).not.toContain("$ref");
    expect(json).not.toContain("oneOf");
    expect(json).not.toContain("anyOf");
    expect(NUTRITION_JSON_SCHEMA.type).toBe("object");
    expect(Array.isArray(NUTRITION_JSON_SCHEMA.required)).toBe(true);
  });
});
