import {
  apiJson,
  authenticateApiRequest,
  requireScope,
  unauthorized,
} from "@/lib/api/auth";
import {
  adminDb,
  buildPage,
  parseCursor,
  parseDate,
  parseLimit,
} from "@/lib/api/data";

// =============================================================================
// GET /api/v1/productions  (scope read:productions)
//
// Lista de producciones COMPLETADAS del tenant. Paginación por cursor sobre
// created_at (descendente). Filtros query: from, to (YYYY-MM-DD, sobre
// production_date), lot (product_lot_number, coincidencia parcial).
//
// Scoping: el tenant se resuelve por la API key (sin JWT). Toda query lleva
// .eq("tenant_id", tenantId) + .is("deleted_at", null) — ver lib/api/data.ts.
// =============================================================================

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProductionRow = {
  id: string;
  code: string;
  production_date: string;
  quantity_kg: number | null;
  product_lot_number: string | null;
  product_expiry_date: string | null;
  created_at: string;
  recipe: { title: string; rnpa_number: string | null } | { title: string; rnpa_number: string | null }[] | null;
  trace: { slug: string }[] | null;
};

function one<T>(rel: T | T[] | null | undefined): T | null {
  if (Array.isArray(rel)) return rel[0] ?? null;
  return rel ?? null;
}

export async function GET(req: Request) {
  const auth = await authenticateApiRequest(req);
  if (!auth) return unauthorized();

  const denied = requireScope(auth, "read:productions");
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const limit = parseLimit(searchParams);
  const cursor = parseCursor(searchParams);
  const from = parseDate(searchParams.get("from"));
  const to = parseDate(searchParams.get("to"));
  const lot = searchParams.get("lot")?.trim();

  // SCOPING: tenant resuelto por la key; filtramos SIEMPRE por tenant_id.
  let query = adminDb()
    .from("productions")
    .select(
      `id, code, production_date, quantity_kg, product_lot_number,
       product_expiry_date, created_at,
       recipe:recipes(title, rnpa_number),
       trace:public_traces(slug)`,
    )
    .eq("tenant_id", auth.tenantId)
    .is("deleted_at", null)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(limit + 1);

  if (cursor) query = query.lt("created_at", cursor);
  if (from) query = query.gte("production_date", from);
  if (to) query = query.lte("production_date", to);
  if (lot) query = query.ilike("product_lot_number", `%${lot}%`);

  const { data, error } = await query;
  if (error) {
    return apiJson(
      { error: { code: "internal_error", message: "Error al leer producciones" } },
      500,
    );
  }

  const rows = (data ?? []) as unknown as ProductionRow[];
  const { data: pageRows, next_cursor } = buildPage(
    rows,
    limit,
    (r) => r.created_at,
  );

  const items = pageRows.map((p) => {
    const recipe = one(p.recipe);
    return {
      id: p.id,
      code: p.code,
      production_date: p.production_date,
      quantity_kg: p.quantity_kg,
      product_lot_number: p.product_lot_number,
      product_expiry_date: p.product_expiry_date,
      recipe: recipe
        ? { title: recipe.title, rnpa_number: recipe.rnpa_number }
        : null,
      trace_slug: p.trace?.[0]?.slug ?? null,
    };
  });

  return apiJson({ data: items, next_cursor });
}
