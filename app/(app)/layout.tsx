import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { createClient } from "@/lib/supabase/server";

// Guard del grupo (app): exige sesión y tenant. Patrón POS.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const tenantId = (user.app_metadata as Record<string, unknown>)?.tenant_id;
  if (typeof tenantId !== "string" || !tenantId) redirect("/onboarding");

  const { data: tenant } = await supabase
    .from("tenants")
    .select("name")
    .eq("id", tenantId)
    .single();

  const userName =
    (user.user_metadata as Record<string, string>)?.full_name ??
    user.email ??
    "Usuario";

  return (
    <AppShell
      userName={userName}
      userEmail={user.email ?? ""}
      tenantName={(tenant?.name as string) ?? "Mi empresa"}
    >
      {children}
    </AppShell>
  );
}
