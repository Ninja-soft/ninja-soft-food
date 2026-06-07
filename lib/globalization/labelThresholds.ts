// =============================================================================
// lib/globalization/labelThresholds — cálculo DETERMINÍSTICO de sellos frontales
// desde la tabla nutricional por 100 g/ml, según los umbrales legales de cada
// país. ESTO ES LEGAL: cada umbral cita su fuente normativa en el comment de
// al lado. La IA NO decide sellos — propone la nutrición; el sello sale de acá,
// puro y reproducible, y siempre lo confirma un humano antes de guardar.
//
// PUREZA: este módulo no tiene dependencias de red/DB. computeSeals(systemId,
// nutrition, flags) es una función pura testeada a fondo en tests/unit/ai.test.ts.
//
// Criterio ante DUDA: ser conservador (advertir de más nunca daña al consumidor,
// y el humano puede destildar) y dejar el comentario TODO-LEGAL para revisión de
// ABR / bromatólogo del país. Marcado explícito con "TODO-LEGAL:".
// =============================================================================

import type { LabelSystemId } from "./labelSystems";

// ── Shape de nutrición que consume el cálculo ────────────────────────────────
// Todos los valores son POR 100 g (sólidos) o POR 100 ml (líquidos). Opcionales:
// un campo ausente/null significa "dato no disponible" y NO dispara su sello (no
// se puede afirmar un exceso sin el dato). El caller resuelve "datos faltantes"
// con seal-coverage (ver missingFieldsForSystem).
export type NutritionPer100 = {
  /** Energía en kcal por 100 g/ml. */
  calories?: number | null;
  proteins?: number | null;
  /** Grasas totales (g). */
  fats?: number | null;
  /** Hidratos de carbono totales (g). */
  carbs?: number | null;
  /** Sodio en MILIGRAMOS (mg) por 100 g/ml. Convención del resto del sistema. */
  sodium?: number | null;
  /** Grasas saturadas (g). */
  saturated_fats?: number | null;
  /** Grasas trans (g). */
  trans_fats?: number | null;
  /** Azúcares totales (g). Para AR/MX se interpreta como azúcares libres/añadidos. */
  sugars?: number | null;
  fiber?: number | null;
  /** Sal (g) = sodio×2.5. Informativo; el cálculo usa `sodium` en mg. */
  salt?: number | null;
};

// Flags que dependen de la FÓRMULA (ingredientes), no de la tabla nutricional:
// no se pueden derivar de macros. El caller los provee desde la receta.
export type SealFlags = {
  /** El producto contiene edulcorantes no nutritivos en su fórmula. */
  contains_sweeteners?: boolean;
  /** El producto contiene cafeína añadida en su fórmula. */
  contains_caffeine?: boolean;
};

// Resultado del cálculo:
// - kind "multi-seal": ids de sellos disparados (subset de LabelSystem.values).
// - kind "grade": una sola calificación (Nutri-Score "A".."E").
export type SealComputation =
  | { kind: "multi-seal"; values: string[] }
  | { kind: "grade"; grade: string };

// 1 g de grasa = 9 kcal; 1 g de carbohidrato/azúcar/proteína = 4 kcal (factores
// Atwater, usados por todos los reglamentos de perfil de nutrientes citados).
const KCAL_PER_G_FAT = 9;
const KCAL_PER_G_CARB = 4;

