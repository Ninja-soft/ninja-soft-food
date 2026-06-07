import { NextResponse } from "next/server";
import { requireInternal } from "@/modules/internal/server";
import { listGlobalUsers } from "@/modules/internal-ops/server";

// GET /api/internal/users?search= — listado global de cuentas (admin client).
export const runtime = "nodejs";

export async function GET(req: Request) {
  if (!(await requireInternal({ api: true }))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const search = new URL(req.url).searchParams.get("search") ?? undefined;
  try {
    const users = await listGlobalUsers({ search });
    return NextResponse.json({ users });
  } catch {
    return NextResponse.json({ error: "lookup_failed" }, { status: 500 });
  }
}
