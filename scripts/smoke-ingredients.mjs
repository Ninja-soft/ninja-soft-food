// Smoke test del módulo Ingredientes: familias + ingredientes CRUD bajo RLS.
// Uso: node scripts/smoke-ingredients.mjs  (lee .env.local)
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

// Setup: usuario + tenant nuevos
const email = `smoke-ing+${Date.now()}@ninjasoft.app`;
const password = "Smoke-" + Math.random().toString(36).slice(2, 12) + "9x";
const { error: suErr } = await supabase.auth.signUp({ email, password });
if (suErr) throw new Error("signup: " + suErr.message);
const { data: fn, error: fnErr } = await supabase.functions.invoke(
  "create_tenant",
  { body: { businessName: "Smoke Ingredientes", industry: "panaderia" } },
);
if (fnErr) throw new Error("create_tenant: " + fnErr.message);
await supabase.auth.refreshSession();
const tenantId = fn.tenant_id;
console.log("setup OK:", tenantId);

// 1. Crear familia
const { data: fam, error: famErr } = await supabase
  .from("ingredient_families")
  .insert({ tenant_id: tenantId, name: "Harinas" })
  .select("id, name")
  .single();
if (famErr) throw new Error("familia: " + famErr.message);
console.log("1. familia OK:", fam.name);

// 2. Crear ingrediente
const { data: ing, error: ingErr } = await supabase
  .from("ingredients")
  .insert({
    tenant_id: tenantId,
    family_id: fam.id,
    name: "Harina 000",
    unit: "kg",
    is_perishable: false,
    default_shelf_days: 180,
  })
  .select("id, name")
  .single();
if (ingErr) throw new Error("ingrediente: " + ingErr.message);
console.log("2. ingrediente OK:", ing.name);

// 3. Listar con join de familia
const { data: list, error: listErr } = await supabase
  .from("ingredients")
  .select("name, unit, family:ingredient_families(name)")
  .is("deleted_at", null);
if (listErr) throw new Error("list: " + listErr.message);
if (list.length !== 1 || list[0].family?.name !== "Harinas")
  throw new Error("list shape inesperada: " + JSON.stringify(list));
console.log("3. listado + join OK");

// 4. Unidades globales visibles
const { data: units, error: unitsErr } = await supabase
  .from("measure_units")
  .select("abbr");
if (unitsErr) throw new Error("units: " + unitsErr.message);
if (!units.some((u) => u.abbr === "kg"))
  throw new Error("faltan unidades globales");
console.log("4. unidades globales OK (" + units.length + ")");

// 5. Soft delete
const { error: delErr } = await supabase
  .from("ingredients")
  .update({ deleted_at: new Date().toISOString() })
  .eq("id", ing.id);
if (delErr) throw new Error("delete: " + delErr.message);
const { data: after } = await supabase
  .from("ingredients")
  .select("id")
  .is("deleted_at", null);
if ((after ?? []).length !== 0) throw new Error("soft delete no filtró");
console.log("5. soft delete OK");

// 6. RLS cruzado: no puedo insertar con tenant_id ajeno
const { error: crossErr } = await supabase
  .from("ingredients")
  .insert({
    tenant_id: "00000000-0000-0000-0000-000000000001",
    name: "Hack",
    unit: "kg",
  });
if (!crossErr) throw new Error("RLS FAIL: insert cruzado permitido");
console.log("6. RLS write cruzado bloqueado OK");

console.log("\nSMOKE INGREDIENTES: TODO OK");
