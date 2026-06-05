import { createClient } from "@/lib/supabase/client";

/** tenant_id del JWT de la sesión actual (claim app_metadata.tenant_id). */
export async function getTenantId(): Promise<string> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const tenantId = session?.user.app_metadata?.tenant_id;
  if (typeof tenantId !== "string" || !tenantId) {
    throw new Error("Sesión sin empresa asociada");
  }
  return tenantId;
}
