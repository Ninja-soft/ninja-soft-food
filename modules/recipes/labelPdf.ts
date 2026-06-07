import { jsPDF } from "jspdf";
import {
  getLabelSystem,
  type LabelSystemId,
} from "@/lib/globalization/labelSystems";
import type { TenantBranding } from "@/modules/planillas/api";
import { allergenLabel } from "./schemas";
import { buildSeals, slugify } from "./pdf";
import type { Recipe } from "./api";

// =============================================================================
// modules/recipes/labelPdf — RÓTULO LEGAL print-ready de la receta. El documento
// que el cliente imprime y pega en el envase o manda a la imprenta. Distinto de
// pdf.ts (ficha técnica interna): esto es el rótulo del consumidor final.
//
// VECTORIAL: todo se dibuja con paths/polígonos de jspdf (líneas, rects, texto)
// — nada rasterizado salvo el logo del tenant. Así imprime nítido a cualquier
// tamaño y la imprenta lo acepta.
//
// La tabla nutricional se dibuja en el FORMATO REGULATORIO DEL PAÍS (regla dura
// 11): AR/MX/CL/BR → "Información Nutricional" por 100 g + por porción · US →
// FDA Nutrition Facts (líneas gruesas/finas, tipografía bold) · EU/ES → tabla
// 1169/2011 + badge Nutri-Score. Cada layout es una función por sistema.
//
// Las funciones de ARMADO DE DATOS son PURAS (sin jspdf/red) y están testeadas
// en tests/unit/recipe-label.test.ts. El render jspdf no se testea.
// =============================================================================

// ── Tamaños de etiqueta seleccionables (mm) ──────────────────────────────────
// La hoja es siempre A4; sobre ella se dibuja el área de la etiqueta con marcas
// de corte. "full" = A4 entera (sin recorte).
export type LabelSize = "full" | "10x15" | "7x10";

type Rect = { x: number; y: number; w: number; h: number };

const A4 = { width: 210, height: 297 } as const;

/** Caja de la etiqueta (centrada en A4) + marcas de corte para cada tamaño. */
export function labelRect(size: LabelSize): Rect {
  if (size === "full") {
    const m = 12;
    return { x: m, y: m, w: A4.width - m * 2, h: A4.height - m * 2 };
  }
  // 10x15 y 7x10 en cm → mm, centradas en la hoja.
  const dims = size === "10x15" ? { w: 100, h: 150 } : { w: 70, h: 100 };
  return {
    x: (A4.width - dims.w) / 2,
    y: (A4.height - dims.h) / 2,
    w: dims.w,
    h: dims.h,
  };
}

export const LABEL_SIZES: { value: LabelSize; label: string }[] = [
  { value: "full", label: "A4 (hoja completa)" },
  { value: "10x15", label: "Etiqueta 10 x 15 cm" },
  { value: "7x10", label: "Etiqueta 7 x 10 cm" },
];

// ── Colores LEGALES (no tokens de tema: el rótulo debe verse igual en imprenta) ──
const BLACK: [number, number, number] = [12, 14, 12];
const WHITE: [number, number, number] = [255, 255, 255];
const GREY: [number, number, number] = [90, 90, 90];
const HAIRLINE: [number, number, number] = [40, 40, 40];

const NUTRISCORE_RGB: Record<string, [number, number, number]> = {
  A: [3, 129, 65],
  B: [133, 187, 47],
  C: [254, 203, 2],
  D: [238, 129, 0],
  E: [230, 62, 17],
};

// =============================================================================
// ARMADO DE DATOS (PURO, testeable)
// =============================================================================

export type LabelIngredient = {
  name: string;
  /** Cantidad de fórmula (define el orden descendente). */
  quantity: number;
  /** El ingrediente es (o contiene) un alérgeno declarado → va en negrita. */
  isAllergen: boolean;
};

/**
 * Lista de ingredientes para el rótulo, en ORDEN DESCENDENTE por cantidad de la
 * fórmula (requisito de etiquetado: ingredientes de mayor a menor). Excluye los
 * SUSTITUTOS (son alternativas, no van en la lista del rótulo del producto base)
 * salvo que se pida `includeSubstitutes`. Marca como alérgeno cada ingrediente
 * cuyo nombre coincide (case-insensitive, sin acentos) con un alérgeno declarado.
 */
