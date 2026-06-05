// Smoke test del módulo Recetas: grupos + receta con fórmula y sustitutos.
// Uso: node scripts/smoke-recipes.mjs  (lee .env.local)
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

// Setup
const email = `smoke-rec+${Date.now()}@ninjasoft.app`;
const password = "Smoke-" + Math.random().toString(36).slice(2, 12) + "9x";
await supabase.auth.signUp({ email, password });
const { data: fn, error: fnErr } = await supabase.functions.invoke(
  "create_tenant",
  { body: { businessName: "Smoke Recetas", industry: "frigorifico" } },
);
if (fnErr) throw new Error("create_tenant: " + fnErr.message);
await supabase.auth.refreshSession();
const tenantId = fn.tenant_id;

const ing = async (name, unit = "kg") => {
  const { data, error } = await supabase
    .from("ingredients")
    .insert({ tenant_id: tenantId, name, unit })
    .select("id")
    .single();
  if (error) throw new Error("ing: " + error.message);
  return data.id;
};
const cerdo = await ing("Carne de cerdo");
const sal = await ing("Sal fina", "gr");
const salGruesa = await ing("Sal gruesa", "gr");
console.log("setup OK");

// 1. Grupo
const { data: group, error: gErr } = await supabase
  .from("recipe_groups")
  .insert({ tenant_id: tenantId, name: "Embutidos" })
  .select("id")
  .single();
if (gErr) throw new Error("grupo: " + gErr.message);
console.log("1. grupo OK");

// 2. Receta completa (RNPA + octógonos + nutrición + aging)
const { data: recipe, error: rErr } = await supabase
  .from("recipes")
  .insert({
    tenant_id: tenantId,
    group_id: group.id,
    title: "Bondiola curada",
    commercial_name: "Bondiola Premium",
    category: "carnes",
    product_type: "solido",
    shelf_life_days: 90,
    aging_days: 45,
    packaging_delay_type: "aging",
    rnpa_number: "21-098765",
    rnpa_expiry: "2026-08-01",
    front_labels: ["exceso_sodio", "exceso_grasas_totales"],
    nutrition: { calories: 320, proteins: 28, fats: 22, carbs: 1, sodium: 1800 },
  })
  .select("id")
  .single();
if (rErr) throw new Error("receta: " + rErr.message);
console.log("2. receta OK");

// 3. Fórmula con sustituto
const { error: riErr } = await supabase.from("recipe_ingredients").insert([
  { recipe_id: recipe.id, ingredient_id: cerdo, quantity: 1, unit: "kg", is_substitute: false },
  { recipe_id: recipe.id, ingredient_id: sal, quantity: 25, unit: "gr", is_substitute: false },
  { recipe_id: recipe.id, ingredient_id: salGruesa, quantity: 30, unit: "gr", is_substitute: true, source_ingredient_id: sal },
]);
if (riErr) throw new Error("fórmula: " + riErr.message);
console.log("3. fórmula con sustituto OK");

// 4. Lectura con joins anidados (shape de la UI)
const { data: full, error: fullErr } = await supabase
  .from("recipes")
  .select(
    "title, rnpa_number, front_labels, group:recipe_groups(name), recipe_ingredients(quantity, is_substitute, ingredient:ingredients!recipe_ingredients_ingredient_id_fkey(name))",
  )
  .eq("id", recipe.id)
  .single();
if (fullErr) throw new Error("read: " + fullErr.message);
if (
  full.group?.name !== "Embutidos" ||
  full.recipe_ingredients.length !== 3 ||
  full.front_labels.length !== 2
)
  throw new Error("shape inesperada: " + JSON.stringify(full));
console.log("4. lectura anidada OK");

// 5. Reemplazo de fórmula (patrón update de la UI)
await supabase.from("recipe_ingredients").delete().eq("recipe_id", recipe.id);
const { error: ri2Err } = await supabase.from("recipe_ingredients").insert([
  { recipe_id: recipe.id, ingredient_id: cerdo, quantity: 1.2, unit: "kg", is_substitute: false },
]);
if (ri2Err) throw new Error("replace: " + ri2Err.message);
const { data: after } = await supabase
  .from("recipe_ingredients")
  .select("id")
  .eq("recipe_id", recipe.id);
if (after?.length !== 1) throw new Error("replace dejó " + after?.length);
console.log("5. reemplazo de fórmula OK");

console.log("\nSMOKE RECETAS: TODO OK");
