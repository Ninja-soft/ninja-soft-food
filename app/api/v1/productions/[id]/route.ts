import {
  apiError,
  apiJson,
  authenticateApiRequest,
  requireScope,
  unauthorized,
} from "@/lib/api/auth";
import { adminDb } from "@/lib/api/data";

// =============================================================================
// GET /api/v1/productions/:id  (scope read:productions)
//
// Detalle de una producción del tenant + sus insumos (cadena de trazabilidad
// hacia atrás): ingrediente, lote de MP, proveedor y su RNE.
//
// Scoping: tenant resuelto por la key; .eq("tenant_id", tenantId) en TODA query.
// =============================================================================

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function one<T>(rel: T | T[] | null | undefined): T | null {
  if (Array.isArray(rel)) return rel[0] ?? null;
  return rel ?? null;
}

type RecipeRel = { title: string; rnpa_number: string | null };
type SupplierRel = { name: string; rne_number: string | null };
type IngredientRel = { name: string; unit: string };
type StockEntryRel = {
  lot_number: string;
  expiry_date: string | null;
  supplier: SupplierRel | SupplierRel[] | null;
};
type InputRel = {
  id: string;
  taken_qty: number;
  is_substitute: boolean;
  ingredient: IngredientRel | IngredientRel[] | null;
  stock_entry: StockEntryRel | StockEntryRel[] | null;
};

type ProductionDetailRow = {
  id: string;
  code: string;
  status: string;
  production_date: string;
  packaging_date: string | null;
  quantity_kg: number | null;
  product_lot_number: string | null;
  product_expiry_date: string | null;
  notes: string | null;
  created_at: string;
  recipe: RecipeRel | RecipeRel[] | null;
  trace: { slug: string }[] | null;
  inputs: InputRel[] | null;
};

export async function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  const auth = await authenticateApiRequest(req);
  if (!auth) return unauthorized();

  const denied = requireScope(auth, "read:productions");
  if (denied) return denied;

  // SCOPING: tenant resuelto por la key; .eq("tenant_id", tenantId) obligatorio.
  const { data, error } = await adminDb()
    .from("productions")
    .select(
      `id, code, status, production_date, packaging_date, quantity_kg,
       product_lot_number, product_expiry_date, notes, created_at,
       recipe:recipes(title, rnpa_number),
       trace:public_traces(slug),
       inputs:production_inputs(
         id, taken_qty, is_substitute,
         ingredient:ingredients!production_inputs_ingredient_id_fkey(name, unit),
         stock_entry:stock_entries(
           lot_number, expiry_date,
           supplier:suppliers(name, rne_number)
         )
       )`,
    )
    .eq("id", params.id)
    .eq("tenant_id", auth.tenantId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    return apiJson(
      { error: { code: "internal_error", message: "Error al leer la producción" } },
      500,
    );
  }
  if (!data) {
    return apiError("not_found", "Producción no encontrada");
  }

  const p = data as unknown as ProductionDetailRow;
  const recipe = one(p.recipe);

  const inputs = (p.inputs ?? []).map((i) => {
    const ing = one(i.ingredient);
    const se = one(i.stock_entry);
    const sup = se ? one(se.supplier) : null;
    return {
      ingredient: ing?.name ?? null,
      unit: ing?.unit ?? null,
      taken_qty: i.taken_qty,
      is_substitute: i.is_substitute,
      lot_number: se?.lot_number ?? null,
      lot_expiry_date: se?.expiry_date ?? null,
      supplier: sup?.name ?? null,
      supplier_rne: sup?.rne_number ?? null,
    };
  });

  return apiJson({
    id: p.id,
    code: p.code,
    status: p.status,
    production_date: p.production_date,
    packaging_date: p.packaging_date,
    quantity_kg: p.quantity_kg,
    product_lot_number: p.product_lot_number,
    product_expiry_date: p.product_expiry_date,
    notes: p.notes,
    recipe: recipe
      ? { title: recipe.title, rnpa_number: recipe.rnpa_number }
      : null,
    trace_slug: p.trace?.[0]?.slug ?? null,
    inputs,
  });
}
