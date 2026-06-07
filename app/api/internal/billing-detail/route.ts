import { NextResponse } from "next/server";
import { requireInternal } from "@/modules/internal/server";
import { getBillingDetail } from "@/modules/internal-billing/server";

// GET /api/internal/billing-detail?tenantId=… — detalle de cobros del tenant
// (suscripción + modo de cobro, pagos manuales, add-on IA). Solo staff.

export const runtime = "nodejs";

export async function GET(req: Request) {
  if (!(await requireInternal({ api: true }))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const tenantId = new URL(req.url).searchParams.get("tenantId")?.trim();
  if (!tenantId) {
    return NextResponse.json({ error: "missing_tenant" }, { status: 400 });
  }
  try {
    const detail = await getBillingDetail(tenantId);
    return NextResponse.json({ detail });
  } catch {
    return NextResponse.json({ error: "lookup_failed" }, { status: 500 });
  }
}