export function buildLabelIngredients(
  recipe: Recipe,
  opts?: { includeSubstitutes?: boolean },
): LabelIngredient[] {
  const allergenTerms = (recipe.allergens ?? []).map((id) =>
    norm(allergenLabel(id)),
  );
  const rows = (recipe.recipe_ingredients ?? []).filter(
    (ri) => opts?.includeSubstitutes || !ri.is_substitute,
  );
  return rows
    .map((ri) => {
      const name = ri.ingredient?.name ?? "(ingrediente)";
      return {
        name,
        quantity: ri.quantity || 0,
        isAllergen: matchesAllergen(name, allergenTerms),
      };
    })
    .sort((a, b) => b.quantity - a.quantity);
}

/** Normaliza para comparar nombres: minúsculas, sin acentos, sin espacios extra. */
function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** ¿El nombre del ingrediente contiene algún término de alérgeno declarado? */
function matchesAllergen(name: string, allergenTerms: string[]): boolean {
  const n = norm(name);
  return allergenTerms.some((t) => t.length > 0 && n.includes(t));
}

/** Lista de alérgenos declarados (labels), para el bloque "Contiene". */
export function buildAllergenList(recipe: Recipe): string[] {
  return (recipe.allergens ?? []).map((id) => allergenLabel(id));
}

export type LegalDataLine = { label: string; value: string };

/**
 * Datos legales del rótulo (razón social + identificador fiscal + registro del
 * producto + lote/vencimiento como PLACEHOLDERS que completa producción).
 * `taxIdLabel` viene del operating profile (CUIT/RFC/CNPJ/EIN...). NO se asume
 * Argentina (regla dura 11): RNPA solo si la receta lo tiene; si hay permits del
 * país, el caller los pasa en `permitLines`.
 */
export function buildLegalData(input: {
  recipe: Recipe;
  branding: TenantBranding;
  taxIdLabel: string;
  countryName: string;
  /** Permisos del país (regulatory_permits) ya formateados "TIPO: número". */
  permitLines?: string[];
}): LegalDataLine[] {
  const { recipe, branding, taxIdLabel, countryName } = input;
  const out: LegalDataLine[] = [];

  out.push({
    label: "Elaborado por",
    value: branding.legalName || branding.name,
  });
  if (branding.address) out.push({ label: "Domicilio", value: branding.address });
  if (branding.cuit) out.push({ label: taxIdLabel, value: branding.cuit });

  // Registro del producto: RNPA (AR) si existe, o exención documentada.
  if (recipe.rnpa_exempt) {
    out.push({
      label: "Registro",
      value: recipe.rnpa_exempt_reason
        ? `Exento · ${recipe.rnpa_exempt_reason}`
        : "Exento",
    });
  } else if (recipe.rnpa_number) {
    out.push({ label: "RNPA", value: recipe.rnpa_number });
  }
  // Permisos genéricos del país (COFEPRIS, RSA, etc.).
  for (const line of input.permitLines ?? []) {
    out.push({ label: "Registro", value: line });
  }

  // Lote y vencimiento: placeholders que completa producción al imprimir.
  out.push({ label: "Lote", value: LOT_PLACEHOLDER });
  out.push({ label: "Vencimiento", value: EXPIRY_PLACEHOLDER });
  out.push({ label: "Origen", value: countryName });

  return out;
}

export const LOT_PLACEHOLDER = "{LOTE}";
export const EXPIRY_PLACEHOLDER = "{VTO}";
/** Placeholder de código de barras (recipes no tiene EAN: espacio reservado). */
export const BARCODE_PLACEHOLDER = "{EAN}";

export type NutritionRow = {
  label: string;
  /** Valor por 100 g/ml (texto formateado con unidad), "-" si falta. */
  per100: string;
  /** Valor por porción (texto formateado con unidad), "-" si falta. */
  perPortion: string;
  /** Sangría visual (sub-nutriente, ej. "de las cuales saturadas"). */
  indent?: boolean;
};

/**
 * Filas de la tabla nutricional escaladas a la porción. `portionG` (default 100)
 * define el factor por porción. PURA: dado el recipe + porción, devuelve los
 * pares (por 100 / por porción) ya formateados. El orden y la composición de
 * nutrientes los decide el layout por país (definidos abajo por sistema).
 */
