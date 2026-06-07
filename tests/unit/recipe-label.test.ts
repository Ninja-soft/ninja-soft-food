import { describe, expect, it } from "vitest";
import {
  BARCODE_PLACEHOLDER,
  buildAllergenList,
  buildLabelIngredients,
  buildLegalData,
  buildNutritionRows,
  EXPIRY_PLACEHOLDER,
  LOT_PLACEHOLDER,
  labelFilename,
  labelRect,
  nutritionLayoutFor,
} from "@/modules/recipes/labelPdf";
import {
  appendLabelVersion,
  labelVersionPath,
  nextLabelVersion,
} from "@/modules/recipes/labels";
import type {
  LabelVersion,
  Recipe,
  RecipeIngredientRow,
} from "@/modules/recipes/api";
import type { TenantBranding } from "@/modules/planillas/api";

// Tests de las funciones PURAS del rótulo print-ready (sin jspdf ni Supabase).
// El render vectorial no se testea acá; sí su lógica de armado y el versionado.

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
    allergens: null,
    label_versions: [],
    nutrition: {},
    group: null,
    recipe_ingredients: [],
    ...over,
  };
}

const branding: TenantBranding = {
  name: "Fiambrería Centro",
  legalName: "Fiambrería Centro SRL",
  logoUrl: null,
  cuit: "30-12345678-9",
  address: "Av. Siempreviva 742",
  locale: "es-AR",
  currency: "ARS",
  pdfPrimaryColor: null,
  pdfSecondaryColor: null,
};

// ── buildLabelIngredients ────────────────────────────────────────────────────

