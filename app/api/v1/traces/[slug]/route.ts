import {
  apiError,
  apiJson,
  authenticateApiRequest,
  requireScope,
  unauthorized,
} from "@/lib/api/auth";
import { adminDb } from "@/lib/api/data";

// =============================================================================
// GET /api/v1/traces/:slug  (scope read:traces)
//
// Snapshot inmutable de la traza pública por slug. OJO: este mismo snapshot ya
// es público sin auth vía /t/:slug (página QR). Acá lo entregamos como JSON
// crudo (public_traces.payload) para integraciones del tenant — por eso exige
// key + scope y se scopea por tenant (no expone trazas de otros tenants aunque
// el slug sea global-único).
//
// Scoping: tenant resuelto por la key; .eq("tenant_id", tenantId) obligatorio.
// =============================================================================

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TraceRow = {
  slug: string;
  payload: unknown;
  created_at: string;
  views_count: number;
};

export async function GET(
  req: Request,
  { params }: { params: { slug: string } },
) {
  const auth = await authenticateApiRequest(req);
  if (!auth) return unauthorized();

  const denied = requireScope(auth, "read:traces");
  if (denied) return denied;

  // SCOPING: tenant resuelto por la key; filtramos por tenant_id Y slug.
  const { data, error } = await adminDb()
    .from("public_traces")
    .select("slug, payload, created_at, views_count")
    .eq("slug", params.slug)
    .eq("tenant_id", auth.tenantId)
    .maybeSingle();

  if (error) {
    return apiJson(
      { error: { code: "internal_error", message: "Error al leer la traza" } },
      500,
    );
  }
  if (!data) {
    return apiError("not_found", "Traza no encontrada");
  }

  const t = data as unknown as TraceRow;
  return apiJson({
    slug: t.slug,
    created_at: t.created_at,
    views_count: t.views_count,
    // payload: snapshot inmutable (no se edita jamás — regla §5).
    payload: t.payload,
  });
}
