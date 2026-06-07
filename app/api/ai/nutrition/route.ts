import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { tenantHasAI } from "@/lib/ai/access";
import { getActiveProvider } from "@/lib/ai/config";
import { logAIUsage } from "@/lib/ai/usage";
import { AIError } from "@/lib/ai/types";
import { getOperatingProfileServer } from "@/modules/tenant-profile/server";
import {
  buildNutritionPrompt,
  type AINutritionProposal,
  type FormulaLine,
} from "@/modules/recipes/ai";

// =============================================================================
// POST /api/ai/nutrition — propone la tabla nutricional de una receta con IA.
//
// La IA PROPONE, el humano CONFIRMA: este endpoint NO guarda nada. Devuelve la
// propuesta por 100 g/ml y la UI la vuelca en el form (editable).
//
// Guardas, en orden:
//   1) sesión válida (401 si no),
//   2) tenant del claim (sin tenant → 401),
//   3) tenantHasAI(tenant) (403 { upgrade:true } si el plan no incluye IA),
//   4) provider activo configurado en /internal (503 si no hay key de plataforma).
//
// Body: { recipeId: string }. La receta se lee con RLS (createClient server):
// si no es del tenant, no se ve. logAIUsage es best-effort (no rompe el flujo).
// =============================================================================

export const runtime = "nodejs"; // service_role (usage) + crypto: nunca edge.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const tenantId = user.app_metadata?.tenant_id;
  if (typeof tenantId !== "string" || !tenantId) {
    return NextResponse.json({ error: "no_tenant" }, { status: 401 });
  }

  // Gating de IA por plan/add-on/flag. 403 con upgrade para que la UI ofrezca el add-on.
  const hasAI = await tenantHasAI(tenantId);
  if (!hasAI) {
    return NextResponse.json(
      {
        error: "La generación con IA está disponible con el add-on de IA.",
        upgrade: true,
      },
      { status: 403 },
    );
  }

  let body: { recipeId?: string };
  try {
    body = (await req.json()) as { recipeId?: string };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const recipeId = String(body.recipeId ?? "").trim();
  if (!recipeId) {
    return NextResponse.json({ error: "missing_recipe" }, { status: 400 });
  }

  // Receta + fórmula con nombres de ingredientes. RLS scopea al tenant de la sesión.
  const { data: recipe } = await supabase
    .from("recipes")
    .select(
      `id, title, product_type,
       recipe_ingredients(quantity, unit,
         ingredient:ingredients!recipe_ingredients_ingredient_id_fkey(name))`,
    )
    .eq("id", recipeId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!recipe) {
    return NextResponse.json({ error: "recipe_not_found" }, { status: 404 });
  }

  type RIRow = {
    quantity: number;
    unit: string;
    ingredient: { name: string } | { name: string }[] | null;
  };
  const rows = ((recipe as { recipe_ingredients?: RIRow[] }).recipe_ingredients ??
    []) as RIRow[];
  if (rows.length === 0) {
    return NextResponse.json({ error: "empty_formula" }, { status: 422 });
  }

  const total = rows.reduce((acc, r) => acc + (Number(r.quantity) || 0), 0);
  const lines: FormulaLine[] = rows.map((r) => {
    const ing = Array.isArray(r.ingredient) ? r.ingredient[0] : r.ingredient;
    const qty = Number(r.quantity) || 0;
    return {
      name: ing?.name ?? "Ingrediente",
      quantity: qty,
      unit: r.unit ?? "kg",
      percent: total > 0 ? (qty * 100) / total : 0,
    };
  });

  // País / sistema de rotulado para el contexto del prompt (formato local).
  const profile = await getOperatingProfileServer();

  const provider = await getActiveProvider();
  if (!provider) {
    // La key de plataforma no está configurada en /internal.
    return NextResponse.json(
      { error: "El servicio de IA no está configurado. Contactá a soporte." },
      { status: 503 },
    );
  }

  const { system, prompt, schema } = buildNutritionPrompt({
    recipeTitle: (recipe as { title: string }).title,
    productType: (recipe as { product_type: string }).product_type,
    country: profile.country,
    labelSystemName: profile.labelSystem?.name ?? null,
    lines,
  });

  let raw: unknown;
  try {
    raw = await provider.generateJson({ system, prompt, schema, maxTokens: 1024 });
  } catch (e) {
    const status = e instanceof AIError ? e.status || 502 : 502;
    return NextResponse.json(
      { error: "La generación con IA falló. Probá de nuevo en unos segundos." },
      { status: status >= 400 && status < 600 ? 502 : 502 },
    );
  }

  // Metering best-effort (la respuesta cruda no trae tokens fiables sin parseo
  // específico por provider; registramos la llamada igual para control de costo).
  void logAIUsage({
    tenantId,
    feature: "nutrition_table",
    provider: provider.providerId,
    model: "",
  });

  const proposal = sanitizeProposal(raw);
  if (!proposal) {
    return NextResponse.json(
      { error: "La IA devolvió un resultado inválido. Probá de nuevo." },
      { status: 502 },
    );
  }

  return NextResponse.json({ proposal });
}

// Revalida la forma de negocio: solo números no negativos finitos; descarta el
// resto. Devuelve null si no hay ni un campo válido (respuesta inservible).
function sanitizeProposal(raw: unknown): AINutritionProposal | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const fields: (keyof AINutritionProposal)[] = [
    "calories",
    "proteins",
    "fats",
    "carbs",
    "sodium",
    "saturated_fats",
    "trans_fats",
    "sugars",
    "fiber",
  ];
  const out: AINutritionProposal = {};
  let any = false;
  for (const f of fields) {
    const v = r[f];
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) {
      out[f] = v;
      any = true;
    }
  }
  return any ? out : null;
}