function num(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

// ── Perfil OPS / AR — Ley 27.642 (etapa final) ───────────────────────────────
// Fuente: Ley 27.642 (Promoción de la Alimentación Saludable) + Decreto
// 151/2022, que adopta el Modelo de Perfil de Nutrientes de la OPS/OMS. Los
// umbrales de la ETAPA FINAL (los más estrictos, vigentes tras el cronograma de
// implementación) son:
//   - Azúcares libres:    ≥ 10 % del total de energía.
//   - Grasas totales:     ≥ 30 % del total de energía.
//   - Grasas saturadas:   ≥ 10 % del total de energía.
//   - Sodio:              ≥ 1 mg por cada 1 kcal  (relación sodio/energía OPS).
//   - Energía (sólidos):  ≥ 275 kcal / 100 g.
//   - Energía (líquidos): ≥ 70 kcal / 100 ml (perfil OPS para bebidas).
// Octógonos "Contiene edulcorantes" / "Contiene cafeína": leyendas por presencia
// del ingrediente (flags), no por umbral. (Art. de la ley sobre leyendas
// precautorias para edulcorantes y cafeína en productos dirigidos a NNyA.)
//
// NOTA de unidades: el sistema guarda sodio en mg. La regla OPS sodio/energía
// (≥1 mg/kcal) es la determinante; el enunciado del feature menciona además
// "≥300 mg/100 g sólidos" como atajo conservador — se aplica el MÁS estricto
// de ambos (dispara si CUALQUIERA se cumple) para no sub-rotular.
const OPS_SUGAR_ENERGY_PCT = 10; // %
const OPS_FAT_ENERGY_PCT = 30; // %
const OPS_SATFAT_ENERGY_PCT = 10; // %
const OPS_SODIUM_MG_PER_KCAL = 1; // mg sodio / kcal
const OPS_SODIUM_MG_SOLID = 300; // mg / 100 g (atajo conservador)
const OPS_ENERGY_KCAL_SOLID = 275; // kcal / 100 g
const OPS_ENERGY_KCAL_LIQUID = 70; // kcal / 100 ml (bebidas, perfil OPS)

// ¿Es líquido? El cálculo de energía y la base de sodio cambian. El caller pasa
// product_type; "liquido"/"concentrado" se tratan como bebida para energía.
function isLiquid(productType?: string | null): boolean {
  const t = (productType ?? "").toLowerCase();
  return t === "liquido" || t === "concentrado";
}

// Porcentaje de energía aportado por una macro (g) sobre las kcal totales.
// Devuelve null si falta el dato o la energía es 0/desconocida.
function energyPct(grams: number | null, kcalPerG: number, totalKcal: number | null): number | null {
  if (grams === null || totalKcal === null || totalKcal <= 0) return null;
  return (grams * kcalPerG * 100) / totalKcal;
}

function computeOpsLike(
  n: NutritionPer100,
  liquid: boolean,
  ids: {
    azucares: string;
    grasasTotales?: string; // CL/NOM no tienen "grasas totales"; AR sí.
    grasasSaturadas: string;
    sodio: string;
    calorias: string;
    grasasTrans?: string; // MX/NOM tiene "grasas trans"; AR no.
  },
): string[] {
  const out: string[] = [];
  const kcal = num(n.calories);
  const sat = num(n.saturated_fats);
  const fat = num(n.fats);
  const trans = num(n.trans_fats);
  const sugars = num(n.sugars);
  const sodium = num(n.sodium);

  // Azúcares ≥ 10 % energía.
  const sugarPct = energyPct(sugars, KCAL_PER_G_CARB, kcal);
  if (sugarPct !== null && sugarPct >= OPS_SUGAR_ENERGY_PCT) out.push(ids.azucares);

  // Grasas totales ≥ 30 % energía (solo sistemas que lo tienen, p.ej. AR).
  if (ids.grasasTotales) {
    const fatPct = energyPct(fat, KCAL_PER_G_FAT, kcal);
    if (fatPct !== null && fatPct >= OPS_FAT_ENERGY_PCT) out.push(ids.grasasTotales);
  }

  // Grasas saturadas ≥ 10 % energía.
  const satPct = energyPct(sat, KCAL_PER_G_FAT, kcal);
  if (satPct !== null && satPct >= OPS_SATFAT_ENERGY_PCT) out.push(ids.grasasSaturadas);

  // Grasas trans ≥ 1 % energía (solo NOM-051).
  if (ids.grasasTrans) {
    const transPct = energyPct(trans, KCAL_PER_G_FAT, kcal);
    if (transPct !== null && transPct >= NOM_TRANSFAT_ENERGY_PCT) {
      out.push(ids.grasasTrans);
    }
  }

  // Sodio: ≥1 mg/kcal (relación OPS) O ≥300 mg/100 g en sólidos (atajo).
  if (sodium !== null) {
    const byRatio = kcal !== null && kcal > 0 && sodium / kcal >= OPS_SODIUM_MG_PER_KCAL;
    const byAbsolute = !liquid && sodium >= OPS_SODIUM_MG_SOLID;
    if (byRatio || byAbsolute) out.push(ids.sodio);
  }

  // Calorías: sólidos ≥275 kcal/100 g · líquidos ≥70 kcal/100 ml.
  if (kcal !== null) {
    const threshold = liquid ? OPS_ENERGY_KCAL_LIQUID : OPS_ENERGY_KCAL_SOLID;
    if (kcal >= threshold) out.push(ids.calorias);
  }

  return out;
}

// ── NOM-051 (México) — fase 3 ────────────────────────────────────────────────
// Fuente: NOM-051-SCFI/SSA1-2010 (modificación DOF 2020) + manual de etiquetado
// frontal. Equivalente al perfil OPS (México también lo adoptó). Diferencias
// concretas respecto de AR:
//   - Tiene sello propio de "grasas trans": ≥ 1 % del total de energía.
//   - NO tiene sello de "grasas totales" (solo saturadas y trans).
//   - Energía: ≥ 275 kcal / 100 g (sólidos). Bebidas con perfil propio.
//   - Azúcares libres ≥ 10 % energía; grasas saturadas ≥ 10 % energía;
//     sodio ≥ 1 mg/kcal o ≥ 300 mg/100 g.
const NOM_TRANSFAT_ENERGY_PCT = 1; // % energía

// ── Sellos "ALTO EN" (Chile) — Ley 20.606 ────────────────────────────────────
// Fuente: Ley 20.606 + Decreto 13/2015 (Reglamento Sanitario de los Alimentos,
// art. 120 bis). Umbrales de la ETAPA 3 (vigente desde 2019) para SÓLIDOS, por
// 100 g. Son ABSOLUTOS (no por % de energía), distinto de OPS:
//   - Energía:           ≥ 275 kcal / 100 g
//   - Azúcares totales:  ≥ 10 g / 100 g
//   - Grasas saturadas:  ≥ 4 g / 100 g
//   - Sodio:             ≥ 400 mg / 100 g
// (Para LÍQUIDOS la ley chilena usa otros umbrales por 100 ml. TODO-LEGAL: este
// cálculo aplica solo el set de SÓLIDOS pedido por el feature; para bebidas CL
// los umbrales son menores —energía 70 kcal, azúcares 5 g, grasas sat 3 g, sodio
// 100 mg por 100 ml— y deben cargarse en una revisión posterior con el sistema
// chileno modelando líquidos. Por ahora, conservador: se usa el set de sólidos.)
const CL_ENERGY_KCAL = 275; // kcal / 100 g
const CL_SUGARS_G = 10; // g / 100 g
const CL_SATFAT_G = 4; // g / 100 g
const CL_SODIUM_MG = 400; // mg / 100 g

function computeChile(n: NutritionPer100): string[] {
  const out: string[] = [];
  const kcal = num(n.calories);
  const sugars = num(n.sugars);
  const sat = num(n.saturated_fats);
  const sodium = num(n.sodium);

  if (kcal !== null && kcal >= CL_ENERGY_KCAL) out.push("alto_en_calorias");
  if (sugars !== null && sugars >= CL_SUGARS_G) out.push("alto_en_azucares");
  if (sat !== null && sat >= CL_SATFAT_G) out.push("alto_en_grasas_saturadas");
  if (sodium !== null && sodium >= CL_SODIUM_MG) out.push("alto_en_sodio");

  return out;
}

// ── Nutri-Score (UE) — algoritmo 2023 (versión simplificada) ─────────────────
// Fuente: "Update of the Nutri-Score algorithm" (Comité Científico, 2022/2023),
// para alimentos GENERALES (no bebidas, no grasas/aceites, no queso — esos tienen
// tablas propias). Cálculo de puntos negativos (N) y positivos (P); puntaje final
// FNS = N - P; luego FNS → letra A..E por cortes.
//
// SIMPLIFICACIONES DOCUMENTADAS (el feature pide "cálculo 2023 simplificado"):
//   1) Solo se implementa la categoría "general foods". Bebidas, grasas añadidas
//      y quesos usan escalas distintas; acá se aplica la general a todo. Para
//      esos casos el resultado es aproximado — TODO-LEGAL si se requiere exactitud.
//   2) Puntos negativos de FRUTAS/VERDURAS/LEGUMINOSAS (% fruit) NO se modelan:
//      no tenemos ese dato en la nutrición. Se asume 0 % → 0 puntos P por esa vía
//      (conservador: nunca mejora la nota artificialmente).
//   3) Sodio: la fórmula 2023 usa SAL (mg). Convertimos sal = sodio_mg × 2.5.
//   4) Proteínas: cap de 7 puntos cuando los N por azúcar+satfat+sodio son altos
//      se aplica con la regla general 2023 (si N(sin fibra) ≥ 11 las proteínas no
//      cuentan, salvo que el componente de carne roja sea 0 — que asumimos 0).
//
// Tablas de puntos (general foods, algoritmo 2023):
//   Energía (kJ/100g):   ≤335→0, ≤670→1, ≤1005→2, ≤1340→3, ≤1675→4, ≤2010→5,
//                        ≤2345→6, ≤2680→7, ≤3015→8, ≤3350→9, >3350→10.
//   Azúcares (g/100g):   ≤3.4→0, ≤6.8→1, ≤10→2, ≤14→3, ≤17→4, ≤20→5, ≤24→6,
//                        ≤27→7, ≤31→8, ≤34→9, ≤37→10, ≤41→11, ≤44→12,
//                        ≤48→13, ≤51→14, >51→15.
//   Grasas sat (g/100g): ≤1→0, ≤2→1, ≤3→2, ≤4→3, ≤5→4, ≤6→5, ≤7→6, ≤8→7,
//                        ≤9→8, ≤10→9, >10→10.
//   Sal (mg/100g):       ≤0.2*1000... (ver tabla en mg abajo).
//   Proteínas (g/100g):  ≤2.4→0, ≤4.8→1, ≤7.2→2, ≤9.6→3, ≤12→4, ≤14→5, ≤17→6, >17→7.
//   Fibra (g/100g):      ≤3→0, ≤4.1→1, ≤5.2→2, ≤6.3→3, ≤7.4→4, >7.4→5.
const KJ_PER_KCAL = 4.184;

// Devuelve el índice (puntos) del primer corte que el valor NO supera.
// thresholds: límites superiores inclusivos de cada banda; el último valor por
// encima del array recibe thresholds.length puntos.
function bandPoints(value: number, thresholds: number[]): number {
  for (let i = 0; i < thresholds.length; i++) {
    if (value <= thresholds[i]!) return i;
  }
  return thresholds.length;
}

// Cortes (límite superior inclusivo) → puntos = índice.
const NS_ENERGY_KJ = [335, 670, 1005, 1340, 1675, 2010, 2345, 2680, 3015, 3350];
const NS_SUGARS_G = [3.4, 6.8, 10, 14, 17, 20, 24, 27, 31, 34, 37, 41, 44, 48, 51];
const NS_SATFAT_G = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
// Sal en mg/100 g (algoritmo 2023): cortes a 0.2,0.4,...,4.0 g → en mg.
const NS_SALT_MG = [
  200, 400, 600, 800, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2400, 2600,
  2800, 3000, 3200, 3400, 3600, 3800, 4000,
];
const NS_PROTEIN_G = [2.4, 4.8, 7.2, 9.6, 12, 14, 17];
const NS_FIBER_G = [3, 4.1, 5.2, 6.3, 7.4];

/**
 * Nutri-Score 2023 (general foods, simplificado). Devuelve grade "A".."E" o null
 * si faltan datos mínimos para un cálculo honesto (energía + azúcares + grasas
 * saturadas + sodio). Proteínas y fibra ausentes cuentan como 0 puntos P
 * (conservador: no mejora la nota).
 */
export function computeNutriScore(n: NutritionPer100): string | null {
  const kcal = num(n.calories);
  const sugars = num(n.sugars);
  const sat = num(n.saturated_fats);
  const sodium = num(n.sodium);
  // Mínimos para un cálculo legítimo: sin energía/azúcar/satfat/sodio no se calcula.
  if (kcal === null || sugars === null || sat === null || sodium === null) {
    return null;
  }

  const kj = kcal * KJ_PER_KCAL;
  const saltMg = sodium * 2.5; // sal = sodio × 2.5

  const nEnergy = bandPoints(kj, NS_ENERGY_KJ);
  const nSugar = bandPoints(sugars, NS_SUGARS_G);
  const nSat = bandPoints(sat, NS_SATFAT_G);
  const nSalt = bandPoints(saltMg, NS_SALT_MG);
  const N = nEnergy + nSugar + nSat + nSalt;

  const protein = num(n.proteins) ?? 0;
  const fiber = num(n.fiber) ?? 0;
  const pProtein = bandPoints(protein, NS_PROTEIN_G);
  const pFiber = bandPoints(fiber, NS_FIBER_G);

  // Regla 2023: si N ≥ 11, las proteínas no se cuentan (no compensan), SALVO que
  // el aporte de fruta/verdura sea alto (no modelado → asumimos no). La fibra
  // siempre cuenta. Simplificación documentada (#2).
  const P = N >= 11 ? pFiber : pProtein + pFiber;

  const fns = N - P;

  // Cortes a letra (general foods, 2023): A ≤ 0, B 1..2, C 3..10, D 11..18, E ≥ 19.
  if (fns <= 0) return "A";
  if (fns <= 2) return "B";
  if (fns <= 10) return "C";
  if (fns <= 18) return "D";
  return "E";
}

// ── Flags de ingredientes (edulcorantes / cafeína) ───────────────────────────
// Mapea los flags de fórmula a los ids de sello de cada sistema que los define.
function appendIngredientFlags(
  systemId: LabelSystemId,
  flags: SealFlags | undefined,
  out: string[],
): void {
  if (!flags) return;
  // AR (octógonos) y MX (NOM-051) tienen leyendas de edulcorantes y cafeína.
  if (systemId === "ar_octogonos" || systemId === "mx_nom051") {
    if (flags.contains_sweeteners) out.push("contiene_edulcorantes");
    if (flags.contains_caffeine) out.push("contiene_cafeina");
  }
  // CL / BR / EU / US no modelan estas leyendas como sello frontal en este v1.
}

/**
 * computeSeals — núcleo determinístico. Dado el sistema del país, la nutrición
 * por 100 g/ml y los flags de fórmula, devuelve los sellos que la ley dispara.
 *
 * - multi-seal (AR/MX/CL/BR): { kind:"multi-seal", values:[...ids] }
 * - grade (Nutri-Score EU): { kind:"grade", grade:"A".."E" } (o "" si no calcula)
 * - none (US FDA): { kind:"multi-seal", values:[] } (sin advertencias frontales)
 *
 * `productType` distingue sólido de líquido para los umbrales de energía/sodio
 * (perfil OPS). Si se omite, se asume sólido (caso más común y más estricto en
 * energía).
 */
export function computeSeals(
  systemId: LabelSystemId,
  nutrition: NutritionPer100,
  flags?: SealFlags,
  productType?: string | null,
): SealComputation {
  const liquid = isLiquid(productType);

  switch (systemId) {
    case "ar_octogonos": {
      const values = computeOpsLike(nutrition, liquid, {
        azucares: "exceso_azucares",
        grasasTotales: "exceso_grasas_totales",
        grasasSaturadas: "exceso_grasas_saturadas",
        sodio: "exceso_sodio",
        calorias: "exceso_calorias",
      });
      appendIngredientFlags(systemId, flags, values);
      return { kind: "multi-seal", values };
    }
    case "mx_nom051": {
      const values = computeOpsLike(nutrition, liquid, {
        azucares: "exceso_azucares",
        // NOM-051 no tiene "grasas totales".
        grasasSaturadas: "exceso_grasas_saturadas",
        grasasTrans: "exceso_grasas_trans",
        sodio: "exceso_sodio",
        calorias: "exceso_calorias",
      });
      appendIngredientFlags(systemId, flags, values);
      return { kind: "multi-seal", values };
    }
    case "cl_sellos": {
      return { kind: "multi-seal", values: computeChile(nutrition) };
    }
    case "br_anvisa": {
      // ANVISA RDC 429/2020 (lupa). Umbrales para SÓLIDOS por 100 g:
      //   - Azúcar añadido:   ≥ 15 g / 100 g
      //   - Grasa saturada:   ≥ 6 g / 100 g
      //   - Sodio:            ≥ 600 mg / 100 g
      // TODO-LEGAL: "azúcar añadido" requiere distinguir azúcar agregado del
      // total; acá usamos `sugars` (total) como proxy conservador. Para bebidas
      // (por 100 ml) los cortes son menores y no se modelan en este v1.
      const out: string[] = [];
      const sugars = num(nutrition.sugars);
      const sat = num(nutrition.saturated_fats);
      const sodium = num(nutrition.sodium);
      if (sugars !== null && sugars >= 15) out.push("alto_em_acucar_adicionado");
      if (sat !== null && sat >= 6) out.push("alto_em_gordura_saturada");
      if (sodium !== null && sodium >= 600) out.push("alto_em_sodio");
      return { kind: "multi-seal", values: out };
    }
    case "eu_nutriscore": {
      const grade = computeNutriScore(nutrition);
      return { kind: "grade", grade: grade ?? "" };
    }
    case "us_fda": {
      // FDA: panel Nutrition Facts, sin sellos frontales de advertencia.
      return { kind: "multi-seal", values: [] };
    }
    default:
      return { kind: "multi-seal", values: [] };
  }
}

// ── Cobertura de datos: ¿qué falta para calcular sellos de este sistema? ──────
// Devuelve los nombres legibles (es) de los campos de nutrición necesarios que
// el producto NO tiene cargados. La UI lo usa para el mensaje "faltan: ...".
const FIELD_LABELS: Record<keyof NutritionPer100, string> = {
  calories: "calorías",
  proteins: "proteínas",
  fats: "grasas totales",
  carbs: "hidratos",
  sodium: "sodio",
  saturated_fats: "grasas saturadas",
  trans_fats: "grasas trans",
  sugars: "azúcares",
  fiber: "fibra",
  salt: "sal",
};

// Campos requeridos por sistema para un cálculo honesto.
const REQUIRED_FIELDS: Record<LabelSystemId, (keyof NutritionPer100)[]> = {
  ar_octogonos: ["calories", "sugars", "fats", "saturated_fats", "sodium"],
  mx_nom051: ["calories", "sugars", "saturated_fats", "trans_fats", "sodium"],
  cl_sellos: ["calories", "sugars", "saturated_fats", "sodium"],
  br_anvisa: ["sugars", "saturated_fats", "sodium"],
  eu_nutriscore: ["calories", "sugars", "saturated_fats", "sodium"],
  us_fda: [],
};

/** Campos de nutrición faltantes para calcular los sellos del sistema dado. */
export function missingFieldsForSystem(
  systemId: LabelSystemId,
  nutrition: NutritionPer100,
): string[] {
  const required = REQUIRED_FIELDS[systemId] ?? [];
  return required
    .filter((f) => num(nutrition[f]) === null)
    .map((f) => FIELD_LABELS[f]);
}
