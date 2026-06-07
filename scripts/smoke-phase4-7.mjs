// Smoke test de cierre Fases 4-7 (compliance internacional + consola SaaS + IA).
// Uso: node scripts/smoke-phase4-7.mjs  (lee .env.local)
//
// Recorre de punta a punta, contra el cloud, lo nuevo de las migraciones
// 0013-0022 usando un tenant de MÉXICO (no Argentina) para probar el motor de
// compliance internacional — regla dura 11: un tenant MX nunca debe ver
// conceptos regulatorios argentinos.
//
//   1. Alta de tenant MX (create_tenant con country=MX, igual que onboarding).
//   2. Operating profile: MXN + frameworks NOM-051/COFEPRIS/HACCP (trigger 0013
//      + refinamiento de onboarding vía getDefaultOperatingProfile('MX')).
//   3. Permiso COFEPRIS en regulatory_permits (tabla genérica de 0013, reemplaza
//      RNE/RNPA/RUCA argentinos).
//   4. Receta con regulatory_labels mx_nom051 (sellos NOM-051, NO octógonos AR).
//   5. Producción → la RPC complete_production (0021) snapshotea regulatory_labels
//      en la traza pública inmutable.
//   6. tenant_flags + subscription_addons (0014) legibles por el propio tenant.
//   7. Limpieza COMPLETA con service role (mismo patrón que los demás smokes).
//
// El operating profile se construye con el MISMO mapa que la UI
// (lib/globalization/countries → getDefaultOperatingProfile), replicado acá como
// constante para no acoplar el script al build de TS. Si cambian los defaults de
// MX en countries.ts, actualizar MX_PROFILE.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);

const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !ANON || !SERVICE)
  throw new Error("Faltan vars en .env.local (URL/ANON/SERVICE_ROLE)");

