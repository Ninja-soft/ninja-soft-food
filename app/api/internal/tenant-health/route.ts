import { NextResponse } from "next/server";
import { requireInternal } from "@/modules/internal/server";
import { getTenantHealth } from "@/modules/internal-ops/server";

// GET /api/internal/tenant-health?tenantId= — salud operativa del tenant.
export const runtime = "nodejs";

export async function GET(req: Request) {
  if (!(await requireInternal({ api: true }))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const tenantId =
    new URL(req.url).searchParams.get("tenantId")?.trim() ?? "";
  if (!tenantId) {
    return NextResponse.json({ error: "missing_tenant" }, { status: 400 });
  }
  try {
    const health = await getTenantHealth(tenantId);
    return NextResponse.json({ health });
  } catch {
    return NextResponse.json({ error: "lookup_failed" }, { status: 500 });
  }
}
