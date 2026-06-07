import { getLabelSystem, type LabelSystemId } from "@/lib/globalization/labelSystems";
import {
  createPlanillaDoc,
  downloadPdf,
  drawFieldGrid,
  drawSectionTitle,
  drawTable,
  finalizePdf,
  PAGE,
  type PlanillaMeta,
} from "@/lib/utils/pdf";
import type { TenantBranding } from "@/modules/planillas/api";
import { PACKAGING_DELAYS } from "./schemas";
import type { Recipe } from "./api";

// =============================================================================
// modules/recipes/pdf — ficha técnica de receta descargable en PDF, con branding
// del tenant (logo + locale), reusando lib/utils/pdf (jspdf, sin autotable) y el
// patrón de modules/planillas/generators. Toda la generación vive acá, nunca en
// componentes (regla CLAUDE.md). Las funciones de ARMADO DE DATOS son puras y
// están separadas del render jspdf para poder testearlas (tests/unit).
// =============================================================================

// ── Formatters por locale del tenant (NUNCA hardcodear es-AR) ────────────────

type Formatters = {
  fmtDate: (value: string | null | undefined) => string;
  fmtNum: (value: number | null | undefined, maxFrac?: number) => string;
};

export function makeRecipeFormatters(locale: string): Formatters {
  const dateFmt = new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  return {
    fmtDate(value) {
      if (!value) return "-";
      try {
        return dateFmt.format(new Date(value));
      } catch {
        return "-";
      }
    },
    fmtNum(value, maxFrac = 3) {
      if (value === null || value === undefined) return "-";
      return new Intl.NumberFormat(locale, {
        maximumFractionDigits: maxFrac,
      }).format(value);
    },
  };
}

// ── Armado de datos (PURO, testeable) ────────────────────────────────────────

export type RecipeFormulaItem = {
  name: string;
  /** Cantidad de fórmula por kg de producto terminado. */
  quantityPerKg: number;
  unit: string;
  /** % sobre el total de la fórmula principal (no sustitutos). */
  percent: number | null;
  isSubstitute: boolean;
  /** Para sustitutos: a qué ingrediente principal reemplaza. */
  substitutesFor: string | null;
};

/**
 * Construye las filas de la fórmula con % calculado. El % se calcula sobre el
 * total de las filas PRINCIPALES (los sustitutos no suman al total: son
 * alternativas). La fórmula se expresa por kg de producto terminado (supuesto
 * heredado de La Jamonera, consistente con el modal de producción).
 */
export function buildFormulaItems(recipe: Recipe): RecipeFormulaItem[] {
  const rows = recipe.recipe_ingredients ?? [];
  const nameById = new Map<string, string>();
  for (const ri of rows) {
    if (ri.ingredient?.name) nameById.set(ri.ingredient_id, ri.ingredient.name);
  }

  const mainTotal = rows
    .filter((ri) => !ri.is_substitute)
    .reduce((s, ri) => s + (ri.quantity || 0), 0);

  return rows.map((ri) => ({
    name: ri.ingredient?.name ?? "(ingrediente)",
    quantityPerKg: ri.quantity,
    unit: ri.ingredient?.unit ?? ri.unit,
    percent:
      !ri.is_substitute && mainTotal > 0
        ? (ri.quantity / mainTotal) * 100
        : null,
    isSubstitute: ri.is_substitute,
    substitutesFor: ri.source_ingredient_id
      ? nameById.get(ri.source_ingredient_id) ?? null
      : null,
  }));
}

export type RecipeNutritionItem = { label: string; value: number; unit: string };

/** Datos nutricionales presentes (omite los null). Por 100 g/ml. */
export function buildNutritionItems(recipe: Recipe): RecipeNutritionItem[] {
  const n = recipe.nutrition ?? {};
  const defs: { key: keyof typeof n; label: string; unit: string }[] = [
    { key: "calories", label: "Valor energético", unit: "kcal" },
    { key: "proteins", label: "Proteínas", unit: "g" },
    { key: "fats", label: "Grasas totales", unit: "g" },
    { key: "carbs", label: "Hidratos de carbono", unit: "g" },
    { key: "sodium", label: "Sodio", unit: "mg" },
  ];
  const items: RecipeNutritionItem[] = [];
  for (const d of defs) {
    const value = n[d.key];
    if (value !== null && value !== undefined) {
      items.push({ label: d.label, value, unit: d.unit });
    }
  }
  return items;
}

/**
 * Vida útil legible: días base + estacionamiento previo si aplica. Devuelve el
 * texto principal y un detalle opcional según packaging_delay_type.
 */