export function buildNutritionRows(
  recipe: Recipe,
  portionG: number,
  defs: { key: NutritionKey; label: string; unit: string; indent?: boolean }[],
  fmtNum: (v: number | null | undefined, frac?: number) => string,
): NutritionRow[] {
  const n = recipe.nutrition ?? {};
  const factor = portionG > 0 ? portionG / 100 : 1;
  return defs.map((d) => {
    const raw = n[d.key];
    const has = raw !== null && raw !== undefined && Number.isFinite(raw);
    return {
      label: d.label,
      per100: has ? `${fmtNum(raw)} ${d.unit}` : "-",
      perPortion: has ? `${fmtNum((raw as number) * factor)} ${d.unit}` : "-",
      indent: d.indent,
    };
  });
}

type NutritionKey =
  | "calories"
  | "proteins"
  | "fats"
  | "carbs"
  | "sodium"
  | "saturated_fats"
  | "trans_fats"
  | "sugars"
  | "fiber"
  | "salt";

// Composición de la tabla por familia de sistema (orden regulatorio del país).
const NUTRITION_DEFS_LATAM: {
  key: NutritionKey;
  label: string;
  unit: string;
  indent?: boolean;
}[] = [
  { key: "calories", label: "Valor energético", unit: "kcal" },
  { key: "carbs", label: "Carbohidratos", unit: "g" },
  { key: "sugars", label: "Azúcares totales", unit: "g", indent: true },
  { key: "proteins", label: "Proteínas", unit: "g" },
  { key: "fats", label: "Grasas totales", unit: "g" },
  { key: "saturated_fats", label: "Grasas saturadas", unit: "g", indent: true },
  { key: "trans_fats", label: "Grasas trans", unit: "g", indent: true },
  { key: "fiber", label: "Fibra alimentaria", unit: "g" },
  { key: "sodium", label: "Sodio", unit: "mg" },
];

const NUTRITION_DEFS_FDA: {
  key: NutritionKey;
  label: string;
  unit: string;
  indent?: boolean;
}[] = [
  { key: "fats", label: "Total Fat", unit: "g" },
  { key: "saturated_fats", label: "Saturated Fat", unit: "g", indent: true },
  { key: "trans_fats", label: "Trans Fat", unit: "g", indent: true },
  { key: "sodium", label: "Sodium", unit: "mg" },
  { key: "carbs", label: "Total Carbohydrate", unit: "g" },
  { key: "fiber", label: "Dietary Fiber", unit: "g", indent: true },
  { key: "sugars", label: "Total Sugars", unit: "g", indent: true },
  { key: "proteins", label: "Protein", unit: "g" },
];

const NUTRITION_DEFS_EU: {
  key: NutritionKey;
  label: string;
  unit: string;
  indent?: boolean;
}[] = [
  { key: "calories", label: "Valor energético", unit: "kcal" },
  { key: "fats", label: "Grasas", unit: "g" },
  { key: "saturated_fats", label: "de las cuales saturadas", unit: "g", indent: true },
  { key: "carbs", label: "Hidratos de carbono", unit: "g" },
  { key: "sugars", label: "de los cuales azúcares", unit: "g", indent: true },
  { key: "fiber", label: "Fibra alimentaria", unit: "g" },
  { key: "proteins", label: "Proteínas", unit: "g" },
  { key: "salt", label: "Sal", unit: "g" },
];

/** Familia de layout nutricional según el sistema de rotulado del país. */
export type NutritionLayout = "latam" | "fda" | "eu";

export function nutritionLayoutFor(systemId: LabelSystemId | null): NutritionLayout {
  if (systemId === "us_fda") return "fda";
  if (systemId === "eu_nutriscore") return "eu";
  return "latam"; // AR/MX/CL/BR y default
}

// =============================================================================
// RENDER jspdf (vectorial)
// =============================================================================

/** Logo del tenant a dataURL (único elemento rasterizado del rótulo). */
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

function makeFmt(locale: string) {
  return (v: number | null | undefined, frac = 1): string => {
    if (v === null || v === undefined || !Number.isFinite(v)) return "-";
    return new Intl.NumberFormat(locale, { maximumFractionDigits: frac }).format(
      v,
    );
  };
}

