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
// GET /api/v1/dispatches  (scope read:dispatches)
//
// Despachos del tenant con cliente (nombre / localidad) y los ítems (receta,
// lote de PT, kg). Paginación por cursor sobre created_at. Filtros: from, to
// (sobre dispatch_date).
//
// Scoping: tenant resuelto por la key; .eq("tenant_id", tenantId) + soft delete.
// =============================================================================

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function one<T>(rel: T | T[] | null | undefined): T | null {
  if (Array.isArray(rel)) return rel[0] ?? null;
  return rel ?? null;
}

type CustomerRel = { name: string; locality: string | null };
type RecipeRel = { title: string; rnpa_number: string | null };
type ProductionRel = {
  code: string;
  product_lot_number: string | null;
  product_expiry_date: string | null;
};
type ItemRel = {
  id: string;
  quantity_kg: number;
  recipe: RecipeRel | RecipeRel[] | null;
  production: ProductionRel | ProductionRel[] | null;
};

type DispatchRow = {
  id: string;
  dispatch_date: string;
  status: string;
  created_at: string;
  customer: CustomerRel | CustomerRel[] | null;
  items: ItemRel[] | null;
};

export async function GET(req: Request) {
  const auth = await authenticateApiRequest(req);
  if (!auth) return unauthorized();

  const denied = requireScope(auth, "read:dispatches");
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const limit = parseLimit(searchParams);
  const cursor = parseCursor(searchParams);
  const from = parseDate(searchParams.get("from"));
  const to = parseDate(searchParams.get("to"));

  // SCOPING: tenant resuelto por la key; filtramos SIEMPRE por tenant_id.
  let query = adminDb()
    .from("dispatches")
    .select(
      `id, dispatch_date, status, created_at,
       customer:customers(name, locality),
       items:dispatch_items(
         id, quantity_kg,
         recipe:recipes(title, rnpa_number),
         production:productions(code, product_lot_number, product_expiry_date)
       )`,
    )
    .eq("tenant_id", auth.tenantId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit + 1);

  if (cursor) query = query.lt("created_at", cursor);
  if (from) query = query.gte("dispatch_date", from);
  if (to) query = query.lte("dispatch_date", to);

  const { data, error } = await query;
  if (error) {
    return apiJson(
      { error: { code: "internal_error", message: "Error al leer despachos" } },
      500,
    );
  }

  const rows = (data ?? []) as unknown as DispatchRow[];
  const { data: pageRows, next_cursor } = buildPage(
    rows,
    limit,
    (r) => r.created_at,
  );

  const items = pageRows.map((d) => {
    const customer = one(d.customer);
    return {
      id: d.id,
      dispatch_date: d.dispatch_date,
      status: d.status,
      customer: customer
        ? { name: customer.name, locality: customer.locality }
        : null,
      items: (d.items ?? []).map((it) => {
        const recipe = one(it.recipe);
        const production = one(it.production);
        return {
          quantity_kg: it.quantity_kg,
          recipe: recipe
            ? { title: recipe.title, rnpa_number: recipe.rnpa_number }
            : null,
          product_lot_number: production?.product_lot_number ?? null,
          product_expiry_date: production?.product_expiry_date ?? null,
          production_code: production?.code ?? null,
        };
      }),
    };
  });

  return apiJson({ data: items, next_cursor });
}
