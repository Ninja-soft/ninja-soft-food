// Smoke test del Panel interno staff Ninja-Soft.
// Uso: node scripts/smoke-internal.mjs  (lee .env.local)
//
// Verifica el contrato de acceso del staff sin migraciones nuevas:
//   1. Crea dos tenants (A = staff, B = ajeno) vía Edge Function create_tenant.
//   2. Marca al user A como is_internal con service role.
//   3. Con el anon client logueado como A: public.is_internal() = true y puede
//      LEER el tenant ajeno B (policy own_tenant/internal_read con is_internal()).
//   4. El user B (no staff) NO ve el tenant A (aislamiento RLS intacto).
//   5. payment_events / system_emails NO son legibles con el cliente normal
//      (solo service_role) — confirma que el panel debe leerlos server-side.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)])
);

const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !ANON || !SERVICE)
  throw new Error("Faltan vars en .env.local (URL/ANON/SERVICE_ROLE)");

const admin = createClient(URL, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const pass = "Smoke-" + Math.random().toString(36).slice(2, 12) + "9x";

// Helper: cliente fresco logueado como el email dado.
async function clientFor(email) {
  const c = createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await c.auth.signInWithPassword({ email, password: pass });
  if (error) throw new Error(`login ${email}: ${error.message}`);
  return c;
}

// Crea un tenant logueado con un cliente nuevo; devuelve { email, tenantId, userId }.
async function makeTenant(label) {
  const email = `smoke-internal-${label}+${Date.now()}@ninjasoft.app`;
  const c = createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: su, error: suErr } = await c.auth.signUp({ email, password: pass });
  if (suErr) throw new Error(`signup ${label}: ${suErr.message}`);
  const { data: fn, error: fnErr } = await c.functions.invoke("create_tenant", {
    body: { businessName: `Smoke Internal ${label}`, industry: "frigorifico" },
  });
  if (fnErr) throw new Error(`create_tenant ${label}: ${fnErr.message}`);
  await c.auth.refreshSession();
  return { email, tenantId: fn.tenant_id, userId: su.user.id };
}

// ── Setup ──────────────────────────────────────────────────────────────────
const staff = await makeTenant("staff");
const other = await makeTenant("other");
console.log("setup OK · staff tenant", staff.tenantId, "· other", other.tenantId);

// 1. Marcar al user staff como is_internal (service role).
const { error: mkErr } = await admin
  .from("users")
  .update({ is_internal: true, internal_level: "admin" })
  .eq("id", staff.userId);
if (mkErr) throw new Error("set is_internal: " + mkErr.message);
console.log("1. user staff marcado is_internal=true (admin) OK");

// 2. is_internal() = true para el staff (anon client, sesión propia).
const staffClient = await clientFor(staff.email);
const { data: isInt, error: isErr } = await staffClient.rpc("is_internal");
if (isErr) throw new Error("rpc is_internal: " + isErr.message);
if (isInt !== true) throw new Error("FAIL: is_internal() no devolvió true");
console.log("2. public.is_internal() = true para el staff OK");

// 3. El staff lee el tenant AJENO (own_tenant/internal_read via is_internal()).
const { data: seen, error: seenErr } = await staffClient
  .from("tenants")
  .select("id, name")
  .eq("id", other.tenantId)
  .maybeSingle();
if (seenErr) throw new Error("staff read other tenant: " + seenErr.message);
if (!seen || seen.id !== other.tenantId)
  throw new Error("FAIL: staff no pudo leer el tenant ajeno");
console.log("3. staff lee tenant ajeno OK:", seen.name);

// 3b. El staff lee tablas operativas ajenas (policy internal_read en todas).
const { data: staffSubs, error: subErr } = await staffClient
  .from("subscriptions")
  .select("tenant_id, status");
if (subErr) throw new Error("staff read subscriptions: " + subErr.message);
const sawOther = (staffSubs ?? []).some((s) => s.tenant_id === other.tenantId);
if (!sawOther)
  throw new Error("FAIL: staff no ve subscriptions del tenant ajeno");
console.log(
  "3b. staff ve subscriptions de TODOS los tenants OK (" +
    (staffSubs?.length ?? 0) +
    " filas)"
);

// 4. El user B (NO staff) no ve el tenant A.
const otherClient = await clientFor(other.email);
const { data: bIsInt } = await otherClient.rpc("is_internal");
if (bIsInt === true) throw new Error("FAIL: user B figura como internal");
const { data: bSeen } = await otherClient
  .from("tenants")
  .select("id")
  .eq("id", staff.tenantId)
  .maybeSingle();
if (bSeen)
  throw new Error("FAIL: user B (no staff) leyó el tenant ajeno (RLS roto)");
const { data: bSubs } = await otherClient.from("subscriptions").select("tenant_id");
const bSawStaff = (bSubs ?? []).some((s) => s.tenant_id === staff.tenantId);
if (bSawStaff) throw new Error("FAIL: user B vio subscriptions ajenas");
console.log("4. user no-staff NO ve tenants/subscriptions ajenos OK (RLS intacto)");

// 5. payment_events / system_emails: sin policy para authenticated.
//    El staff NO debe leerlos con el cliente normal (van server-side con admin).
const { data: pe } = await staffClient.from("payment_events").select("id").limit(1);
const { data: se } = await staffClient.from("system_emails").select("id").limit(1);
if ((pe ?? []).length > 0 || (se ?? []).length > 0)
  throw new Error(
    "FAIL: payment_events/system_emails legibles con cliente normal (esperaba 0)"
  );
// Con admin sí se leen (lo que hace modules/internal/server).
const { error: aPeErr } = await admin.from("payment_events").select("id").limit(1);
const { error: aSeErr } = await admin.from("system_emails").select("id").limit(1);
if (aPeErr || aSeErr)
  throw new Error("FAIL: admin client no pudo leer payment_events/system_emails");
console.log(
  "5. payment_events/system_emails ocultos al cliente normal, legibles con admin OK"
);

console.log("\nSMOKE INTERNAL: TODO OK");