/** Marcas de corte en las 4 esquinas de la etiqueta (líneas finas fuera del área). */
function drawCropMarks(doc: jsPDF, r: Rect): void {
  doc.setDrawColor(...GREY);
  doc.setLineWidth(0.2);
  const len = 4;
  const off = 1.5;
  const corners: [number, number][] = [
    [r.x, r.y],
    [r.x + r.w, r.y],
    [r.x, r.y + r.h],
    [r.x + r.w, r.y + r.h],
  ];
  for (const [cx, cy] of corners) {
    const sx = cx < A4.width / 2 ? -1 : 1;
    const sy = cy < A4.height / 2 ? -1 : 1;
    // marca horizontal
    doc.line(cx + sx * off, cy, cx + sx * (off + len), cy);
    // marca vertical
    doc.line(cx, cy + sy * off, cx, cy + sy * (off + len));
  }
}

// ── Sellos frontales vectoriales (octágono / lupa / Nutri-Score) ─────────────

/** Octágono negro vectorial con borde blanco y texto centrado (AR/MX/CL). */
function drawOctagon(
  doc: jsPDF,
  x: number,
  y: number,
  size: number,
  text: string,
  signature?: string | null,
): void {
  const c = size * 0.293; // recorte de esquina del octágono regular
  const pts: [number, number][] = [
    [x + c, y],
    [x + size - c, y],
    [x + size, y + c],
    [x + size, y + size - c],
    [x + size - c, y + size],
    [x + c, y + size],
    [x, y + size - c],
    [x, y + c],
  ];
  const poly = (fill: [number, number, number]) => {
    doc.setFillColor(...fill);
    doc.lines(
      pts.slice(1).map((p, i) => [p[0] - pts[i]![0], p[1] - pts[i]![1]]),
      pts[0]![0],
      pts[0]![1],
      [1, 1],
      "F",
      true,
    );
  };
  poly(WHITE);
  // cara negra (inset)
  const inset = size * 0.07;
  drawOctagonInset(doc, x + inset, y + inset, size - inset * 2, BLACK);

  doc.setTextColor(...WHITE);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(size * 0.16);
  const lines = doc.splitTextToSize(text, size - 4) as string[];
  const lineH = size * 0.18;
  let ty = y + size / 2 - (lines.length * lineH) / 2 + lineH * 0.75;
  for (const ln of lines) {
    doc.text(ln, x + size / 2, ty, { align: "center" });
    ty += lineH;
  }
  if (signature) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(size * 0.1);
    doc.text(signature, x + size / 2, y + size - size * 0.12, {
      align: "center",
    });
  }
}

function drawOctagonInset(
  doc: jsPDF,
  x: number,
  y: number,
  size: number,
  fill: [number, number, number],
): void {
  const c = size * 0.293;
  const pts: [number, number][] = [
    [x + c, y],
    [x + size - c, y],
    [x + size, y + c],
    [x + size, y + size - c],
    [x + size - c, y + size],
    [x + c, y + size],
    [x, y + size - c],
    [x, y + c],
  ];
  doc.setFillColor(...fill);
  doc.lines(
    pts.slice(1).map((p, i) => [p[0] - pts[i]![0], p[1] - pts[i]![1]]),
    pts[0]![0],
    pts[0]![1],
    [1, 1],
    "F",
    true,
  );
}

/** Lupa ANVISA (BR): rótulo rectangular negro con ícono de lupa vectorial. */
function drawMagnifier(
  doc: jsPDF,
  x: number,
  y: number,
  h: number,
  text: string,
): number {
  const padX = h * 0.3;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(h * 0.3);
  const lines = doc.splitTextToSize(text, 40) as string[];
  const textW = Math.max(...lines.map((l) => doc.getTextWidth(l)));
  const iconW = h * 0.7;
  const w = padX * 2 + iconW + 2 + textW;
  doc.setFillColor(...BLACK);
  doc.roundedRect(x, y, w, h, 1, 1, "F");
  // ícono de lupa (círculo + mango)
  doc.setDrawColor(...WHITE);
  doc.setLineWidth(0.5);
  const cr = iconW * 0.32;
  const cx = x + padX + cr;
  const cy = y + h / 2 - cr * 0.2;
  doc.circle(cx, cy, cr, "S");
  doc.line(cx + cr * 0.7, cy + cr * 0.7, cx + cr * 1.4, cy + cr * 1.4);
  doc.setTextColor(...WHITE);
  let ty = y + h / 2 - ((lines.length - 1) * h * 0.32) / 2 + h * 0.1;
  for (const ln of lines) {
    doc.text(ln, x + padX + iconW + 2, ty, { align: "left" });
    ty += h * 0.32;
  }
  return w;
}