export function buildShelfLife(recipe: Recipe): {
  text: string;
  detail: string | null;
} {
  const delay = PACKAGING_DELAYS.find(
    (p) => p.value === recipe.packaging_delay_type,
  );
  let detail: string | null = delay ? delay.label : null;
  if (recipe.packaging_delay_type === "aging" && recipe.aging_days > 0) {
    detail = `${delay?.label ?? "Estacionamiento previo"} · ${recipe.aging_days} días`;
  }
  return { text: `${recipe.shelf_life_days} días`, detail };
}

export type RecipeSeal = { id: string; text: string };

/**
 * Sellos frontales resueltos por sistema (regulatory_labels) con fallback a
 * front_labels legacy (octógonos AR). Devuelve el texto local de cada sello y
 * la forma del sistema para que el render lo dibuje.
 */
export function buildSeals(recipe: Recipe): {
  shape: "octagon" | "rect" | "magnifier" | "scale";
  systemName: string;
  legalRef: string;
  items: RecipeSeal[];
} | null {
  let systemId: LabelSystemId | null = null;
  let values: string[] = [];

  if (recipe.regulatory_labels?.values?.length) {
    systemId = recipe.regulatory_labels.system as LabelSystemId;
    values = recipe.regulatory_labels.values;
  } else if (recipe.front_labels?.length) {
    systemId = "ar_octogonos";
    values = recipe.front_labels;
  }
  if (!systemId || values.length === 0) return null;

  const system = getLabelSystem(systemId);
  if (!system) return null;

  const items: RecipeSeal[] = values.map((id) => {
    const v = system.values.find((x) => x.id === id);
    return { id, text: (v?.labelLocal ?? v?.label ?? id).toUpperCase() };
  });
  return {
    shape: system.seal.shape,
    systemName: system.name,
    legalRef: system.legalRef,
    items,
  };
}

// ── Render jspdf ─────────────────────────────────────────────────────────────

const SEAL_DARK: [number, number, number] = [12, 14, 12];
const SEAL_LIGHT: [number, number, number] = [255, 255, 255];

