// Smoke test del módulo Recall / Trazabilidad: cadena completa de punta a punta
// supplier → stock_entry (lote MP) → production_input → production (lote PT) →
// dispatch_item → dispatch → customer, y verificación de las queries de traza.
//
// Uso: node scripts/smoke-recall.mjs  (lee .env.local)
//
// Nota: la RPC create_dispatch NO está aplicada en la nube todavía
// (supabase/migrations/00000000000008_dispatch_rpc.sql pendiente). Por eso este
// smoke crea el despacho + ítem con INSERT directo del tenant (las políticas RLS
// permiten INSERT scoped por tenant_id).
//
// Las consultas de los pasos 3 y 4 son RÉPLICA de modules/trace/api.ts
// (traceForward / traceBackward). Si cambia el módulo, actualizar acá también.
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

// ── Setup: tenant + proveedor + ingrediente + stock + receta + producción ─────
const email = `smoke-recall+${Date.now()}@ninjasoft.app`;
const password = "Smoke-" + Math.random().toString(36).slice(2, 12) + "9x";
const { error: suErr } = await supabase.auth.signUp({ email, password });
if (suErr) throw new Error("signup: " + suErr.message);
const { data: fn, error: fnErr } = await supabase.functions.invoke(
  "create_tenant",
  { body: { businessName: "Smoke Recall", industry: "frigorifico" } },
);
if (fnErr) throw new Error("create_tenant: " + fnErr.message);
await supabase.auth.refreshSession();
const tenantId = fn.tenant_id;

const { data: supplier, error: supErr } = await supabase
  .from("suppliers")
  .insert({
    tenant_id: tenantId,
    name: "Frigorífico Norte",
    rne_number: "21-123456",
    contact: { phone: "11-5555-0000", email: "ventas@fnorte.com" },
  })
  .select("id, name, rne_number")
  .single();
if (supErr) throw new Error("supplier: " + supErr.message);

const { data: ing } = await supabase
  .from("ingredients")
  .insert({ tenant_id: tenantId, name: "Carne de cerdo", unit: "kg" })
  .select("id")
  .single();

const { data: entryId, error: entryErr } = await supabase.rpc(
  "create_stock_entry",
  {
    p_ingredient_id: ing.id,
    p_quantity: 100,
    p_unit: "kg",
    p_lot_number: "RECALL-MP-001",
    p_expiry_date: "2026-12-31",
    p_supplier_id: supplier.id,
  },
);
if (entryErr) throw new Error("create_stock_entry: " + entryErr.message);

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
await supabase.from("recipe_ingredients").insert([
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
        stock_entry_id: entryId,
        taken_qty: 20,
        is_substitute: false,
        source_ingredient_id: null,
      },
    ],
  },
);
if (prodErr) throw new Error("complete_production: " + prodErr.message);
console.log("setup OK · producción", prod.code, "lote PT", prod.product_lot);

// ── Cliente + despacho + ítem por INSERT directo (RPC create_dispatch no está) ─
const { data: customer, error: custErr } = await supabase
  .from("customers")
  .insert({
    tenant_id: tenantId,
    name: "Distribuidora Sur",
    locality: "Quilmes",
    address: "Av. Mitre 1234",
    phone: "11-4444-1111",
    email: "compras@distsur.com",
  })
  .select("id, name")
  .single();
if (custErr) throw new Error("customer: " + custErr.message);

const { data: dispatch, error: dispErr } = await supabase
  .from("dispatches")
  .insert({
    tenant_id: tenantId,
    customer_id: customer.id,
    dispatch_date: "2026-06-05",
    status: "completed",
  })
  .select("id")
  .single();
if (dispErr) throw new Error("dispatch: " + dispErr.message);

const { error: itemErr } = await supabase.from("dispatch_items").insert({
  dispatch_id: dispatch.id,
  recipe_id: recipe.id,
  production_id: prod.production_id,
  quantity_kg: 12.5,
});
if (itemErr) throw new Error("dispatch_item: " + itemErr.message);
console.log("setup OK · despacho a", customer.name, "12.5 kg");

// ── 1. searchLots: encuentra el lote MP y el lote PT (réplica del módulo) ──────
const like = "%RECALL%";
const [mpRes, ptRes] = await Promise.all([
  supabase
    .from("stock_entries")
    .select("id, lot_number, ingredient:ingredients(name)")
    .is("deleted_at", null)
    .ilike("lot_number", like)
    .limit(25),
  supabase
    .from("productions")
    .select("id, code, product_lot_number")
    .is("deleted_at", null)
    .not("product_lot_number", "is", null)
    .ilike("product_lot_number", `%${prod.product_lot}%`)
    .limit(25),
]);
if (mpRes.error) throw new Error("searchLots MP: " + mpRes.error.message);
if (ptRes.error) throw new Error("searchLots PT: " + ptRes.error.message);
if (!mpRes.data.some((r) => r.id === entryId))
  throw new Error("searchLots no encontró el lote MP");
