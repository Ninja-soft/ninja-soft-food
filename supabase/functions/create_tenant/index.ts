// Edge Function: create_tenant
// Crea tenant + owner + suscripción trial (14 días, plan start) + branding,
// y setea app_metadata.tenant_id en el JWT del usuario (patrón POS).
// Se invoca autenticada (Authorization: Bearer <jwt del usuario>).

import { createClient } from "jsr:@supabase/supabase-js@2";

const TRIAL_DAYS = 14;

type Payload = {
  businessName?: string;
  industry?: string;
};

const INDUSTRIES = new Set([
  "frigorifico",
  "panaderia",
  "lacteos",
  "conservas",
  "catering",
  "otro",
]);

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "tenant"
  );
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return Response.json({ error: "method_not_allowed" }, { status: 405 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  // Usuario que invoca (JWT del header)
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  const {
    data: { user },
    error: userError,
  } = await admin.auth.getUser(jwt);

  if (userError || !user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  // Idempotencia: si ya tiene tenant, devolverlo
  const existingTenantId = (user.app_metadata as Record<string, unknown>)
    ?.tenant_id;
  if (typeof existingTenantId === "string" && existingTenantId.length > 0) {
    return Response.json({ tenant_id: existingTenantId, existing: true });
  }

  let payload: Payload = {};
  try {
    payload = await req.json();
  } catch {
    // body vacío permitido
  }

  const businessName = (payload.businessName ?? "").trim() || "Mi empresa";
  const industry = INDUSTRIES.has(payload.industry ?? "")
    ? payload.industry!
    : "otro";

  // Slug único
  const base = slugify(businessName);
  const slug = `${base}-${crypto.randomUUID().slice(0, 6)}`;

  const trialEndsAt = new Date(
    Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  // 1. Tenant
  const { data: tenant, error: tenantError } = await admin
    .from("tenants")
    .insert({
      name: businessName,
      slug,
      industry,
      status: "trial",
      trial_ends_at: trialEndsAt,
    })
    .select("id")
    .single();

  if (tenantError || !tenant) {
    console.error("create_tenant: tenant insert failed", tenantError);
    return Response.json({ error: "tenant_creation_failed" }, { status: 500 });
  }

  // 2. Owner
  const { error: tuError } = await admin.from("tenant_users").insert({
    tenant_id: tenant.id,
    user_id: user.id,
    role: "owner",
  });
  if (tuError) {
    console.error("create_tenant: tenant_users insert failed", tuError);
    return Response.json({ error: "owner_creation_failed" }, { status: 500 });
  }

  // 3. Suscripción trial (plan start)
  const { data: plan } = await admin
    .from("plans")
    .select("id")
    .eq("key", "start")
    .single();

  if (plan) {
    await admin.from("subscriptions").insert({
      tenant_id: tenant.id,
      plan_id: plan.id,
      status: "trial",
      provider: "manual",
      current_period_start: new Date().toISOString(),
      current_period_end: trialEndsAt,
    });
  }

  // 4. Branding por defecto (sello ABR activo)
  await admin.from("tenant_branding").insert({ tenant_id: tenant.id });

  // 5. Establecimiento por defecto
  await admin.from("establishments").insert({
    tenant_id: tenant.id,
    name: businessName,
    is_default: true,
  });

  // 6. Claim tenant_id en el JWT
  const { error: claimError } = await admin.auth.admin.updateUserById(
    user.id,
    {
      app_metadata: { tenant_id: tenant.id },
    },
  );
  if (claimError) {
    console.error("create_tenant: claim update failed", claimError);
    return Response.json({ error: "claim_update_failed" }, { status: 500 });
  }

  return Response.json({ tenant_id: tenant.id });
});