/** Badge Nutri-Score vectorial: A..E con la letra del grade resaltada. */
function drawNutriScore(doc: jsPDF, x: number, y: number, grade: string): void {
  const cell = 9;
  const h = 12;
  const g = grade.toUpperCase();
  const letters = ["A", "B", "C", "D", "E"];
  letters.forEach((ltr, i) => {
    const active = ltr === g;
    const color = NUTRISCORE_RGB[ltr]!;
    const cw = active ? cell * 1.25 : cell;
    const ch = active ? h * 1.15 : h;
    const cx = x + i * cell;
    const cy = y + (h - ch) / 2;
    doc.setFillColor(...color);
    doc.roundedRect(cx, cy, cw, ch, 1.2, 1.2, "F");
    doc.setTextColor(...WHITE);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(active ? 11 : 8);
    doc.text(ltr, cx + cw / 2, cy + ch / 2 + (active ? 3 : 2.2), {
      align: "center",
    });
  });
}

/** Dibuja los sellos frontales del sistema. Devuelve la y tras el bloque. */
function drawFrontSeals(doc: jsPDF, recipe: Recipe, r: Rect, y: number): number {
  const seals = buildSeals(recipe);
  if (!seals) return y;

  if (seals.shape === "octagon") {
    const size = Math.min(20, (r.w - 8) / 4);
    const gap = 3;
    let x = r.x;
    let yy = y;
    const signature =
      recipe.regulatory_labels?.system === "cl_sellos"
        ? "MINSAL"
        : null;
    for (const item of seals.items) {
      if (x + size > r.x + r.w) {
        x = r.x;
        yy += size + gap;
      }
      drawOctagon(doc, x, yy, size, item.text, signature);
      x += size + gap;
    }
    return yy + size + 4;
  }

  if (seals.shape === "magnifier") {
    const h = 7;
    let yy = y;
    for (const item of seals.items) {
      drawMagnifier(doc, r.x, yy, h, item.text);
      yy += h + 2;
    }
    return yy + 2;
  }

  // grade (Nutri-Score): un solo badge.
  const grade = seals.items[0]?.id ?? "C";
  drawNutriScore(doc, r.x, y, grade);
  return y + 16;
}

// ── Tabla nutricional por país ───────────────────────────────────────────────

/** Layout LATAM (AR/MX/CL/BR): "Información Nutricional" por 100 g + porción. */
function drawNutritionLatam(
  doc: jsPDF,
  recipe: Recipe,
  r: Rect,
  y: number,
  portionG: number,
  fmt: (v: number | null | undefined, frac?: number) => string,
): number {
  const rows = buildNutritionRows(recipe, portionG, NUTRITION_DEFS_LATAM, fmt);
  const w = r.w;
  let yy = y;

  // Marco.
  doc.setDrawColor(...HAIRLINE);
  doc.setLineWidth(0.5);

  // Título.
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...BLACK);
  doc.text("INFORMACIÓN NUTRICIONAL", r.x + 2, yy + 5);
  yy += 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text(`Porción: ${fmt(portionG)} g`, r.x + 2, yy);
  yy += 4;

  // Encabezado de columnas.
  const col1 = r.x + w * 0.5;
  const col2 = r.x + w * 0.78;
  doc.setLineWidth(0.4);
  doc.line(r.x, yy, r.x + w, yy);
  yy += 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.text("por 100 g", col1, yy, { align: "right" });
  doc.text("por porción", r.x + w - 2, yy, { align: "right" });
  yy += 2;
  doc.setLineWidth(0.4);
  doc.line(r.x, yy, r.x + w, yy);
  yy += 4;

  // Filas.
  doc.setFontSize(7.5);
  for (const row of rows) {
    doc.setFont("helvetica", row.indent ? "normal" : "bold");
    doc.setTextColor(...(row.indent ? GREY : BLACK));
    doc.text(row.label, r.x + (row.indent ? 5 : 2), yy);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...BLACK);
    doc.text(row.per100, col1, yy, { align: "right" });
    doc.text(row.perPortion, r.x + w - 2, yy, { align: "right" });
    yy += 4.2;
    doc.setDrawColor(...HAIRLINE);
    doc.setLineWidth(0.1);
    doc.line(r.x, yy - 1.2, r.x + w, yy - 1.2);
  }
  // Marco exterior.
  doc.setDrawColor(...HAIRLINE);
  doc.setLineWidth(0.6);
  doc.rect(r.x, y, w, yy - y - 1.2);
  // referencia silenciada de col2 (reservado para %VD futuro)
  void col2;
  return yy + 2;
}