if (!ptRes.data.some((r) => r.id === prod.production_id))
  throw new Error("searchLots no encontró el lote PT");
console.log("1. searchLots encuentra MP y PT OK");

// ── 2. traceForward(MP): producción consumidora + despacho + cliente ──────────
const { data: fwdInputs, error: fwdErr } = await supabase
  .from("production_inputs")
  .select("id, taken_qty, production:productions(id, code)")
  .eq("stock_entry_id", entryId);
if (fwdErr) throw new Error("traceForward inputs: " + fwdErr.message);
const fwdProdIds = [
  ...new Set(
    fwdInputs
      .map((ri) =>
        Array.isArray(ri.production) ? ri.production[0]?.id : ri.production?.id,
      )
      .filter(Boolean),
  ),
];
if (!fwdProdIds.includes(prod.production_id))
  throw new Error("traceForward no llegó a la producción");

const { data: fwdItems, error: fwdItemErr } = await supabase
  .from("dispatch_items")
  .select(
    `id, quantity_kg, production_id,
     dispatch:dispatches(id, status, deleted_at, customer:customers(id, name))`,
  )
  .in("production_id", fwdProdIds);
if (fwdItemErr) throw new Error("traceForward items: " + fwdItemErr.message);
const fwdCustomer = fwdItems
  .map((it) => (Array.isArray(it.dispatch) ? it.dispatch[0] : it.dispatch))
  .map((d) => (Array.isArray(d?.customer) ? d.customer[0] : d?.customer))
  .find((c) => c?.id === customer.id);
if (!fwdCustomer)
  throw new Error("traceForward NO encontró al cliente afectado");
const fwdKg = fwdItems.reduce((s, it) => s + Number(it.quantity_kg), 0);
if (fwdKg !== 12.5)
  throw new Error("traceForward kg esperado 12.5, fue " + fwdKg);
console.log(
  "2. traceForward(MP) llega al cliente",
  fwdCustomer.name,
  "·",
  fwdKg,
  "kg OK",
);

// ── 3. traceBackward(PT): insumos → proveedor/lote MP + despacho → cliente ────
const { data: bwdInputs, error: bwdErr } = await supabase
  .from("production_inputs")
  .select(
    `id, taken_qty,
     stock_entry:stock_entries(lot_number, supplier:suppliers(id, name, rne_number))`,
  )
  .eq("production_id", prod.production_id);
if (bwdErr) throw new Error("traceBackward inputs: " + bwdErr.message);
const bwdSe = bwdInputs
  .map((ri) =>
    Array.isArray(ri.stock_entry) ? ri.stock_entry[0] : ri.stock_entry,
  )
  .find((se) => se?.lot_number === "RECALL-MP-001");
if (!bwdSe) throw new Error("traceBackward no encontró el lote MP de origen");
const bwdSup = Array.isArray(bwdSe.supplier) ? bwdSe.supplier[0] : bwdSe.supplier;
if (bwdSup?.id !== supplier.id)
  throw new Error("traceBackward no encontró al proveedor de origen");
console.log(
  "3. traceBackward(PT) llega al proveedor",
  bwdSup.name,
  "lote",
  bwdSe.lot_number,
  "OK",
);

const { data: bwdItems, error: bwdItemErr } = await supabase
  .from("dispatch_items")
  .select("id, quantity_kg, dispatch:dispatches(customer:customers(id, name))")
  .eq("production_id", prod.production_id);
if (bwdItemErr) throw new Error("traceBackward items: " + bwdItemErr.message);
const bwdCustomer = bwdItems
  .map((it) => (Array.isArray(it.dispatch) ? it.dispatch[0] : it.dispatch))
  .map((d) => (Array.isArray(d?.customer) ? d.customer[0] : d?.customer))
  .find((c) => c?.id === customer.id);
if (!bwdCustomer)
  throw new Error("traceBackward NO encontró al cliente del PT");
console.log("4. traceBackward(PT) llega al cliente", bwdCustomer.name, "OK");

// ── 5. Recall incluye despachos anulados (la mercadería igual salió) ──────────
await supabase
  .from("dispatches")
  .update({ status: "voided" })
  .eq("id", dispatch.id);
const { data: voidedItems, error: voidErr } = await supabase
  .from("dispatch_items")
  .select("id, dispatch:dispatches(status, deleted_at)")
  .eq("production_id", prod.production_id);
if (voidErr) throw new Error("recall voided: " + voidErr.message);
const stillVisible = voidedItems
  .map((it) => (Array.isArray(it.dispatch) ? it.dispatch[0] : it.dispatch))
  .find((d) => d?.status === "voided");
if (!stillVisible)
  throw new Error(
    "FAIL: el despacho anulado desapareció del recall (la mercadería salió)",
  );
console.log("5. despacho anulado SIGUE visible en el recall OK");

console.log("\nSMOKE RECALL: TODO OK");
