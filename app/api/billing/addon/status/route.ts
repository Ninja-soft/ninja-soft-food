import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantAddonStatus } from "@/lib/billing/addon-status";

// =============================================================================
// GET /api/billing/addon/status — estado del add-on IA del tenant de la sesión.
//
// Authenticated (NO internal): el owner/usuario logueado consulta el estado de
// su propio tenant para renderizar la card "Asistente IA" en /configuracion.
// Resuelve el tenant del claim app_metadata.tenant_id. Devuelve TenantAddonStatus
// (included / addonActive / source / preapproval / precio). El flag `pending`
// del redirect lo aporta el cliente (query param ?addon=pending), no este endpoint.
// =============================================================================

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const tenantId = (user.app_metadata as { tenant_id?: string })?.tenant_id;
  if (typeof tenantId !== "string" || !tenantId) {
    return NextResponse.json({ error: "no_tenant" }, { status: 400 });
  }

  const status = await getTenantAddonStatus(tenantId);
  return NextResponse.json(status);
}
