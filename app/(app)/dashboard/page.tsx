import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardClient } from "@/components/dashboard/DashboardClient";

// Dashboard del tenant (Fase 2). Server component fino: resuelve el nombre del
// tenant (patrón del dashboard del POS) y delega los KPIs/charts/alertas al
// cliente, que los agrega vía modules/dashboard.
export default async function DashboardPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // El layout (app) ya garantiza sesión + tenant; doble check defensivo.
  if (!user) redirect("/login");
  const tenantId = (user.app_metadata as Record<string, unknown>)?.tenant_id;
  if (typeof tenantId !== "string" || !tenantId) redirect("/onboarding");

  const { data: tenant } = await supabase
    .from("tenants")
    .select("name")
    .eq("id", tenantId)
    .single();

  return <DashboardClient tenantName={tenant?.name ?? "Mi empresa"} />;
}
