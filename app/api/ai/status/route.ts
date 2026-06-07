import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { tenantHasAI } from "@/lib/ai/access";

// =============================================================================
// GET /api/ai/status — ¿el tenant de la sesión tiene IA habilitada?
//
// Authenticated (NO internal): cualquier usuario logueado lo consulta para su
// propio tenant. Resuelve el tenant del claim app_metadata.tenant_id (igual que
// lib/utils/tenant.getTenantId, pero server-side). Devuelve { enabled }.
// Lo consume la UI de recetas en la fase siguiente para mostrar/ocultar las
// acciones de IA. enabled=false ante cualquier ausencia de sesión/tenant.
// =============================================================================

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ enabled: false }, { status: 401 });
  }

  const tenantId = user.app_metadata?.tenant_id;
  if (typeof tenantId !== "string" || !tenantId) {
    return NextResponse.json({ enabled: false });
  }

  const enabled = await tenantHasAI(tenantId);
  return NextResponse.json({ enabled });
}
