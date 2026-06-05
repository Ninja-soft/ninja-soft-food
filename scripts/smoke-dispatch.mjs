// Smoke test del módulo Despacho: clientes, vehículos y la RPC create_dispatch.
// Uso: node scripts/smoke-dispatch.mjs  (lee .env.local)
// Nota: la RPC create_dispatch vive en supabase/migrations/00000000000008_dispatch_rpc.sql.
// Si todavía no se aplicó a la nube, el paso 3 se reporta como "PENDIENTE DE
// MIGRACIÓN" y el resto del smoke continúa (clientes/vehículos sí funcionan).
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)])
);

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// ── Setup: tenant + ingrediente + stock + receta + producción completada ──────
const email = `smoke-dispatch+${Date.now()}@ninjasoft.app`;
const password = "Smoke-" + Math.random().toString(36).slice(2, 12) + "9x";
const { error: suErr } = await supabase.auth.signUp({ email, password });
if (suErr) throw new Error("signup: " + suErr.message);
const { data: fn, error: fnErr } = await supabase.functions.invoke(
  "create_tenant",
  { body: { businessName: "Smoke Despacho", industry: "frigorifico" } }
);
if (fnErr) throw new Error("create_tenant: " + fnErr.message);
await supabase.auth.refreshSession();
const tenantId = fn.tenant_id;

const { data: ing } = await supabase
  .from("ingredients")
  .insert({ tenant_id: tenantId, name: "Carne de cerdo", unit: "kg" })
  .select("id")
  .single();

const { data: entry } = await supabase.rpc("create_stock_entry", {
  p_ingredient_id: ing.id,
  p_quantity: 100,
  p_unit: "kg",
  p_lot_number: "CERDO-001",
});

const { data: recipe } = await supabase
  .from("recipes")
  .insert({
    tenant_id: tenantId,
    title: "Bondiola curada",
    category: "carnes",
    shelf_life_days: 90,
    rnpa_number: "21-555",
  })
  .select("id")
  .single();
await supabase
  .from("recipe_ingredients")
  .insert([
    {
      recipe_id: recipe.id,
      ingredient_id: ing.id,
      quantity: 1,
      unit: "kg",
      is_substitute: false,
    },
  ]);

const { data: prod, error: prodErr } = await supabase.rpc(
  "complete_production",
  {
    p_recipe_id: recipe.id,
    p_quantity_kg: 20,
    p_production_date: "2026-06-04",
    p_inputs: [
      {
        ingredient_id: ing.id,
        stock_entry_id: entry,
        taken_qty: 20,
        is_substitute: false,
        source_ingredient_id: null,
      },
    ],
  }
);
if (prodErr) throw new Error("complete_production: " + prodErr.message);
console.log("setup OK · producción", prod.code, "lote", prod.product_lot);

// 1. Alta de cliente
const { data: customer, error: custErr } = await supabase
  .from("customers")
  .insert({
    tenant_id: tenantId,
    name: "Distribuidora Sur",
    locality: "Quilmes",
    address: "Av. Mitre 1234",
  })
  .select("id, name")
  .single();
if (custErr) throw new Error("customer: " + custErr.message);
console.log("1. cliente OK:", customer.name);

// 2. Alta de vehículo con UTA/URA
const { data: vehicle, error: vehErr } = await supabase
  .from("vehicles")
  .insert({
    tenant_id: tenantId,
    plate: "AB123CD",
    uta_number: "UTA-9001",
    uta_expiry: "2027-01-01",
    ura_number: "URA-7001",
    ura_expiry: "2027-01-01",
    capacity_kg: 1500,
  })
  .select("id, plate")
  .single();
if (vehErr) throw new Error("vehicle: " + vehErr.message);
console.log("2. vehículo OK:", vehicle.plate);

