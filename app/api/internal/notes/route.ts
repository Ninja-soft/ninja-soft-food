import { NextResponse } from "next/server";
import { requireInternal } from "@/modules/internal/server";
import { listInternalNotes } from "@/modules/internal-billing/server";

// GET /api/internal/notes?tenantId=… — notas internas del tenant (CRM staff).

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
    const notes = await listInternalNotes(tenantId);
    return NextResponse.json({ notes });
  } catch {
    return NextResponse.json({ error: "lookup_failed" }, { status: 500 });
  }
}
