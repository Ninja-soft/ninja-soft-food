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
  parseLimit,
} from "@/lib/api/data";

// =============================================================================
// GET /api/v1/stock  (scope read:stock)
//
// Lotes de materia prima con stock disponible (remaining_quantity > 0) del
// tenant. Columnas reales (modules/stock/api.ts): quantity, remaining_quantity,
// lot_number, expiry_date. Paginación por cursor sobre created_at.
//
// Scoping: tenant resuelto por la key; .eq("tenant_id", tenantId) + soft delete.
// =============================================================================

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function one<T>(rel: T | T[] | null | undefined): T | null {
  if (Array.isArray(rel)) return rel[0] ?? null;
  return rel ?? null;
}

type IngredientRel = { name: string; unit: string };
type SupplierRel = { name: string; rne_number: string | null };

type StockRow = {
  id: string;
  lot_number: string;
  quantity: number;
  remaining_quantity: number;
  unit: string;
  expiry_date: string | null;
  manufacture_date: string | null;
  is_frozen: boolean;
  created_at: string;
  ingredient: IngredientRel | IngredientRel[] | null;
  supplier: SupplierRel | SupplierRel[] | null;
};

export async function GET(req: Request) {
  const auth = await authenticateApiRequest(req);
  if (!auth) return unauthorized();

  const denied = requireScope(auth, "read:stock");
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const limit = parseLimit(searchParams);
  const cursor = parseCursor(searchParams);
  const lot = searchParams.get("lot")?.trim();

  // SCOPING: tenant resuelto por la key; filtramos SIEMPRE por tenant_id.
  let query = adminDb()
    .from("stock_entries")
    .select(
      `id, lot_number, quantity, remaining_quantity, unit, expiry_date,
       manufacture_date, is_frozen, created_at,
       ingredient:ingredients(name, unit),
       supplier:suppliers(name, rne_number)`,
    )
    .eq("tenant_id", auth.tenantId)
    .is("deleted_at", null)
    .gt("remaining_quantity", 0)
    .order("created_at", { ascending: false })
    .limit(limit + 1);

  if (cursor) query = query.lt("created_at", cursor);
  if (lot) query = query.ilike("lot_number", `%${lot}%`);

  const { data, error } = await query;
  if (error) {
    return apiJson(
      { error: { code: "internal_error", message: "Error al leer el stock" } },
      500,
    );
  }

  const rows = (data ?? []) as unknown as StockRow[];
  const { data: pageRows, next_cursor } = buildPage(
    rows,
    limit,
    (r) => r.created_at,
  );

  const items = pageRows.map((s) => {
    const ing = one(s.ingredient);
    const sup = one(s.supplier);
    return {
      id: s.id,
      ingredient: ing?.name ?? null,
      lot_number: s.lot_number,
      quantity: s.quantity,
      remaining_quantity: s.remaining_quantity,
      unit: s.unit,
      expiry_date: s.expiry_date,
      manufacture_date: s.manufacture_date,
      is_frozen: s.is_frozen,
      supplier: sup?.name ?? null,
      supplier_rne: sup?.rne_number ?? null,
    };
  });

  return apiJson({ data: items, next_cursor });
}
