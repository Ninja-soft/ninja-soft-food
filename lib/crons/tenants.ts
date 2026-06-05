import type { createAdminClient } from "@/lib/supabase/admin";

// =============================================================================
// lib/crons/tenants.ts — utilidades compartidas por los jobs por-tenant.
//
// Resolución del owner (mismo patrón que el webhook MP: tenant_users role owner
// → users.email) y chequeo anti-spam sobre system_emails. Lectura con admin
// client (service_role): system_emails / tenant_users no tienen policy para
// authenticated.
// =============================================================================

type AdminClient = ReturnType<typeof createAdminClient>;

/** Email del owner de un tenant, o null si no se puede resolver. */
export async function getTenantOwnerEmail(
  admin: AdminClient,
  tenantId: string
): Promise<string | null> {
  const { data: owner } = await admin
    .from("tenant_users")
    .select("user_id, users(email)")
    .eq("tenant_id", tenantId)
    .eq("role", "owner")
    .maybeSingle();
  const userRel = (
    owner as { users?: { email?: string } | { email?: string }[] } | null
  )?.users;
  const ownerRow = Array.isArray(userRel) ? userRel[0] : userRel;
  return ownerRow?.email ?? null;
}

/**
 * Timestamp del último email de un tipo dado enviado a un tenant, dentro de la
 * ventana `sinceIso`. Devuelve null si no hubo ninguno. Filtra por subject:
 * system_emails no guarda template_key, así que el llamador pasa el subject
 * exacto del template para acotar (subjects de templates de sistema son únicos).
 */
export async function lastEmailSentAt(
  admin: AdminClient,
  args: {
    tenantId: string;
    subject: string;
    sinceIso: string;
  }
): Promise<string | null> {
  const { data } = await admin
    .from("system_emails")
    .select("created_at")
    .eq("tenant_id", args.tenantId)
    .eq("subject", args.subject)
    .gte("created_at", args.sinceIso)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.created_at ?? null;
}
