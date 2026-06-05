// Smoke test del flujo de alta (fase 0): signup → create_tenant → claim → RLS.
// Uso: node scripts/smoke-auth.mjs  (lee .env.local)
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(url, anon);

const email = `smoke+${Date.now()}@ninjasoft.app`;
const password = "Smoke-" + Math.random().toString(36).slice(2, 12) + "9x";

// 1. Signup
const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
  email,
  password,
  options: { data: { full_name: "Smoke Test" } },
});
if (signUpError) throw new Error("signup: " + signUpError.message);
if (!signUpData.session) throw new Error("signup: sin sesión (¿autoconfirm off?)");
console.log("1. signup OK:", email);

// 2. create_tenant
const { data: fnData, error: fnError } = await supabase.functions.invoke(
  "create_tenant",
  { body: { businessName: "Frigorífico Smoke", industry: "frigorifico" } },
);
if (fnError) throw new Error("create_tenant: " + fnError.message);
console.log("2. create_tenant OK:", fnData.tenant_id);

// 3. Refresh → claim en JWT
const { data: refreshed, error: refreshError } =
  await supabase.auth.refreshSession();
if (refreshError) throw new Error("refresh: " + refreshError.message);
const claim = refreshed.user?.app_metadata?.tenant_id;
if (claim !== fnData.tenant_id) throw new Error("claim mismatch: " + claim);
console.log("3. claim tenant_id OK");

// 4. RLS: leer el propio tenant
const { data: tenant, error: tenantError } = await supabase
  .from("tenants")
  .select("name, status, trial_ends_at")
  .eq("id", fnData.tenant_id)
  .single();
if (tenantError) throw new Error("rls read: " + tenantError.message);
console.log("4. RLS lectura propia OK:", tenant.name, "·", tenant.status);

// 5. RLS: no ver tenants ajenos
const { data: allTenants } = await supabase.from("tenants").select("id");
if ((allTenants ?? []).length !== 1)
  throw new Error("RLS FAIL: ve " + (allTenants ?? []).length + " tenants");
console.log("5. RLS aislamiento OK (solo 1 tenant visible)");

// 6. Suscripción trial creada
const { data: sub, error: subError } = await supabase
  .from("subscriptions")
  .select("status, plans(key)")
  .eq("tenant_id", fnData.tenant_id)
  .single();
if (subError) throw new Error("subscription: " + subError.message);
console.log("6. suscripción OK:", sub.status, "· plan", sub.plans?.key);

console.log("\nSMOKE AUTH: TODO OK");
