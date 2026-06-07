import { NextResponse } from "next/server";
import { requireInternal } from "@/modules/internal/server";
import { listStaff } from "@/modules/internal-ops/server";

// GET /api/internal/staff — listado de staff Ninja-Soft (is_internal = true).
export const runtime = "nodejs";

export async function GET() {
  if (!(await requireInternal({ api: true }))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  try {
    const staff = await listStaff();
    return NextResponse.json({ staff });
  } catch {
    return NextResponse.json({ error: "lookup_failed" }, { status: 500 });
  }
}
