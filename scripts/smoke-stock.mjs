// Smoke test del módulo Stock: RPC de ingreso atómico, ledger y ajustes.
// Uso: node scripts/smoke-stock.mjs  (lee .env.local)
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
const email = `smoke-stock+${Date.now()}@ninjasoft.app`;
const password = "Smoke-" + Math.random().toString(36).slice(2, 12) + "9x";
const { error: suErr } = await supabase.auth.signUp({ email, password });
if (suErr) throw new Error("signup: " + suErr.message);
const { data: fn, error: fnErr } = await supabase.functions.invoke(
  "create_tenant",
  { body: { businessName: "Smoke Stock", industry: "frigorifico" } },
);
if (fnErr) throw new Error("create_tenant: " + fnErr.message);
await supabase.auth.refreshSession();
const tenantId = fn.tenant_id;

const { data: ing, error: ingErr } = await supabase
  .from("ingredients")
  .insert({ tenant_id: tenantId, name: "Carne de cerdo", unit: "kg" })
  .select("id")
  .single();
if (ingErr) throw new Error("ingrediente: " + ingErr.message);

const { data: sup } = await supabase
  .from("suppliers")
  .insert({ tenant_id: tenantId, name: "Frigorífico Norte", rne_number: "21-123456" })
  .select("id")
  .single();
console.log("setup OK");

// 1. Ingreso atómico vía RPC
const { data: entryId, error: rpcErr } = await supabase.rpc(
  "create_stock_entry",
  {
    p_ingredient_id: ing.id,
    p_quantity: 100,
    p_unit: "kg",
    p_lot_number: "L260604-TEST",
    p_expiry_date: "2026-06-20",
    p_is_frozen: false,
    p_supplier_id: sup.id,
    p_unit_cost: 3500,
  },
);
if (rpcErr) throw new Error("create_stock_entry: " + rpcErr.message);
console.log("1. ingreso RPC OK:", entryId);

// 2. Movimiento purchase en el ledger
const { data: movs } = await supabase
  .from("stock_movements")
  .select("type, quantity")
  .eq("stock_entry_id", entryId);
if (movs?.length !== 1 || movs[0].type !== "purchase" || movs[0].quantity !== 100)
  throw new Error("ledger purchase mal: " + JSON.stringify(movs));
console.log("2. ledger purchase OK");

// 3. Ajuste negativo con motivo
const { data: remaining, error: adjErr } = await supabase.rpc(
  "adjust_stock_entry",
  { p_entry_id: entryId, p_delta: -12.5, p_reason: "merma smoke test" },
);
if (adjErr) throw new Error("adjust: " + adjErr.message);
if (Number(remaining) !== 87.5)
  throw new Error("remaining esperado 87.5, fue " + remaining);
console.log("3. ajuste OK, restante:", remaining);

// 4. Ajuste sin motivo → rechazado
const { error: noReasonErr } = await supabase.rpc("adjust_stock_entry", {
  p_entry_id: entryId,
  p_delta: -1,
  p_reason: "  ",
});
if (!noReasonErr) throw new Error("FAIL: ajuste sin motivo permitido");
console.log("4. motivo obligatorio OK");

// 5. Stock insuficiente → rechazado y SIN movimiento fantasma
const { error: insufErr } = await supabase.rpc("adjust_stock_entry", {
  p_entry_id: entryId,
  p_delta: -1000,
  p_reason: "overdraw",
});
if (!insufErr || !insufErr.message.includes("insufficient_stock"))
  throw new Error("FAIL: overdraw permitido: " + insufErr?.message);
const { data: movs2 } = await supabase
  .from("stock_movements")
  .select("id")
  .eq("stock_entry_id", entryId);
if (movs2?.length !== 2)
  throw new Error("ledger inconsistente tras overdraw: " + movs2?.length);
console.log("5. overdraw bloqueado + ledger consistente OK");

// 6. remaining_quantity persistido
const { data: entry } = await supabase
  .from("stock_entries")
  .select("remaining_quantity")
  .eq("id", entryId)
  .single();
if (Number(entry.remaining_quantity) !== 87.5)
  throw new Error("remaining persistido mal: " + entry.remaining_quantity);
console.log("6. persistencia OK");

console.log("\nSMOKE STOCK: TODO OK");
