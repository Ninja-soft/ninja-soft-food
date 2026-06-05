import { InternalShell } from "@/components/layout/InternalShell";
import { QueryProvider } from "@/lib/providers/QueryProvider";
import { requireInternal } from "@/modules/internal/server";

// Guard del panel staff Ninja-Soft. Server component: exige sesión + staff
// (users.is_internal). requireInternal redirige a /login si no hay sesión, o a
// /dashboard si el usuario está logueado pero no es staff. Patrón POS
// (app/internal/layout.tsx) adaptado a la fuente de verdad de Ninja Food:
// users.is_internal en lugar de app_metadata.

export default async function InternalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const actor = await requireInternal();
  // requireInternal() ya redirige; el non-null assertion es seguro acá.
  const staff = actor!;

  return (
    <QueryProvider>
      <InternalShell
        email={staff.email}
        name={staff.fullName ?? ""}
        level={staff.level}
      >
        {children}
      </InternalShell>
    </QueryProvider>
  );
}