/** Logo del tenant a dataURL (mismo helper que generators de planillas). */
async function loadLogoDataUrl(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** Dibuja los sellos frontales con la forma del sistema (octágono/lupa/rect). */
function drawSeals(
  doc: ReturnType<typeof createPlanillaDoc>["doc"],
  seals: NonNullable<ReturnType<typeof buildSeals>>,
  startY: number,
): number {
  let x = PAGE.margin;
  let y = startY;
  const size = 16;
  const gap = 4;

  for (const seal of seals.items) {
    if (x + size > PAGE.width - PAGE.margin) {
      x = PAGE.margin;
      y += size + gap;
    }
    if (seals.shape === "octagon") {
      doc.setFillColor(...SEAL_DARK);
      // Octágono aproximado con polígono regular.
      drawOctagon(doc, x, y, size);
      doc.setTextColor(...SEAL_LIGHT);
    } else if (seals.shape === "magnifier") {
      doc.setDrawColor(...SEAL_DARK);
      doc.setLineWidth(0.5);
      doc.setFillColor(...SEAL_LIGHT);
      doc.circle(x + size / 2, y + size / 2, size / 2, "FD");
      doc.setTextColor(...SEAL_DARK);
    } else {
      doc.setFillColor(...SEAL_DARK);
      doc.roundedRect(x, y, size, size, 1.5, 1.5, "F");
      doc.setTextColor(...SEAL_LIGHT);
    }
    // Texto centrado dentro del sello (wrap a 2-3 líneas).
    doc.setFont("helvetica", "bold");
    doc.setFontSize(4.4);
    const lines = doc.splitTextToSize(seal.text, size - 3) as string[];
    const lineH = 1.9;
    const totalH = lines.length * lineH;
    let ty = y + size / 2 - totalH / 2 + lineH * 0.7;
    for (const ln of lines) {
      doc.text(ln, x + size / 2, ty, { align: "center" });
      ty += lineH;
    }
    x += size + gap;
  }
  return y + size + 4;
}

/** Octágono centrado en el cuadro (x,y,size). */
function drawOctagon(
  doc: ReturnType<typeof createPlanillaDoc>["doc"],
  x: number,
  y: number,
  size: number,
): void {
  const s = size;
  const c = s * 0.3; // recorte de esquina (igual al clipPath de la UI)
  const pts: [number, number][] = [
    [x + c, y],
    [x + s - c, y],
    [x + s, y + c],
    [x + s, y + s - c],
    [x + s - c, y + s],
    [x + c, y + s],
    [x, y + s - c],
    [x, y + c],
  ];
  doc.lines(
    pts.slice(1).map((p, i) => [p[0] - pts[i][0], p[1] - pts[i][1]]),
    pts[0][0],
    pts[0][1],
    [1, 1],
    "F",
    true,
  );
}

function tenantToMeta(branding: TenantBranding, subtitle?: string): PlanillaMeta {
  return {
    title: "Ficha técnica de receta",
    tenantName: branding.legalName || branding.name,
    logoUrl: branding.logoUrl,
    subtitle,
  };
}

/** Genera y descarga la ficha técnica de la receta en PDF. */
export async function generateRecipePdf(
  recipe: Recipe,
  branding: TenantBranding,
): Promise<void> {
  const { fmtDate, fmtNum } = makeRecipeFormatters(branding.locale);
  const meta = tenantToMeta(branding, recipe.commercial_name || recipe.title);
  meta.logoUrl = await loadLogoDataUrl(branding.logoUrl);

  const { doc, startY } = createPlanillaDoc(meta);
  let y = startY;

  // Identificación del producto.
  y = drawSectionTitle(doc, "Producto", y);
  y = drawFieldGrid(
    doc,
    [
      { label: "Nombre", value: recipe.title },
      { label: "Nombre comercial", value: recipe.commercial_name || "-" },
      { label: "Categoría (CAA)", value: recipe.category },
      { label: "Tipo de producto", value: recipe.product_type },
      {
        label: "RNPA / Registro",
        value: recipe.rnpa_exempt
          ? `Exento${recipe.rnpa_exempt_reason ? ` · ${recipe.rnpa_exempt_reason}` : ""}`
          : recipe.rnpa_number || "-",
      },
      {
        label: "Vencimiento RNPA",
        value:
          recipe.rnpa_exempt || !recipe.rnpa_expiry
            ? "-"
            : fmtDate(recipe.rnpa_expiry),
      },
    ],
    y,
  );

  if (recipe.description) {
    y += 2;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(90, 107, 88);
    const lines = doc.splitTextToSize(
      recipe.description,
      PAGE.width - PAGE.margin * 2,
    ) as string[];
    doc.text(lines, PAGE.margin, y);
    y += lines.length * 4 + 2;
  }

  // Vida útil.
  const shelf = buildShelfLife(recipe);
  y += 2;
  y = drawSectionTitle(doc, "Vida útil", y);
  y = drawFieldGrid(
    doc,
    [
      { label: "Vida útil", value: shelf.text },
      { label: "Envasado", value: shelf.detail || "Se envasa al producir" },
    ],
    y,
  );

  // Fórmula.
  const formula = buildFormulaItems(recipe);
  y += 2;
  y = drawSectionTitle(doc, "Fórmula (por kg de producto)", y);
  if (formula.length > 0) {
    y = drawTable(doc, {
      startY: y,
      columns: [
        { header: "Ingrediente" },
        { header: "%", width: 22, align: "right" },
        { header: "Cant. / kg", width: 30, align: "right" },
      ],
      rows: formula
        .filter((f) => !f.isSubstitute)
        .map((f) => [
          f.name,
          f.percent !== null ? `${fmtNum(f.percent, 1)} %` : "-",
          `${fmtNum(f.quantityPerKg)} ${f.unit}`,
        ]),
    });

    // Sustitutos (si hay).
    const subs = formula.filter((f) => f.isSubstitute);
    if (subs.length > 0) {
      y += 4;
      y = drawSectionTitle(doc, "Sustitutos", y);
      y = drawTable(doc, {
        startY: y,
        columns: [
          { header: "Ingrediente" },
          { header: "Sustituye a" },
          { header: "Cant. / kg", width: 30, align: "right" },
        ],
        rows: subs.map((f) => [
          f.name,
          f.substitutesFor || "-",
          `${fmtNum(f.quantityPerKg)} ${f.unit}`,
        ]),
      });
    }
  } else {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(90, 107, 88);
    doc.text("Sin fórmula cargada.", PAGE.margin, y);
    y += 6;
  }

  // Datos nutricionales (si existen).
  const nutrition = buildNutritionItems(recipe);
  if (nutrition.length > 0) {
    y += 4;
    y = drawSectionTitle(doc, "Información nutricional (por 100 g/ml)", y);
    y = drawTable(doc, {
      startY: y,
      columns: [
        { header: "Nutriente" },
        { header: "Cantidad", width: 40, align: "right" },
      ],
      rows: nutrition.map((n) => [
        n.label,
        `${fmtNum(n.value)} ${n.unit}`,
      ]),
    });
  }

  // Sellos frontales (octógonos / NOM-051 / ALTO EN / lupa / Nutri-Score).
  const seals = buildSeals(recipe);
  if (seals) {
    y += 4;
    y = drawSectionTitle(doc, `Rotulado frontal · ${seals.systemName}`, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(90, 107, 88);
    doc.text(seals.legalRef, PAGE.margin, y);
    y += 4;
    y = drawSeals(doc, seals, y);
  }

  finalizePdf(doc);
  downloadPdf(doc, `receta-${slugify(recipe.title)}`);
}

/** Slug simple para el nombre del archivo (sin acentos/espacios). */
export function slugify(text: string): string {
  return (
    text
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "receta"
  );
}