// Cliente admin (service role) para escrituras solo-staff (flags/addons) y limpieza.
const admin = createClient(URL, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Defaults de MX espejados de lib/globalization/countries.ts (getDefaultOperatingProfile).
const MX_PROFILE = {
  country: "MX",
  locale: "es-MX",
  currency: "MXN",
  timezone: "America/Mexico_City",
  tax_id_label: "RFC",
  tax_label: "IVA",
  default_tax_rate: 16,
  measurement_system: "metric",
  weight_unit: "kg",
  volume_unit: "l",
  temperature_unit: "celsius",
  date_format: "DD/MM/YYYY",
  compliance_frameworks: ["NOM-051", "COFEPRIS", "HACCP"],
  label_languages: ["es"],
  traceability_config: {
    fields: ["lote", "caducidad", "registro", "fabricante"],
    authorities: ["COFEPRIS", "SENASICA"],
    billing_providers: ["mercadopago", "stripe", "paypal", "manual"],
  },
};

const arraysEqual = (a, b) =>
  Array.isArray(a) &&
  Array.isArray(b) &&
  a.length === b.length &&
  a.every((v, i) => v === b[i]);

let tenantId = null;
let userId = null;

try {
  // ── 1. Alta de tenant MX (signup + create_tenant con country, como onboarding) ─
  const email = `smoke-p47+${Date.now()}@ninjasoft.app`;
  const password = "Smoke-" + Math.random().toString(36).slice(2, 12) + "9x";
  const tenantClient = createClient(URL, ANON, {
    auth: { persistSession: true, autoRefreshToken: false },
  });
  const { data: su, error: suErr } = await tenantClient.auth.signUp({
    email,
    password,
  });
  if (suErr) throw new Error("signup: " + suErr.message);
  if (!su.session) throw new Error("signup: sin sesión (¿autoconfirm off?)");
  userId = su.user.id;

  const { data: fn, error: fnErr } = await tenantClient.functions.invoke(
    "create_tenant",
    {
      body: {
        businessName: "Smoke Mexico Foods",
        industry: "conservas",
        country: "MX",
      },
    },
  );
  if (fnErr) throw new Error("create_tenant: " + fnErr.message);
  await tenantClient.auth.refreshSession();
  tenantId = fn.tenant_id;
  console.log("1. tenant MX creado OK:", tenantId, "·", email);

  // Verificar que el tenant nació con country MX (no AR por default).
  const { data: tRow, error: tErr } = await tenantClient
    .from("tenants")
    .select("country, name")
    .eq("id", tenantId)
    .single();
  if (tErr) throw new Error("read tenant: " + tErr.message);
  if (tRow.country !== "MX")
    throw new Error("FAIL: tenant.country esperado MX, fue " + tRow.country);
  console.log("   tenants.country = MX OK");

  // ── 2. Operating profile: refinar con defaults MX (onboarding) y verificar ────
  // El trigger 0013 ya creó el profile con country=MX + frameworks correctos;
  // onboarding lo refina con moneda/unidades. Mirroreamos ese upsert.
  const { error: upErr } = await tenantClient
    .from("tenant_operating_profiles")
    .upsert({ tenant_id: tenantId, ...MX_PROFILE }, { onConflict: "tenant_id" });
  if (upErr) throw new Error("upsert operating profile: " + upErr.message);

  const { data: prof, error: profErr } = await tenantClient
    .from("tenant_operating_profiles")
    .select("country, currency, locale, compliance_frameworks, tax_id_label")
    .eq("tenant_id", tenantId)
    .single();
  if (profErr) throw new Error("read profile: " + profErr.message);
  if (prof.country !== "MX")
    throw new Error("FAIL: profile.country esperado MX, fue " + prof.country);
  if (prof.currency !== "MXN")
    throw new Error("FAIL: profile.currency esperado MXN, fue " + prof.currency);
  if (prof.tax_id_label !== "RFC")
    throw new Error("FAIL: tax_id_label esperado RFC, fue " + prof.tax_id_label);
  if (!arraysEqual(prof.compliance_frameworks, ["NOM-051", "COFEPRIS", "HACCP"]))
    throw new Error(
      "FAIL: frameworks esperados [NOM-051,COFEPRIS,HACCP], fue " +
        JSON.stringify(prof.compliance_frameworks),
    );
  // Negativo de regla 11: NO debe arrastrar el set argentino.
  if ((prof.compliance_frameworks ?? []).some((f) => ["RNE", "RNPA", "CAA"].includes(f)))
    throw new Error("FAIL regla 11: tenant MX trae frameworks argentinos");
  console.log(
    "2. operating profile MX OK: MXN ·",
    prof.locale,
    "· frameworks",
    JSON.stringify(prof.compliance_frameworks),
  );

  // ── 3. Permiso COFEPRIS en regulatory_permits (tabla genérica de 0013) ────────
  // Necesita una entidad: usamos el establecimiento por defecto que crea create_tenant.
  const { data: estab, error: estabErr } = await tenantClient
    .from("establishments")
    .select("id")
    .eq("tenant_id", tenantId)
    .limit(1)
    .single();
  if (estabErr) throw new Error("read establishment: " + estabErr.message);

  const { data: permit, error: permErr } = await tenantClient
    .from("regulatory_permits")
    .insert({
      tenant_id: tenantId,
      entity_type: "establishment",
      entity_id: estab.id,
      permit_type: "cofepris_aviso_funcionamiento",
      permit_number: "COFEPRIS-MX-0001",
      issued_at: "2026-01-01",
    })
    .select("id, permit_type, permit_number")
    .single();
  if (permErr) throw new Error("regulatory_permits insert: " + permErr.message);
  if (permit.permit_type !== "cofepris_aviso_funcionamiento")
    throw new Error("FAIL: permit_type mal guardado: " + permit.permit_type);
  console.log(
    "3. permiso COFEPRIS en regulatory_permits OK:",
    permit.permit_number,
  );

  // ── 4. Receta con regulatory_labels mx_nom051 (sellos NOM-051, NO octógonos AR)
  const { data: ing, error: ingErr } = await tenantClient
    .from("ingredients")
    .insert({ tenant_id: tenantId, name: "Chiles en conserva", unit: "kg" })
    .select("id")
    .single();
  if (ingErr) throw new Error("ingrediente: " + ingErr.message);

  const { data: recipe, error: recErr } = await tenantClient
    .from("recipes")
    .insert({
      tenant_id: tenantId,
      title: "Salsa de chile envasada",
      category: "conservas",
      shelf_life_days: 365,
      // regulatory_labels: sistema de rotulado frontal por país (0013).
      // Para MX el sistema es mx_nom051; values son los sellos NOM-051.
      regulatory_labels: {
        system: "mx_nom051",
        values: ["exceso_sodio", "exceso_calorias"],
      },
    })
    .select("id, regulatory_labels")
    .single();
  if (recErr) throw new Error("receta: " + recErr.message);
  if (recipe.regulatory_labels?.system !== "mx_nom051")
    throw new Error(
      "FAIL: regulatory_labels.system esperado mx_nom051, fue " +
        JSON.stringify(recipe.regulatory_labels),
    );
  await tenantClient.from("recipe_ingredients").insert([
    {
      recipe_id: recipe.id,
      ingredient_id: ing.id,
      quantity: 1,
      unit: "kg",
      is_substitute: false,
    },
  ]);
  console.log("4. receta con regulatory_labels mx_nom051 OK");

  // ── 5. Producción → la traza inmutable snapshotea regulatory_labels (RPC 0021) ─
  const { data: entry, error: entryErr } = await tenantClient.rpc(
    "create_stock_entry",
    {
      p_ingredient_id: ing.id,
      p_quantity: 50,
      p_unit: "kg",
      p_lot_number: "MX-CHILE-001",
      p_expiry_date: "2026-12-31",
    },
  );
  if (entryErr) throw new Error("create_stock_entry: " + entryErr.message);

  const { data: prod, error: prodErr } = await tenantClient.rpc(
    "complete_production",
    {
      p_recipe_id: recipe.id,
      p_quantity_kg: 10,
      p_production_date: "2026-06-07",
      p_inputs: [
        {
          ingredient_id: ing.id,
          stock_entry_id: entry,
          taken_qty: 10,
          is_substitute: false,
          source_ingredient_id: null,
        },
      ],
    },
  );
  if (prodErr) throw new Error("complete_production: " + prodErr.message);
  console.log("5a. producción OK:", prod.code, "lote", prod.product_lot);

  // Traza pública anónima: debe traer regulatory_labels en el snapshot (0021).
  const anon = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data: trace, error: traceErr } = await anon
    .from("public_traces")
    .select("payload")
    .eq("slug", prod.trace_slug)
    .single();
  if (traceErr) throw new Error("traza anónima: " + traceErr.message);
  const labels = trace.payload.regulatory_labels;
  if (!labels || labels.system !== "mx_nom051")
    throw new Error(
      "FAIL regla 11: la traza NO snapshoteó regulatory_labels mx_nom051. payload.regulatory_labels = " +
        JSON.stringify(labels),
    );
  if (!arraysEqual(labels.values, ["exceso_sodio", "exceso_calorias"]))
    throw new Error(
      "FAIL: values de la traza mal: " + JSON.stringify(labels.values),
    );
  console.log(
    "5b. traza pública snapshotea regulatory_labels mx_nom051 OK (RPC 0021) · sellos",
    JSON.stringify(labels.values),
  );

  // ── 6. tenant_flags + subscription_addons (0014) legibles por el tenant ───────
  // Writes son solo-service_role (route handlers de /internal); las creamos con
  // admin y verificamos que el PROPIO tenant las lee (policy tenant_read).
  const { error: flagErr } = await admin.from("tenant_flags").upsert(
    { tenant_id: tenantId, flag: "ai_enabled", enabled: true, note: "smoke p4-7" },
    { onConflict: "tenant_id,flag" },
  );
  if (flagErr) throw new Error("insert tenant_flags (admin): " + flagErr.message);

  const { data: sub, error: subErr } = await admin
    .from("subscriptions")
    .select("id")
    .eq("tenant_id", tenantId)
    .single();
  if (subErr) throw new Error("read subscription: " + subErr.message);

  const { error: addonErr } = await admin.from("subscription_addons").insert({
    tenant_id: tenantId,
    subscription_id: sub.id,
    addon_key: "ai",
    status: "active",
    source: "granted",
  });
  if (addonErr) throw new Error("insert subscription_addons (admin): " + addonErr.message);

  // Lectura con el cliente del PROPIO tenant (policy tenant_read).
  const { data: flags, error: rFlagErr } = await tenantClient
    .from("tenant_flags")
    .select("flag, enabled")
    .eq("tenant_id", tenantId);
  if (rFlagErr) throw new Error("read tenant_flags (tenant): " + rFlagErr.message);
  if (!flags.some((f) => f.flag === "ai_enabled" && f.enabled === true))
    throw new Error("FAIL: el tenant no lee su flag ai_enabled");

  const { data: addons, error: rAddErr } = await tenantClient
    .from("subscription_addons")
    .select("addon_key, status, source")
    .eq("tenant_id", tenantId);
  if (rAddErr) throw new Error("read subscription_addons (tenant): " + rAddErr.message);
  if (!addons.some((a) => a.addon_key === "ai" && a.status === "active"))
    throw new Error("FAIL: el tenant no lee su add-on de IA");
  console.log(
    "6. tenant_flags + subscription_addons legibles por el tenant OK (flag ai_enabled · addon ai/granted)",
  );

  console.log("\nSMOKE FASE 4-7: TODO OK");
} catch (err) {
  console.error("\nSMOKE FASE 4-7: FALLÓ ·", err.message);
  process.exitCode = 1;
} finally {
  // ── 7. Limpieza COMPLETA (service role) ───────────────────────────────────────
  // Orden: hijas vía join → tenant (cascada borra el resto por FK on delete cascade)
  // → auth.user. Igual patrón que el resto de los smokes.
  if (tenantId) {
    try {
      // recipe_ingredients y production_inputs cuelgan de recipes/productions del
      // tenant; los borramos por join antes del cascade del tenant (defensivo).
      const { data: recs } = await admin
        .from("recipes")
        .select("id")
        .eq("tenant_id", tenantId);
      const recIds = (recs ?? []).map((r) => r.id);
      if (recIds.length) {
        await admin.from("recipe_ingredients").delete().in("recipe_id", recIds);
      }
      const { data: prods } = await admin
        .from("productions")
        .select("id")
        .eq("tenant_id", tenantId);
      const prodIds = (prods ?? []).map((p) => p.id);
      if (prodIds.length) {
        await admin.from("production_inputs").delete().in("production_id", prodIds);
      }
      // El tenant tiene FK on delete cascade en todas las hijas (regulatory_permits,
      // tenant_flags, subscription_addons, recipes, productions, public_traces,
      // operating profile, etc.): un solo delete del tenant lo limpia todo.
      const { error: delTErr } = await admin
        .from("tenants")
        .delete()
        .eq("id", tenantId);
      if (delTErr) console.warn("cleanup tenant:", delTErr.message);
      else console.log("cleanup: tenant + hijas (cascade) borrados");
    } catch (e) {
      console.warn("cleanup tenant error:", e.message);
    }
  }
  if (userId) {
    const { error: delUErr } = await admin.auth.admin.deleteUser(userId);
    if (delUErr) console.warn("cleanup auth.user:", delUErr.message);
    else console.log("cleanup: auth.user borrado");
  }
}