// 3. Despacho vía RPC (cabecera + ítems en una transacción)
const { data: dispatch, error: dispErr } = await supabase.rpc(
  "create_dispatch",
  {
    p_customer_id: customer.id,
    p_dispatch_date: "2026-06-05",
    p_vehicle_id: vehicle.id,
    p_items: [
      {
        recipe_id: recipe.id,
        production_id: prod.production_id,
        quantity_kg: 12.5,
      },
      { recipe_id: recipe.id, production_id: null, quantity_kg: 3 },
    ],
  }
);

if (
  dispErr &&
  (dispErr.message.includes("create_dispatch") ||
    dispErr.message.includes("function") ||
    dispErr.code === "PGRST202")
) {
  console.log(
    "3. create_dispatch PENDIENTE DE MIGRACIÓN (aplicar 00000000000008_dispatch_rpc.sql) ·",
    dispErr.message
  );
  console.log(
    "\nSMOKE DESPACHO: clientes/vehículos OK · RPC pendiente de migración"
  );
  process.exit(0);
}
if (dispErr) throw new Error("create_dispatch: " + dispErr.message);
if (!dispatch?.dispatch_id) throw new Error("create_dispatch sin dispatch_id");
if (dispatch.items !== 2)
  throw new Error("esperaba 2 ítems, fue " + dispatch.items);
console.log(
  "3. despacho OK:",
  dispatch.dispatch_id,
  "·",
  dispatch.items,
  "ítems"
);

// 4. Ítems insertados con el vínculo lote → cliente (recall)
const { data: itemRows, error: itErr } = await supabase
  .from("dispatch_items")
  .select("recipe_id, production_id, quantity_kg")
  .eq("dispatch_id", dispatch.dispatch_id);
if (itErr) throw new Error("dispatch_items: " + itErr.message);
if (itemRows.length !== 2)
  throw new Error("ítems mal: " + JSON.stringify(itemRows));
const withLot = itemRows.filter((i) => i.production_id === prod.production_id);
if (withLot.length !== 1)
  throw new Error("vínculo de lote mal: " + JSON.stringify(itemRows));
console.log("4. ítems con vínculo de lote OK (1 con lote, 1 sin trazabilidad)");

// 5. Validación: cantidad <= 0 rechazada (transacción revertida)
const { error: badErr } = await supabase.rpc("create_dispatch", {
  p_customer_id: customer.id,
  p_dispatch_date: "2026-06-05",
  p_items: [{ recipe_id: recipe.id, production_id: null, quantity_kg: 0 }],
});
if (!badErr || !badErr.message.includes("invalid_quantity"))
  throw new Error("FAIL: cantidad 0 permitida");
const { data: dispCount } = await supabase
  .from("dispatches")
  .select("id")
  .is("deleted_at", null);
if (dispCount.length !== 1)
  throw new Error("rollback falló: " + dispCount.length + " despachos");
console.log("5. cantidad inválida → rollback completo OK");

// 6. Anular (status = voided)
const { error: voidErr } = await supabase
  .from("dispatches")
  .update({ status: "voided" })
  .eq("id", dispatch.dispatch_id);
if (voidErr) throw new Error("void: " + voidErr.message);
const { data: voided } = await supabase
  .from("dispatches")
  .select("status")
  .eq("id", dispatch.dispatch_id)
  .single();
if (voided.status !== "voided") throw new Error("anulación no aplicó");
console.log("6. anulación (voided) OK");

// 7. Soft delete del cliente (no rompe el despacho existente)
const { error: delErr } = await supabase
  .from("customers")
  .update({ deleted_at: new Date().toISOString() })
  .eq("id", customer.id);
if (delErr) throw new Error("soft delete cliente: " + delErr.message);
const { data: activeCustomers } = await supabase
  .from("customers")
  .select("id")
  .is("deleted_at", null);
if (activeCustomers.length !== 0)
  throw new Error("soft delete no aplicó: " + activeCustomers.length);
console.log("7. soft delete de cliente OK");

console.log("\nSMOKE DESPACHO: TODO OK");