/** Layout FDA (US): Nutrition Facts con líneas gruesas/finas y bold jerárquico. */
function drawNutritionFda(
  doc: jsPDF,
  recipe: Recipe,
  r: Rect,
  y: number,
  portionG: number,
  fmt: (v: number | null | undefined, frac?: number) => string,
): number {
  const rows = buildNutritionRows(recipe, portionG, NUTRITION_DEFS_FDA, fmt);
  const w = Math.min(r.w, 76);
  let yy = y;
  const x = r.x;

  doc.setDrawColor(...BLACK);
  doc.setTextColor(...BLACK);

  // Título grande.
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("Nutrition Facts", x + 1.5, yy + 6);
  yy += 9;
  // línea fina
  doc.setLineWidth(0.3);
  doc.line(x, yy, x + w, yy);
  yy += 3.5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text(`Serving size ${fmt(portionG)} g`, x + 1.5, yy);
  yy += 2;
  // barra gruesa
  doc.setLineWidth(1.6);
  doc.line(x, yy, x + w, yy);
  yy += 4;

  // Calorías destacadas.
  const n = recipe.nutrition ?? {};
  const calPortion =
    n.calories !== null && n.calories !== undefined
      ? (n.calories * (portionG > 0 ? portionG / 100 : 1))
      : null;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.text("Amount per serving", x + 1.5, yy);
  yy += 5;
  doc.setFontSize(13);
  doc.text("Calories", x + 1.5, yy);
  doc.setFontSize(16);
  doc.text(fmt(calPortion, 0), x + w - 1.5, yy, { align: "right" });
  yy += 2;
  doc.setLineWidth(0.8);
  doc.line(x, yy, x + w, yy);
  yy += 4;

  // Filas (por porción, estilo FDA).
  doc.setFontSize(7.5);
  for (const row of rows) {
    doc.setFont("helvetica", row.indent ? "normal" : "bold");
    doc.text(row.label, x + (row.indent ? 5 : 1.5), yy);
    doc.setFont("helvetica", "normal");
    doc.text(row.perPortion, x + w - 1.5, yy, { align: "right" });
    yy += 3.8;
    doc.setLineWidth(0.2);
    doc.line(x, yy - 1.2, x + w, yy - 1.2);
  }
  // marco exterior grueso
  doc.setLineWidth(1.2);
  doc.rect(x, y, w, yy - y - 1.2);
  return yy + 2;
}

/** Layout EU (ES/UE): tabla 1169/2011 por 100 g + porción y badge Nutri-Score. */
function drawNutritionEu(
  doc: jsPDF,
  recipe: Recipe,
  r: Rect,
  y: number,
  portionG: number,
  fmt: (v: number | null | undefined, frac?: number) => string,
): number {
  const rows = buildNutritionRows(recipe, portionG, NUTRITION_DEFS_EU, fmt);
  const w = r.w;
  let yy = y;

  doc.setDrawColor(...HAIRLINE);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(...BLACK);
  doc.text("Información nutricional", r.x + 2, yy + 5);
  yy += 8;

  const col1 = r.x + w * 0.62;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setLineWidth(0.4);
  doc.line(r.x, yy, r.x + w, yy);
  yy += 4;
  doc.text("por 100 g", col1, yy, { align: "right" });
  doc.text(`por ${fmt(portionG)} g`, r.x + w - 2, yy, { align: "right" });
  yy += 2;
  doc.line(r.x, yy, r.x + w, yy);
  yy += 4;

  doc.setFontSize(7.5);
  for (const row of rows) {
    doc.setFont("helvetica", row.indent ? "normal" : "bold");
    doc.setTextColor(...(row.indent ? GREY : BLACK));
    doc.text(row.label, r.x + (row.indent ? 5 : 2), yy);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...BLACK);
    doc.text(row.per100, col1, yy, { align: "right" });
    doc.text(row.perPortion, r.x + w - 2, yy, { align: "right" });
    yy += 4.2;
  }
  doc.setDrawColor(...HAIRLINE);
  doc.setLineWidth(0.6);
  doc.rect(r.x, y, w, yy - y - 1.2);
  return yy + 2;
}

