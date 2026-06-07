import { NextResponse } from "next/server";
import { requireInternal } from "@/modules/internal/server";
import { listTenantFlags } from "@/modules/internal-billing/server";

// GET /api/internal/flags?tenantId=… — feature flags por tenant (string libre).

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
    const flags = await listTenantFlags(tenantId);
    return NextResponse.json({ flags });
  } catch {
    return NextResponse.json({ error: "lookup_failed" }, { status: 500 });
  }
}
