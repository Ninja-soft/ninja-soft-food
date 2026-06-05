import { PlansTable } from "@/components/internal/PlansTable";
import { requireInternal } from "@/modules/internal/server";

// Editor de precios de planes (panel staff Ninja-Soft).
// Server component: requireInternal() resuelve el nivel del staff y lo baja al
// cliente para el gating de UI (solo admin edita). El gating real vive en el
// route handler /api/internal/update-plan; esto es solo experiencia.

export const dynamic = "force-dynamic";

export default async function InternalPlansPage() {
  const actor = await requireInternal();
  // requireInternal() ya redirige si no es staff; el assertion es seguro.
  return <PlansTable level={actor!.level} />;
}