function drawNutritionTable(
  doc: jsPDF,
  recipe: Recipe,
  r: Rect,
  y: number,
  portionG: number,
  layout: NutritionLayout,
  fmt: (v: number | null | undefined, frac?: number) => string,
): number {
  if (layout === "fda") return drawNutritionFda(doc, recipe, r, y, portionG, fmt);
  if (layout === "eu") return drawNutritionEu(doc, recipe, r, y, portionG, fmt);
  return drawNutritionLatam(doc, recipe, r, y, portionG, fmt);
}

// ── Bloque de ingredientes (alérgenos en negrita) ────────────────────────────

function drawIngredients(
  doc: jsPDF,
  recipe: Recipe,
  r: Rect,
  y: number,
): number {
  const items = buildLabelIngredients(recipe);
  if (items.length === 0) return y;
  let yy = y;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...BLACK);
  doc.text("INGREDIENTES", r.x, yy);
  yy += 4;

  // Lista "a, b, c" con alérgenos en negrita: se dibuja palabra por palabra para
  // poder mezclar pesos de fuente en la misma línea (jspdf no soporta rich text).
  doc.setFontSize(7.5);
  const lineH = 3.6;
  let cx = r.x;
  const maxX = r.x + r.w;
  for (let i = 0; i < items.length; i++) {
    const it = items[i]!;
    const token = it.name + (i < items.length - 1 ? ", " : ".");
    doc.setFont("helvetica", it.isAllergen ? "bold" : "normal");
    const tw = doc.getTextWidth(token);
    if (cx + tw > maxX) {
      cx = r.x;
      yy += lineH;
    }
    doc.text(token, cx, yy);
    cx += tw;
  }
  yy += lineH + 2;

  // Bloque "Contiene: ..." con los alérgenos declarados.
  const allergens = buildAllergenList(recipe);
  if (allergens.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    const prefix = "CONTIENE: ";
    doc.text(prefix, r.x, yy);
    doc.setFont("helvetica", "normal");
    const list = allergens.join(", ") + ".";
    const lines = doc.splitTextToSize(
      list,
      r.w - doc.getTextWidth(prefix),
    ) as string[];
    doc.text(lines, r.x + doc.getTextWidth(prefix), yy);
    yy += lines.length * lineH + 2;
  }
  return yy + 1;
}

// ── Datos legales + placeholders ─────────────────────────────────────────────

function drawLegalBlock(
  doc: jsPDF,
  lines: LegalDataLine[],
  r: Rect,
  y: number,
): number {
  let yy = y;
  doc.setDrawColor(...HAIRLINE);
  doc.setLineWidth(0.3);
  doc.line(r.x, yy, r.x + r.w, yy);
  yy += 4;
  for (const line of lines) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.8);
    doc.setTextColor(...GREY);
    doc.text(line.label.toUpperCase(), r.x, yy);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...BLACK);
    const wrapped = doc.splitTextToSize(line.value, r.w * 0.62) as string[];
    doc.text(wrapped, r.x + r.w * 0.38, yy);
    yy += Math.max(4.4, wrapped.length * 3.4 + 1);
  }
  return yy;
}

/** Espacio reservado para el código de barras EAN (recipes no tiene barcode). */
function drawBarcodePlaceholder(doc: jsPDF, r: Rect, y: number): number {
  const bw = 40;
  const bh = 12;
  const x = r.x + r.w - bw;
  doc.setDrawColor(...GREY);
  doc.setLineWidth(0.3);
  doc.setLineDashPattern([1, 1], 0);
  doc.rect(x, y, bw, bh, "S");
  doc.setLineDashPattern([], 0);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  doc.setTextColor(...GREY);
  doc.text(BARCODE_PLACEHOLDER, x + bw / 2, y + bh / 2 + 1, { align: "center" });
  return y + bh + 2;
}