describe("buildLabelIngredients", () => {
  it("ordena los ingredientes de mayor a menor cantidad", () => {
    const r = recipe({
      recipe_ingredients: [
        ri({ id: "a", ingredient_id: "i1", quantity: 10, ingredient: { name: "Sal", unit: "kg" } }),
        ri({ id: "b", ingredient_id: "i2", quantity: 80, ingredient: { name: "Carne de cerdo", unit: "kg" } }),
        ri({ id: "c", ingredient_id: "i3", quantity: 25, ingredient: { name: "Pimentón", unit: "kg" } }),
      ],
    });
    const items = buildLabelIngredients(r);
    expect(items.map((i) => i.name)).toEqual([
      "Carne de cerdo",
      "Pimentón",
      "Sal",
    ]);
  });

  it("excluye los sustitutos por default", () => {
    const r = recipe({
      recipe_ingredients: [
        ri({ id: "a", ingredient_id: "i1", quantity: 100, ingredient: { name: "Carne de cerdo", unit: "kg" } }),
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
    const items = buildLabelIngredients(r);
    expect(items.map((i) => i.name)).toEqual(["Carne de cerdo"]);
  });

  it("incluye sustitutos cuando se pide", () => {
    const r = recipe({
      recipe_ingredients: [
        ri({ id: "a", ingredient_id: "i1", quantity: 100, ingredient: { name: "Carne de cerdo", unit: "kg" } }),
        ri({
          id: "b",
          ingredient_id: "i2",
          quantity: 50,
          is_substitute: true,
          source_ingredient_id: "i1",
          ingredient: { name: "Carne de vaca", unit: "kg" },
        }),
      ],
    });
    const items = buildLabelIngredients(r, { includeSubstitutes: true });
    expect(items).toHaveLength(2);
  });

  it("marca como alérgeno el ingrediente que coincide (sin acentos, case-insensitive)", () => {
    const r = recipe({
      allergens: ["leche", "gluten"],
      recipe_ingredients: [
        ri({ id: "a", ingredient_id: "i1", quantity: 50, ingredient: { name: "Harina de trigo", unit: "kg" } }),
        ri({ id: "b", ingredient_id: "i2", quantity: 30, ingredient: { name: "Leche entera", unit: "l" } }),
        ri({ id: "c", ingredient_id: "i3", quantity: 20, ingredient: { name: "Sal", unit: "kg" } }),
      ],
    });
    const items = buildLabelIngredients(r);
    const milk = items.find((i) => i.name === "Leche entera");
    const salt = items.find((i) => i.name === "Sal");
    expect(milk?.isAllergen).toBe(true);
    expect(salt?.isAllergen).toBe(false);
  });

  it("sin alérgenos declarados, ninguno se marca", () => {
    const r = recipe({
      recipe_ingredients: [
        ri({ id: "a", ingredient_id: "i1", quantity: 50, ingredient: { name: "Leche entera", unit: "l" } }),
      ],
    });
    expect(buildLabelIngredients(r)[0]!.isAllergen).toBe(false);
  });
});

// ── buildAllergenList ────────────────────────────────────────────────────────

describe("buildAllergenList", () => {
  it("traduce los ids a labels legibles", () => {
    expect(buildAllergenList(recipe({ allergens: ["leche", "mani"] }))).toEqual([
      "Leche",
      "Maní",
    ]);
  });

  it("sin alérgenos devuelve []", () => {
    expect(buildAllergenList(recipe())).toEqual([]);
  });
});

// ── buildLegalData (placeholders + datos legales) ────────────────────────────

describe("buildLegalData", () => {
  it("usa razón social, tax id y deja lote/vto como placeholders", () => {
    const lines = buildLegalData({
      recipe: recipe({ rnpa_number: "21-123456" }),
      branding,
      taxIdLabel: "CUIT",
      countryName: "Argentina",
    });
    const map = Object.fromEntries(lines.map((l) => [l.label, l.value]));
    expect(map["Elaborado por"]).toBe("Fiambrería Centro SRL");
    expect(map["CUIT"]).toBe("30-12345678-9");
    expect(map["RNPA"]).toBe("21-123456");
    expect(map["Lote"]).toBe(LOT_PLACEHOLDER);
    expect(map["Vencimiento"]).toBe(EXPIRY_PLACEHOLDER);
    expect(map["Origen"]).toBe("Argentina");
  });

  it("muestra exención documentada en lugar de RNPA", () => {
    const lines = buildLegalData({
      recipe: recipe({ rnpa_exempt: true, rnpa_exempt_reason: "venta al mostrador" }),
      branding,
      taxIdLabel: "CUIT",
      countryName: "Argentina",
    });
    const reg = lines.find((l) => l.label === "Registro");
    expect(reg?.value).toContain("Exento");
    expect(reg?.value).toContain("venta al mostrador");
    expect(lines.some((l) => l.label === "RNPA")).toBe(false);
  });

  it("incluye permisos del país (COFEPRIS/RSA) sin asumir Argentina", () => {
    const lines = buildLegalData({
      recipe: recipe(),
      branding,
      taxIdLabel: "RFC",
      countryName: "México",
      permitLines: ["COFEPRIS: ABC-123"],
    });
    expect(lines.some((l) => l.value === "COFEPRIS: ABC-123")).toBe(true);
    expect(lines.find((l) => l.label === "Origen")?.value).toBe("México");
    // No aparece label CUIT cuando el taxIdLabel es RFC.
    expect(lines.find((l) => l.label === "RFC")?.value).toBe("30-12345678-9");
  });
});

// ── buildNutritionRows (escalado por porción) ────────────────────────────────

describe("buildNutritionRows", () => {
  const fmt = (v: number | null | undefined, frac = 1) =>
    v === null || v === undefined || !Number.isFinite(v)
      ? "-"
      : new Intl.NumberFormat("es-AR", { maximumFractionDigits: frac }).format(v);

  it("escala los valores a la porción", () => {
    const r = recipe({ nutrition: { calories: 200, proteins: 10 } });
    const rows = buildNutritionRows(
      r,
      50,
      [
        { key: "calories", label: "E", unit: "kcal" },
        { key: "proteins", label: "P", unit: "g" },
      ],
      fmt,
    );
    expect(rows[0]!.per100).toBe("200 kcal");
    expect(rows[0]!.perPortion).toBe("100 kcal");
    expect(rows[1]!.perPortion).toBe("5 g");
  });

  it("muestra '-' en los campos faltantes", () => {
    const rows = buildNutritionRows(
      recipe(),
      100,
      [{ key: "sodium", label: "Na", unit: "mg" }],
      fmt,
    );
    expect(rows[0]!.per100).toBe("-");
    expect(rows[0]!.perPortion).toBe("-");
  });

  it("porción 100 g deja por-porción igual a por-100", () => {
    const r = recipe({ nutrition: { sodium: 400 } });
    const rows = buildNutritionRows(
      r,
      100,
      [{ key: "sodium", label: "Na", unit: "mg" }],
      fmt,
    );
    expect(rows[0]!.per100).toBe(rows[0]!.perPortion);
  });
});

// ── nutritionLayoutFor (formato por país) ────────────────────────────────────

describe("nutritionLayoutFor", () => {
  it("US usa FDA Nutrition Facts", () => {
    expect(nutritionLayoutFor("us_fda")).toBe("fda");
  });
  it("EU usa el layout 1169/2011", () => {
    expect(nutritionLayoutFor("eu_nutriscore")).toBe("eu");
  });
  it("AR/MX/CL/BR usan el layout LATAM", () => {
    expect(nutritionLayoutFor("ar_octogonos")).toBe("latam");
    expect(nutritionLayoutFor("mx_nom051")).toBe("latam");
    expect(nutritionLayoutFor("cl_sellos")).toBe("latam");
    expect(nutritionLayoutFor("br_anvisa")).toBe("latam");
  });
  it("sin sistema cae al layout LATAM (default)", () => {
    expect(nutritionLayoutFor(null)).toBe("latam");
  });
});

// ── labelRect (tamaños + marcas de corte) ────────────────────────────────────

describe("labelRect", () => {
  it("A4 completa usa la hoja con márgenes", () => {
    const r = labelRect("full");
    expect(r.w).toBeCloseTo(210 - 24);
    expect(r.h).toBeCloseTo(297 - 24);
  });
  it("10x15 centra una caja de 100x150 mm", () => {
    const r = labelRect("10x15");
    expect(r.w).toBe(100);
    expect(r.h).toBe(150);
    expect(r.x).toBeCloseTo((210 - 100) / 2);
  });
  it("7x10 centra una caja de 70x100 mm", () => {
    const r = labelRect("7x10");
    expect(r.w).toBe(70);
    expect(r.h).toBe(100);
  });
});

// ── labelFilename ────────────────────────────────────────────────────────────

describe("labelFilename", () => {
  it("prefiere el nombre comercial y slugifica", () => {
    expect(labelFilename(recipe({ commercial_name: "Salame Milán" }))).toBe(
      "rotulo-salame-milan.pdf",
    );
  });
  it("cae al título si no hay nombre comercial", () => {
    expect(labelFilename(recipe({ title: "Bondiola curada" }))).toBe(
      "rotulo-bondiola-curada.pdf",
    );
  });
});

// ── Placeholders expuestos ───────────────────────────────────────────────────

describe("placeholders", () => {
  it("son los tokens que completa producción/imprenta", () => {
    expect(LOT_PLACEHOLDER).toBe("{LOTE}");
    expect(EXPIRY_PLACEHOLDER).toBe("{VTO}");
    expect(BARCODE_PLACEHOLDER).toBe("{EAN}");
  });
});

// ── Versionado (nextLabelVersion / appendLabelVersion / path) ─────────────────

describe("nextLabelVersion", () => {
  it("empieza en 1 sin versiones", () => {
    expect(nextLabelVersion([])).toBe(1);
    expect(nextLabelVersion(null)).toBe(1);
    expect(nextLabelVersion(undefined)).toBe(1);
  });
  it("es max(version)+1, no length+1 (robusto a huecos)", () => {
    const v: LabelVersion[] = [
      { version: 1, path: "p1", created_at: "x", created_by: null },
      { version: 3, path: "p3", created_at: "x", created_by: null },
    ];
    expect(nextLabelVersion(v)).toBe(4);
  });
});

describe("appendLabelVersion", () => {
  it("agrega al final sin pisar versiones previas (append-only)", () => {
    const existing: LabelVersion[] = [
      { version: 1, path: "p1", created_at: "x", created_by: null },
    ];
    const entry: LabelVersion = {
      version: 2,
      path: "p2",
      created_at: "y",
      created_by: "u1",
    };
    const out = appendLabelVersion(existing, entry);
    expect(out).toHaveLength(2);
    expect(out[0]).toBe(existing[0]); // intacta
    expect(out[1]).toEqual(entry);
    // no muta el array original
    expect(existing).toHaveLength(1);
  });
  it("desde vacío crea el primer elemento", () => {
    const entry: LabelVersion = {
      version: 1,
      path: "p1",
      created_at: "x",
      created_by: null,
    };
    expect(appendLabelVersion(null, entry)).toEqual([entry]);
  });
});

describe("labelVersionPath", () => {
  it("namespacea por tenant/receta/versión en el bucket recipes", () => {
    expect(labelVersionPath("t1", "r9", 3)).toBe("t1/labels/r9/v3.pdf");
  });
});
