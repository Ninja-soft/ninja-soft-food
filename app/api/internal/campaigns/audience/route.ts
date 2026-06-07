import { NextResponse } from "next/server";
import { requireInternal } from "@/modules/internal/server";
import { normalizeFilter, parseAudience } from "@/modules/internal-campaigns/schemas";
import { resolveAudience } from "@/modules/internal-campaigns/server";

// =============================================================================
// POST /api/internal/campaigns/audience — preview (dry-run) de la audiencia.
//
// Recibe los filtros combinables y devuelve la lista de tenants candidatos con
// nombre, email del owner y el total. Solo staff (requireInternal). Es la base
// del flujo: el boton "Enviar" se habilita solo despues de un preview fresco,
// y el envio re-valida el conteo exacto contra esta misma resolucion.
// =============================================================================

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!(await requireInternal({ api: true }))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = parseAudience(raw);
  if (!parsed.ok || !parsed.data) {
    return NextResponse.json(
      { error: parsed.error ?? "invalid_input" },
      { status: 400 },
    );
  }

  try {
    const members = await resolveAudience(normalizeFilter(parsed.data.filter));
    return NextResponse.json({
      total: members.length,
      members: members.map((m) => ({
        tenantId: m.tenantId,
        tenantName: m.tenantName,
        ownerEmail: m.ownerEmail,
        ownerName: m.ownerName,
        status: m.status,
        planKey: m.planKey,
        billingMode: m.billingMode,
        country: m.country,
      })),
    });
  } catch {
    return NextResponse.json({ error: "audience_failed" }, { status: 500 });
  }
}