// =============================================================================
// ENTRADA PÚBLICA
// =============================================================================

export type LabelPdfOptions = {
  size: LabelSize;
  /** Porción en gramos para la columna "por porción" (default 100). */
  portionG?: number;
  /** ISO-2 del país operativo (origen + formato regulatorio). */
  country?: string;
  countryName?: string;
  taxIdLabel?: string;
  /** Permisos del país ya formateados ("COFEPRIS: 123"). */
  permitLines?: string[];
};

/** Construye el documento del rótulo (sin descargar). Útil para preview/blob. */
export async function buildLabelDoc(
  recipe: Recipe,
  branding: TenantBranding,
  opts: LabelPdfOptions,
): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const r = labelRect(opts.size);
  const portionG = opts.portionG && opts.portionG > 0 ? opts.portionG : 100;
  const fmt = makeFmt(branding.locale);

  const systemId =
    (recipe.regulatory_labels?.system as LabelSystemId | undefined) ??
    (recipe.front_labels?.length ? "ar_octogonos" : null);
  const layout = nutritionLayoutFor(systemId);

  // Marco de la etiqueta + marcas de corte (excepto A4 completa).
  if (opts.size !== "full") drawCropMarks(doc, r);
  doc.setDrawColor(...HAIRLINE);
  doc.setLineWidth(0.4);
  doc.rect(r.x, r.y, r.w, r.h);

  // Padding interno de la etiqueta.
  const pad = 5;
  const inner: Rect = {
    x: r.x + pad,
    y: r.y + pad,
    w: r.w - pad * 2,
    h: r.h - pad * 2,
  };
  let y = inner.y;

  // Encabezado: logo + nombre comercial + marca.
  const logo = await loadLogoDataUrl(branding.logoUrl);
  let textX = inner.x;
  if (logo) {
    try {
      const fmtImg = logo.includes("image/png") ? "PNG" : "JPEG";
      doc.addImage(logo, fmtImg, inner.x, y, 14, 14, undefined, "FAST");
      textX = inner.x + 17;
    } catch {
      // sin logo si no decodifica
    }
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...BLACK);
  const productName = recipe.commercial_name || recipe.title;
  const nameLines = doc.splitTextToSize(
    productName,
    inner.w - (textX - inner.x),
  ) as string[];
  doc.text(nameLines, textX, y + 5);
  y += Math.max(14, nameLines.length * 5) + 2;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...GREY);
  doc.text(branding.legalName || branding.name, inner.x, y);
  y += 5;

  // Sellos frontales vectoriales.
  y = drawFrontSeals(doc, recipe, inner, y) + 2;

  // Tabla nutricional en el formato del país.
  y = drawNutritionTable(doc, recipe, inner, y, portionG, layout, fmt) + 3;

  // Ingredientes + alérgenos.
  y = drawIngredients(doc, recipe, inner, y) + 1;

  // Datos legales + lote/vto placeholders.
  const legal = buildLegalData({
    recipe,
    branding,
    taxIdLabel: opts.taxIdLabel ?? "CUIT",
    countryName: opts.countryName ?? opts.country ?? "Argentina",
    permitLines: opts.permitLines,
  });
  y = drawLegalBlock(doc, legal, inner, y) + 2;

  // Código de barras (placeholder reservado).
  drawBarcodePlaceholder(doc, inner, y);

  return doc;
}

export type LabelBlobResult = { blob: Blob; filename: string };

/** Genera el rótulo y lo descarga. */
export async function generateLabelPdf(
  recipe: Recipe,
  branding: TenantBranding,
  opts: LabelPdfOptions,
): Promise<void> {
  const doc = await buildLabelDoc(recipe, branding, opts);
  doc.save(labelFilename(recipe));
}

/** Genera el rótulo y devuelve el Blob (para preview en iframe o guardado). */
export async function generateLabelBlob(
  recipe: Recipe,
  branding: TenantBranding,
  opts: LabelPdfOptions,
): Promise<LabelBlobResult> {
  const doc = await buildLabelDoc(recipe, branding, opts);
  return { blob: doc.output("blob"), filename: labelFilename(recipe) };
}

export function labelFilename(recipe: Recipe): string {
  return `rotulo-${slugify(recipe.commercial_name || recipe.title)}.pdf`;
}
