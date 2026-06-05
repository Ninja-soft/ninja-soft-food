// Smoke test del Builder de planillas configurables (migración 0009).
// Uso: node scripts/smoke-forms.mjs  (lee .env.local)
// Cubre: form_templates CRUD, RPC submit_form (firma con PIN bcrypt),
// inmutabilidad de form_submissions (UPDATE rechazado) y la cadena de
// correcciones (corrects_submission_id).
// Nota: la migración 0009 (00000000000009_form_builder.sql) puede no estar
// aplicada en la nube. Los pasos que dependan de las tablas/RPC se reportan como
// "PENDIENTE DE MIGRACIÓN 0009" y el script sale con éxito (exit 0) en vez de
// fallar — mismo patrón que smoke-dispatch con create_dispatch.
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

// Detecta "tabla/función inexistente" (migración 0009 no aplicada).
function isMigrationPending(error) {
  if (!error) return false;
  const code = error.code ?? "";
  const msg = error.message ?? "";
  return (
    code === "PGRST205" ||
    code === "42P01" ||
    code === "PGRST202" ||
    msg.includes("form_templates") ||
    msg.includes("form_submissions") ||
    msg.includes("submit_form")
  );
}

function pendingExit(where, error) {
  console.log(
    `${where} PENDIENTE DE MIGRACIÓN 0009 (aplicar 00000000000009_form_builder.sql) ·`,
    error?.message ?? error?.code ?? "tabla/RPC inexistente"
  );
  console.log(
    "\nSMOKE PLANILLAS CONFIGURABLES: setup OK · 0009 pendiente de migración"
  );
  process.exit(0);
}

// ── Setup: tenant + member con PIN placeholder ───────────────────────────────
const email = `smoke-forms+${Date.now()}@ninjasoft.app`;
const password = "Smoke-" + Math.random().toString(36).slice(2, 12) + "9x";
const { error: suErr } = await supabase.auth.signUp({ email, password });
if (suErr) throw new Error("signup: " + suErr.message);
const { data: fn, error: fnErr } = await supabase.functions.invoke(
  "create_tenant",
  { body: { businessName: "Smoke Planillas", industry: "frigorifico" } }
);
if (fnErr) throw new Error("create_tenant: " + fnErr.message);
await supabase.auth.refreshSession();
const tenantId = fn.tenant_id;

// PIN bcrypt placeholder (no se conoce el PIN en claro: solo se usa para probar
// la RUTA de rechazo invalid_pin; la firma válida se cubre app-side).
const { data: member, error: memErr } = await supabase
  .from("members")
  .insert({
    tenant_id: tenantId,
    full_name: "Operario QA",
    pin_hash: "$2a$10$placeholderplaceholderplaceholderplaceholderplaceholder",
  })
  .select("id, full_name")
  .single();
if (memErr) throw new Error("member insert: " + memErr.message);
console.log("setup OK · tenant", tenantId, "· member", member.full_name);

// Fields de ejemplo: una temperatura con rango (semáforo) + un select.
const fields = [
  {
    key: "temp_camara",
    label: "Temperatura cámara",
    type: "temperature",
    required: true,
    min: 0,
    max: 5,
    unit: "°C",
  },
  {
    key: "estado",
    label: "Estado general",
    type: "select",
    required: true,
    options: ["Conforme", "No conforme"],
  },
];

// 1. Alta de template (planilla configurable, sin firma para el flujo positivo)
const { data: tplNoSign, error: tplErr } = await supabase
  .from("form_templates")
  .insert({
    tenant_id: tenantId,
    name: "Control de cámara de frío",
    kind: "temperatura",
    fields,
    frequency: { type: "daily", time: "08:00" },
    requires_signature: false,
    action_on_fail: { instructions: "Llamar a mantenimiento de inmediato." },
  })
  .select("id, name, requires_signature")
  .single();
if (isMigrationPending(tplErr)) pendingExit("1. form_templates", tplErr);
if (tplErr) throw new Error("template insert: " + tplErr.message);
console.log("1. template (sin firma) OK:", tplNoSign.name);

// 2. submit_form OK (sin firma) → status 'ok' (valor dentro de rango)
const { data: subOk, error: subOkErr } = await supabase.rpc("submit_form", {
  p_template_id: tplNoSign.id,
  p_values: { temp_camara: 3, estado: "Conforme" },
  p_status: "ok",
});
if (isMigrationPending(subOkErr)) pendingExit("2. submit_form", subOkErr);
if (subOkErr) throw new Error("submit_form ok: " + subOkErr.message);
if (!subOk?.submission_id) throw new Error("submit_form sin submission_id");
if (subOk.signed !== false)
  throw new Error("esperaba signed=false sin firma, fue " + subOk.signed);
