// Smoke test del módulo Producción: RPC atómica completa de punta a punta.
// Uso: node scripts/smoke-production.mjs  (lee .env.local)
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

// Setup completo: tenant + ingredientes + stock + receta
const email = `smoke-prod+${Date.now()}@ninjasoft.app`;
await supabase.auth.signUp({
  email,
  password: "Smoke-" + Math.random().toString(36).slice(2, 12) + "9x",
});
const { data: fn } = await supabase.functions.invoke("create_tenant", {
  body: { businessName: "Smoke Producción", industry: "frigorifico" },
});
await supabase.auth.refreshSession();
const tenantId = fn.tenant_id;

const mkIng = async (name, unit) =>
  (
    await supabase
      .from("ingredients")
      .insert({ tenant_id: tenantId, name, unit })
      .select("id")
      .single()
  ).data.id;
const cerdo = await mkIng("Carne de cerdo", "kg");
const sal = await mkIng("Sal fina", "gr");

const { data: entryCerdo } = await supabase.rpc("create_stock_entry", {
  p_ingredient_id: cerdo,
  p_quantity: 50,
  p_unit: "kg",
  p_lot_number: "CERDO-001",
  p_expiry_date: "2026-06-15",
});
const { data: entrySal } = await supabase.rpc("create_stock_entry", {
  p_ingredient_id: sal,
  p_quantity: 1000,
  p_unit: "gr",
  p_lot_number: "SAL-001",
});

const { data: recipe } = await supabase
  .from("recipes")
  .insert({
    tenant_id: tenantId,
    title: "Bondiola curada",
    category: "carnes",
    shelf_life_days: 90,
    aging_days: 45,
    packaging_delay_type: "aging",
    rnpa_number: "21-555",
  })
  .select("id")
  .single();
await supabase.from("recipe_ingredients").insert([
  { recipe_id: recipe.id, ingredient_id: cerdo, quantity: 1, unit: "kg", is_substitute: false },
  { recipe_id: recipe.id, ingredient_id: sal, quantity: 25, unit: "gr", is_substitute: false },
]);
console.log("setup OK");

// 1. Completar producción de 10 kg (consume 10 kg cerdo + 250 gr sal)
const { data: result, error: rpcErr } = await supabase.rpc(
  "complete_production",
  {
    p_recipe_id: recipe.id,
    p_quantity_kg: 10,
    p_production_date: "2026-06-04",
    p_inputs: [
      { ingredient_id: cerdo, stock_entry_id: entryCerdo, taken_qty: 10, is_substitute: false, source_ingredient_id: null },
      { ingredient_id: sal, stock_entry_id: entrySal, taken_qty: 250, is_substitute: false, source_ingredient_id: null },
    ],
  },
);
if (rpcErr) throw new Error("complete_production: " + rpcErr.message);
if (!result.code.startsWith("PROD-")) throw new Error("código raro: " + result.code);
console.log("1. producción OK:", result.code, "lote", result.product_lot);

// 2. Vencimiento = producción + aging(45) + vida útil(90)
if (result.expiry_date !== "2026-10-17")
  throw new Error("vencimiento esperado 2026-10-17 (4/6 +45 +90), fue " + result.expiry_date);
console.log("2. vencimiento con aging OK:", result.expiry_date);

// 3. Stock descontado
const { data: ce } = await supabase
  .from("stock_entries")
  .select("remaining_quantity")
  .eq("id", entryCerdo)
  .single();
if (Number(ce.remaining_quantity) !== 40)
  throw new Error("cerdo restante esperado 40, fue " + ce.remaining_quantity);
console.log("3. stock descontado OK");

// 4. Ledger con movimientos negativos de producción
const { data: movs } = await supabase
  .from("stock_movements")
  .select("type, quantity")
  .eq("production_id", result.production_id);
if (movs?.length !== 2 || !movs.every((m) => m.type === "production" && m.quantity < 0))
  throw new Error("ledger producción mal: " + JSON.stringify(movs));
console.log("4. ledger producción OK");

// 5. Traza pública legible SIN autenticación
const anonClient = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);
const { data: trace, error: traceErr } = await anonClient
  .from("public_traces")
  .select("payload")
  .eq("slug", result.trace_slug)
  .single();
if (traceErr) throw new Error("traza anónima: " + traceErr.message);
if (
  trace.payload.product_lot !== result.product_lot ||
  trace.payload.inputs.length !== 2 ||
  trace.payload.inputs.some((i) => !i.lot)
)
  throw new Error("payload de traza mal: " + JSON.stringify(trace.payload));
console.log("5. traza pública anónima OK (" + trace.payload.inputs.length + " orígenes)");

// 6. Overdraw rechazado y SIN producción fantasma (transacción completa revertida)
const { error: overErr } = await supabase.rpc("complete_production", {
  p_recipe_id: recipe.id,
  p_quantity_kg: 100,
  p_production_date: "2026-06-04",
  p_inputs: [
    { ingredient_id: cerdo, stock_entry_id: entryCerdo, taken_qty: 100, is_substitute: false, source_ingredient_id: null },
  ],
});
if (!overErr || !overErr.message.includes("insufficient_stock"))
  throw new Error("FAIL: overdraw permitido");
const { data: prods } = await supabase.from("productions").select("id");
if (prods?.length !== 1)
  throw new Error("rollback falló: " + prods?.length + " producciones");
const { data: ce2 } = await supabase
  .from("stock_entries")
  .select("remaining_quantity")
  .eq("id", entryCerdo)
  .single();
if (Number(ce2.remaining_quantity) !== 40)
  throw new Error("rollback de stock falló: " + ce2.remaining_quantity);
console.log("6. overdraw → rollback completo OK");

// 7. Secuencia de códigos por tenant
const { data: r2 } = await supabase.rpc("complete_production", {
  p_recipe_id: recipe.id,
  p_quantity_kg: 1,
  p_production_date: "2026-06-04",
  p_inputs: [
    { ingredient_id: cerdo, stock_entry_id: entryCerdo, taken_qty: 1, is_substitute: false, source_ingredient_id: null },
  ],
});
if (r2.code !== "PROD-00002")
  throw new Error("secuencia esperada PROD-00002, fue " + r2.code);
console.log("7. secuencia por tenant OK:", r2.code);

console.log("\nSMOKE PRODUCCIÓN: TODO OK");
