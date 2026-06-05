// Smoke test del módulo Calidad — Análisis de laboratorio + laboratorios.
// Uso: node scripts/smoke-quality.mjs  (lee .env.local)
// Cubre: laboratorio CRUD, análisis CRUD, bounds de conformidad (0/100 OK,
// fuera de rango rechazado por el CHECK de la DB), filtros (tipo/fecha) y
// soft delete. Las tablas y el enum analysis_type viven en la migración 0001.
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

// ── Setup: tenant ─────────────────────────────────────────────────────────────
const email = `smoke-quality+${Date.now()}@ninjasoft.app`;
const password = "Smoke-" + Math.random().toString(36).slice(2, 12) + "9x";
const { error: suErr } = await supabase.auth.signUp({ email, password });
if (suErr) throw new Error("signup: " + suErr.message);
const { data: fn, error: fnErr } = await supabase.functions.invoke(
  "create_tenant",
  { body: { businessName: "Smoke Calidad", industry: "frigorifico" } }
);
if (fnErr) throw new Error("create_tenant: " + fnErr.message);
await supabase.auth.refreshSession();
const tenantId = fn.tenant_id;
console.log("setup OK · tenant", tenantId);

// 1. Alta de laboratorio (con contact jsonb)
const { data: lab, error: labErr } = await supabase
  .from("laboratories")
  .insert({
    tenant_id: tenantId,
    name: "Laboratorio Central",
    contact: { phone: "11-4444-5555", email: "lab@central.test" },
  })
  .select("id, name, contact")
  .single();
if (labErr) throw new Error("laboratory insert: " + labErr.message);
if (lab.contact?.email !== "lab@central.test")
  throw new Error("contact jsonb mal guardado: " + JSON.stringify(lab.contact));
console.log("1. laboratorio OK:", lab.name);

// 2. Edición de laboratorio
const { error: labUpdErr } = await supabase
  .from("laboratories")
  .update({ name: "Laboratorio Central S.A." })
  .eq("id", lab.id);
if (labUpdErr) throw new Error("laboratory update: " + labUpdErr.message);
console.log("2. edición de laboratorio OK");

// 3. Alta de análisis (relación con laboratorio + observaciones)
const { data: analysis, error: anErr } = await supabase
  .from("analyses")
  .insert({
    tenant_id: tenantId,
    type: "agua",
    analysis_date: "2026-06-01",
    conformity: 88,
    sample_code: "MUESTRA-001",
    laboratory_id: lab.id,
    observations_html: "Parámetros dentro de norma.",
  })
  .select("id, type, conformity, laboratory_id")
  .single();
if (anErr) throw new Error("analysis insert: " + anErr.message);
if (analysis.laboratory_id !== lab.id)
  throw new Error("vínculo laboratorio mal");
console.log("3. análisis OK:", analysis.id, "conformidad", analysis.conformity);

// 4. Bounds de conformidad: 0 y 100 deben aceptarse
const { error: zeroErr } = await supabase.from("analyses").insert({
  tenant_id: tenantId,
  type: "superficies",
  analysis_date: "2026-06-02",
  conformity: 0,
});
if (zeroErr) throw new Error("conformity 0 rechazado: " + zeroErr.message);
const { error: hundredErr } = await supabase.from("analyses").insert({
  tenant_id: tenantId,
  type: "ambiente",
  analysis_date: "2026-06-02",
  conformity: 100,
});
if (hundredErr) throw new Error("conformity 100 rechazado: " + hundredErr.message);
console.log("4. bounds 0 y 100 aceptados OK");

// 5. Conformidad fuera de rango: la DB tiene CHECK between 0 and 100 → rechazo
const { error: badLowErr } = await supabase.from("analyses").insert({
  tenant_id: tenantId,
  type: "otro",
  analysis_date: "2026-06-02",
  conformity: -5,
});
const { error: badHighErr } = await supabase.from("analyses").insert({
  tenant_id: tenantId,
  type: "otro",
  analysis_date: "2026-06-02",
  conformity: 150,
});
if (!badLowErr || !badHighErr)
  throw new Error(
    "FAIL: conformidad fuera de rango permitida por la DB (revisar CHECK)"
  );
console.log("5. conformidad fuera de rango rechazada por el CHECK de la DB OK");

// 6. Edición de análisis (conformidad → recategoriza)
const { error: anUpdErr } = await supabase
  .from("analyses")
  .update({ conformity: 35, observations_html: "Reanálisis: no conforme." })
  .eq("id", analysis.id);
if (anUpdErr) throw new Error("analysis update: " + anUpdErr.message);
console.log("6. edición de análisis OK");

// 7. Filtros: por tipo y por rango de fechas
const { data: byType, error: byTypeErr } = await supabase
  .from("analyses")
  .select("id, type")
  .is("deleted_at", null)
  .eq("type", "agua");
if (byTypeErr) throw new Error("filtro tipo: " + byTypeErr.message);
if (byType.length !== 1)
  throw new Error("filtro tipo agua esperaba 1, fue " + byType.length);

const { data: byDate, error: byDateErr } = await supabase
  .from("analyses")
  .select("id")
  .is("deleted_at", null)
  .gte("analysis_date", "2026-06-02")
  .lte("analysis_date", "2026-06-02");
if (byDateErr) throw new Error("filtro fecha: " + byDateErr.message);
// Solo persisten los 2 del paso 4 (los del paso 5 los rechaza el CHECK).
if (byDate.length !== 2)
  throw new Error("filtro fecha 2026-06-02 esperaba 2, fue " + byDate.length);
console.log("7. filtros tipo/fecha OK");

// 8. Búsqueda ilike por sample_code / observaciones
const { data: bySearch, error: searchErr } = await supabase
  .from("analyses")
  .select("id")
  .is("deleted_at", null)
  .or("sample_code.ilike.%MUESTRA%,observations_html.ilike.%MUESTRA%");
if (searchErr) throw new Error("búsqueda ilike: " + searchErr.message);
if (bySearch.length !== 1)
  throw new Error("búsqueda MUESTRA esperaba 1, fue " + bySearch.length);
console.log("8. búsqueda ilike OK");

// 9. Soft delete del análisis (no aparece en listados activos)
const { error: delErr } = await supabase
  .from("analyses")
  .update({ deleted_at: new Date().toISOString() })
  .eq("id", analysis.id);
if (delErr) throw new Error("soft delete análisis: " + delErr.message);
const { data: active } = await supabase
  .from("analyses")
  .select("id")
  .is("deleted_at", null);
if (active.some((a) => a.id === analysis.id))
  throw new Error("soft delete no aplicó");
console.log("9. soft delete de análisis OK");

// 10. Soft delete del laboratorio
const { error: labDelErr } = await supabase
  .from("laboratories")
  .update({ deleted_at: new Date().toISOString() })
  .eq("id", lab.id);
if (labDelErr) throw new Error("soft delete laboratorio: " + labDelErr.message);
const { data: activeLabs } = await supabase
  .from("laboratories")
  .select("id")
  .is("deleted_at", null);
if (activeLabs.length !== 0)
  throw new Error("soft delete laboratorio no aplicó: " + activeLabs.length);
console.log("10. soft delete de laboratorio OK");

console.log("\nSMOKE CALIDAD: TODO OK");