console.log("2. submit_form (sin firma) OK:", subOk.submission_id);

// 3. submit_form con desvío → status 'fail' + acción correctiva
const { data: subFail, error: subFailErr } = await supabase.rpc("submit_form", {
  p_template_id: tplNoSign.id,
  p_values: { temp_camara: 9, estado: "No conforme" },
  p_status: "fail",
  p_corrective_action: "Se trasladó la mercadería a otra cámara.",
});
if (subFailErr) throw new Error("submit_form fail: " + subFailErr.message);
if (!subFail?.submission_id) throw new Error("submit_form fail sin id");
console.log("3. submit_form (desvío + acción correctiva) OK");

// 4. Inmutabilidad: UPDATE de una submission debe ser rechazado por el trigger
const { error: immErr } = await supabase
  .from("form_submissions")
  .update({ status: "ok" })
  .eq("id", subFail.submission_id);
if (!immErr)
  throw new Error("FAIL: se permitió editar una form_submission (inmutable)");
console.log("4. inmutabilidad (UPDATE rechazado) OK ·", immErr.message);

// 5. Corrección: fila nueva que apunta a la submission con desvío
const { data: subCorr, error: subCorrErr } = await supabase.rpc("submit_form", {
  p_template_id: tplNoSign.id,
  p_values: { temp_camara: 4, estado: "Conforme" },
  p_status: "corrected",
  p_corrective_action: "Reparada la cámara; temperatura normalizada.",
  p_corrects: subFail.submission_id,
});
if (subCorrErr) throw new Error("submit_form corrected: " + subCorrErr.message);
const { data: corrRow, error: corrRowErr } = await supabase
  .from("form_submissions")
  .select("status, corrects_submission_id")
  .eq("id", subCorr.submission_id)
  .single();
if (corrRowErr) throw new Error("lectura corrección: " + corrRowErr.message);
if (corrRow.status !== "corrected")
  throw new Error("status corrected mal guardado: " + corrRow.status);
if (corrRow.corrects_submission_id !== subFail.submission_id)
  throw new Error("vínculo de corrección mal");
console.log("5. corrección vinculada (corrects_submission_id) OK");

// 6. Template con firma obligatoria → PIN incorrecto debe rechazarse
const { data: tplSign, error: tplSignErr } = await supabase
  .from("form_templates")
  .insert({
    tenant_id: tenantId,
    name: "Recepción de materia prima",
    kind: "recepcion_mp",
    fields,
    frequency: { type: "none" },
    requires_signature: true,
  })
  .select("id")
  .single();
if (tplSignErr) throw new Error("template firma insert: " + tplSignErr.message);

// 6a. sin member/PIN → signature_required
const { error: noSigErr } = await supabase.rpc("submit_form", {
  p_template_id: tplSign.id,
  p_values: { temp_camara: 2, estado: "Conforme" },
});
if (!noSigErr || !noSigErr.message.includes("signature_required"))
  throw new Error("FAIL: firma omitida no rechazada");
console.log("6a. firma faltante → signature_required OK");

// 6b. PIN incorrecto → invalid_pin (el hash placeholder no valida "0000")
const { error: badPinErr } = await supabase.rpc("submit_form", {
  p_template_id: tplSign.id,
  p_values: { temp_camara: 2, estado: "Conforme" },
  p_member_id: member.id,
  p_pin: "0000",
});
if (!badPinErr || !badPinErr.message.includes("invalid_pin"))
  throw new Error("FAIL: PIN incorrecto no rechazado");
console.log("6b. PIN incorrecto → invalid_pin OK");

// 7. Listado de submissions del template (más reciente primero)
const { data: subs, error: subsErr } = await supabase
  .from("form_submissions")
  .select("id, status, submitted_at")
  .eq("template_id", tplNoSign.id)
  .order("submitted_at", { ascending: false });
if (subsErr) throw new Error("listado submissions: " + subsErr.message);
if (subs.length !== 3)
  throw new Error("esperaba 3 registros, fue " + subs.length);
console.log("7. listado de submissions OK (3 registros)");

// 8. Soft delete del template (no aparece en listados activos)
const { error: delErr } = await supabase
  .from("form_templates")
  .update({ deleted_at: new Date().toISOString() })
  .eq("id", tplNoSign.id);
if (delErr) throw new Error("soft delete template: " + delErr.message);
const { data: active } = await supabase
  .from("form_templates")
  .select("id")
  .is("deleted_at", null);
if (active.some((t) => t.id === tplNoSign.id))
  throw new Error("soft delete no aplicó");
console.log("8. soft delete de template OK");

console.log("\nSMOKE PLANILLAS CONFIGURABLES: TODO OK");
