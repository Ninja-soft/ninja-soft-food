import { NextResponse } from "next/server";
import { requireInternal } from "@/modules/internal/server";
import { getAuditFacets } from "@/modules/internal-ops/server";

// GET /api/internal/audit-facets — distinct de entity_type / action para los
// selects de filtro del log de auditoría.
export const runtime = "nodejs";

export async function GET() {
  if (!(await requireInternal({ api: true }))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  try {
    const facets = await getAuditFacets();
    return NextResponse.json(facets);
  } catch {
    return NextResponse.json({ error: "lookup_failed" }, { status: 500 });
  }
}
