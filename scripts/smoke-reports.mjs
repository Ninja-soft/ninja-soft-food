// Smoke test del módulo Calidad — Informes bromatológicos (reports).
// Uso: node scripts/smoke-reports.mjs  (lee .env.local)
// Cubre: report CRUD, bounds de importancia (0/100 OK, fuera de rango rechazado
// por el CHECK de la DB — migración 0001 línea 546: importance between 0 and
// 100), notify_member_ids con un member real, filtro por fecha, búsqueda ilike
// en content_html y soft delete. Las tablas viven en la migración 0001.
// Nota: los informes son EDITABLES (no son form_submissions): el smoke prueba
// un UPDATE explícito, que en form_submissions estaría bloqueado.
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
const email = `smoke-reports+${Date.now()}@ninjasoft.app`;
const password = "Smoke-" + Math.random().toString(36).slice(2, 12) + "9x";
const { error: suErr } = await supabase.auth.signUp({ email, password });
if (suErr) throw new Error("signup: " + suErr.message);
const { data: fn, error: fnErr } = await supabase.functions.invoke(
  "create_tenant",
  { body: { businessName: "Smoke Informes", industry: "frigorifico" } }
);
if (fnErr) throw new Error("create_tenant: " + fnErr.message);
await supabase.auth.refreshSession();
const tenantId = fn.tenant_id;
console.log("setup OK · tenant", tenantId);

// 0. Member real para usar en notify_member_ids (firma con PIN hasheado: acá
//    insertamos un hash placeholder, la firma real no es parte de este smoke).
const { data: member, error: memErr } = await supabase
  .from("members")
  .insert({
    tenant_id: tenantId,
    full_name: "Operario QA",
    email: "qa@planta.test",
    pin_hash: "$2a$10$placeholderplaceholderplaceholderplaceholderplaceholder",
  })
  .select("id, full_name")
  .single();
if (memErr) throw new Error("member insert: " + memErr.message);
console.log("0. member OK:", member.full_name);

// 1. Alta de informe (content_html + importancia + notificados)
const { data: report, error: repErr } = await supabase
  .from("reports")
  .insert({
    tenant_id: tenantId,
    report_date: "2026-06-01",
    content_html: "<h2>Control microbiologico</h2><p>Sin desvios.</p>",
    importance: 85,
    member_id: member.id,
    notify_member_ids: [member.id],
  })
  .select("id, importance, notify_member_ids, member_id")
  .single();
if (repErr) throw new Error("report insert: " + repErr.message);
if (report.importance !== 85) throw new Error("importancia mal guardada");
if (
  !Array.isArray(report.notify_member_ids) ||
  report.notify_member_ids[0] !== member.id
)
  throw new Error("notify_member_ids mal guardado");
console.log("1. informe OK:", report.id, "importancia", report.importance);

// 2. Edición del informe (los informes SON editables, a diferencia de
//    form_submissions). Cambia contenido + importancia → recategoriza.
const { error: updErr } = await supabase
  .from("reports")
  .update({
    content_html: "<p>Correccion: hallazgo menor en superficie.</p>",
    importance: 35,
  })
  .eq("id", report.id);
if (updErr) throw new Error("report update: " + updErr.message);
const { data: updated } = await supabase
  .from("reports")
  .select("importance")
  .eq("id", report.id)
  .single();
if (updated.importance !== 35) throw new Error("update no aplicó");
console.log("2. edición de informe OK (editable, no inmutable)");

// 3. Bounds de importancia: 0 y 100 deben aceptarse
const { error: zeroErr } = await supabase.from("reports").insert({
  tenant_id: tenantId,
  report_date: "2026-06-02",
  content_html: "<p>Minimo</p>",
  importance: 0,
});
if (zeroErr) throw new Error("importancia 0 rechazada: " + zeroErr.message);
const { error: hundredErr } = await supabase.from("reports").insert({
  tenant_id: tenantId,
  report_date: "2026-06-02",
  content_html: "<p>Maximo</p>",
  importance: 100,
});
if (hundredErr)
  throw new Error("importancia 100 rechazada: " + hundredErr.message);
console.log("3. bounds 0 y 100 aceptados OK");

// 4. Importancia fuera de rango: la DB tiene CHECK between 0 and 100 → rechazo
const { error: badLowErr } = await supabase.from("reports").insert({
  tenant_id: tenantId,
  report_date: "2026-06-02",
  content_html: "<p>Bajo</p>",
  importance: -5,
});
const { error: badHighErr } = await supabase.from("reports").insert({
  tenant_id: tenantId,
  report_date: "2026-06-02",
  content_html: "<p>Alto</p>",
  importance: 150,
});
if (!badLowErr || !badHighErr)
  throw new Error(
    "FAIL: importancia fuera de rango permitida por la DB (revisar CHECK)"
  );
console.log("4. importancia fuera de rango rechazada por el CHECK de la DB OK");

// 5. Filtro por rango de fechas
const { data: byDate, error: byDateErr } = await supabase
  .from("reports")
  .select("id")
  .is("deleted_at", null)
  .gte("report_date", "2026-06-02")
  .lte("report_date", "2026-06-02");
if (byDateErr) throw new Error("filtro fecha: " + byDateErr.message);
// Solo persisten los 2 del paso 3 (los del paso 4 los rechaza el CHECK).
if (byDate.length !== 2)
  throw new Error("filtro fecha 2026-06-02 esperaba 2, fue " + byDate.length);
console.log("5. filtro por fecha OK");

// 6. Búsqueda ilike en content_html (el informe editado contiene "superficie")
const { data: bySearch, error: searchErr } = await supabase
  .from("reports")
  .select("id")
  .is("deleted_at", null)
  .ilike("content_html", "%superficie%");
if (searchErr) throw new Error("búsqueda ilike: " + searchErr.message);
if (bySearch.length !== 1)
  throw new Error("búsqueda superficie esperaba 1, fue " + bySearch.length);
console.log("6. búsqueda ilike en content_html OK");

// 7. Adjunto: alta de fila en report_attachments (RLS vía parent report)
const { data: attach, error: attErr } = await supabase
  .from("report_attachments")
  .insert({
    report_id: report.id,
    name: "informe.pdf",
    url: `${tenantId}/reports/${report.id}/00000000-0000-0000-0000-000000000000.pdf`,
    mime: "application/pdf",
    size: 12345,
  })
  .select("id, report_id")
  .single();
if (attErr) throw new Error("report_attachment insert: " + attErr.message);
if (attach.report_id !== report.id) throw new Error("vínculo adjunto mal");
console.log("7. adjunto OK (RLS vía parent)");

// 8. Soft delete del informe (no aparece en listados activos)
const { error: delErr } = await supabase
  .from("reports")
  .update({ deleted_at: new Date().toISOString() })
  .eq("id", report.id);
if (delErr) throw new Error("soft delete informe: " + delErr.message);
const { data: active } = await supabase
  .from("reports")
  .select("id")
  .is("deleted_at", null);
if (active.some((r) => r.id === report.id))
  throw new Error("soft delete no aplicó");
console.log("8. soft delete de informe OK");

console.log("\nSMOKE INFORMES: TODO OK");
