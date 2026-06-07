import { createClient } from "@/lib/supabase/client";
import { getCountryProfile } from "@/lib/globalization/countries";
import { getTenantId } from "@/lib/utils/tenant";

// Datos de origen para planillas PDF y resúmenes Excel. Toda lectura respeta el
// soft delete (.is("deleted_at", null)) donde la tabla lo soporta. El branding
// (nombre + logo del tenant) NUNCA se hardcodea: sale de tenants + tenant_branding.

// ── Branding del tenant ──────────────────────────────────────────────────────

export type TenantBranding = {
  name: string;
  legalName: string | null;
  logoUrl: string | null;
  cuit: string | null;
  address: string | null;
  /** Locale del tenant (operating profile) para formatear fechas/números en PDFs/Excel. */
  locale: string;
  /** Moneda del tenant (operating profile), ISO 4217. */
  currency: string;
  /** Color primario de las planillas PDF (hex). null → fallback Ninja Food. */
  pdfPrimaryColor: string | null;
  /** Color secundario/acento de las planillas PDF (hex). null → fallback. */
  pdfSecondaryColor: string | null;
};

export async function getTenantBranding(): Promise<TenantBranding> {
  const supabase = createClient();
  const tenantId = await getTenantId();
  const { data, error } = await supabase
    .from("tenants")
    .select(
      "name, cuit, country, branding:tenant_branding(legal_name, logo_url, cuit, address, pdf_primary_color, pdf_secondary_color)",
    )
    .eq("id", tenantId)
    .single();
  if (error) throw error;
  const branding = (
    Array.isArray(data.branding) ? data.branding[0] : data.branding
  ) as {
    legal_name: string | null;
    logo_url: string | null;
    cuit: string | null;
    address: string | null;
    pdf_primary_color: string | null;
    pdf_secondary_color: string | null;
  } | null;

  // Locale/currency salen del operating profile del tenant; si no está cargado,
  // caemos al perfil de país (lib/globalization). NUNCA hardcodear es-AR.
  const { data: opProfile } = await supabase
    .from("tenant_operating_profiles")
    .select("locale, currency")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const countryFallback = getCountryProfile(
    (data as { country?: string | null }).country,
  );

  return {
    name: data.name,
    legalName: branding?.legal_name ?? null,
    logoUrl: branding?.logo_url ?? null,
    cuit: branding?.cuit ?? data.cuit ?? null,
    address: branding?.address ?? null,
    locale: opProfile?.locale ?? countryFallback.locale,
    currency: opProfile?.currency ?? countryFallback.currency,
    pdfPrimaryColor: branding?.pdf_primary_color ?? null,
    pdfSecondaryColor: branding?.pdf_secondary_color ?? null,
  };
}

// ── Detalle de una producción (planilla individual) ──────────────────────────

export type ProductionInputDetail = {
  id: string;
  ingredient_name: string;
  taken_qty: number;
  required_qty: number;
  unit: string;
  is_substitute: boolean;
  lot_number: string | null;
  supplier_name: string | null;
  supplier_rne: string | null;
  expiry_date: string | null;
};

export type ProductionDetail = {
  id: string;
  code: string;
  status: "draft" | "completed" | "voided";
  production_date: string;
  packaging_date: string | null;
  quantity_kg: number | null;
  product_lot_number: string | null;
  product_expiry_date: string | null;
  photo_url: string | null;
  notes: string | null;
  recipe: {
    title: string;
    commercial_name: string | null;
    rnpa_number: string | null;
    rnpa_exempt: boolean;
    category: string;
  } | null;
  manager: { full_name: string; position: string | null } | null;
  trace_slug: string | null;
  inputs: ProductionInputDetail[];
};

export async function getProductionDetail(
  id: string,
): Promise<ProductionDetail> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("productions")
    .select(
      `id, code, status, production_date, packaging_date, quantity_kg,
       product_lot_number, product_expiry_date, photo_url, notes,
       recipe:recipes(title, commercial_name, rnpa_number, rnpa_exempt, category),
       manager:members(full_name, position),
       trace:public_traces(slug),
       production_inputs(
         id, taken_qty, required_qty, is_substitute,
         ingredient:ingredients!production_inputs_ingredient_id_fkey(name, unit),
         stock_entry:stock_entries(
           lot_number, expiry_date, unit,
           supplier:suppliers(name, rne_number)
         )
       )`,
    )
    .eq("id", id)
    .is("deleted_at", null)
    .single();
  if (error) throw error;

  type RawInput = {
    id: string;
    taken_qty: number;
    required_qty: number;
    is_substitute: boolean;
    ingredient: { name: string; unit: string } | null;
    stock_entry: {
      lot_number: string;
      expiry_date: string | null;
      unit: string;
      supplier: { name: string; rne_number: string | null } | null;
    } | null;
  };

  const raw = data as unknown as {
    id: string;
    code: string;
    status: ProductionDetail["status"];
    production_date: string;
    packaging_date: string | null;
    quantity_kg: number | null;
    product_lot_number: string | null;
    product_expiry_date: string | null;
    photo_url: string | null;
    notes: string | null;
    recipe: ProductionDetail["recipe"];
    manager: ProductionDetail["manager"];
    trace: { slug: string }[] | { slug: string } | null;
    production_inputs: RawInput[];
  };

  const trace = Array.isArray(raw.trace) ? raw.trace[0] : raw.trace;

  const inputs: ProductionInputDetail[] = (raw.production_inputs ?? []).map(
    (ri) => ({
      id: ri.id,
      ingredient_name: ri.ingredient?.name ?? "(sin nombre)",
      taken_qty: ri.taken_qty,
      required_qty: ri.required_qty,
      unit: ri.stock_entry?.unit ?? ri.ingredient?.unit ?? "",
      is_substitute: ri.is_substitute,
      lot_number: ri.stock_entry?.lot_number ?? null,
      supplier_name: ri.stock_entry?.supplier?.name ?? null,
      supplier_rne: ri.stock_entry?.supplier?.rne_number ?? null,
      expiry_date: ri.stock_entry?.expiry_date ?? null,
    }),
  );

  return {
    id: raw.id,
    code: raw.code,
    status: raw.status,
    production_date: raw.production_date,
    packaging_date: raw.packaging_date,
    quantity_kg: raw.quantity_kg,
    product_lot_number: raw.product_lot_number,
    product_expiry_date: raw.product_expiry_date,
    photo_url: raw.photo_url,
    notes: raw.notes,
    recipe: raw.recipe,
    manager: raw.manager,
    trace_slug: trace?.slug ?? null,
    inputs,
  };
}

// ── Producciones en rango (planilla semanal / masiva) ────────────────────────

export type ProductionSummaryRow = {
  id: string;
  code: string;
  production_date: string;
  recipe_title: string;
  quantity_kg: number | null;
  product_lot_number: string | null;
  product_expiry_date: string | null;
};

export async function listProductionsInRange(
  from: string,
  to: string,
): Promise<ProductionSummaryRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("productions")
    .select(
      `id, code, production_date, quantity_kg, product_lot_number,
       product_expiry_date, recipe:recipes(title)`,
    )
    .is("deleted_at", null)
    .gte("production_date", from)
    .lte("production_date", to)
    .order("production_date", { ascending: true })
    .order("code", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((p) => {
    const recipe = (
      Array.isArray(p.recipe) ? p.recipe[0] : p.recipe
    ) as { title: string } | null;
    return {
      id: p.id,
      code: p.code,
      production_date: p.production_date,
      recipe_title: recipe?.title ?? "-",
      quantity_kg: p.quantity_kg,
      product_lot_number: p.product_lot_number,
      product_expiry_date: p.product_expiry_date,
    };
  });
}

// ── Ingresos de stock en rango (planilla semanal de ingresos) ────────────────

export type StockSummaryRow = {
  id: string;
  created_at: string;
  ingredient_name: string;
  lot_number: string;
  supplier_name: string | null;
  quantity: number;
  unit: string;
  expiry_date: string | null;
};

export async function listStockEntriesInRange(
  from: string,
  to: string,
): Promise<StockSummaryRow[]> {
  const supabase = createClient();
  // El rango es por día calendario: incluimos todo el día `to`.
  const toEnd = `${to}T23:59:59.999`;
  const { data, error } = await supabase
    .from("stock_entries")
    .select(
      `id, created_at, quantity, unit, lot_number, expiry_date,
       ingredient:ingredients(name), supplier:suppliers(name)`,
    )
    .is("deleted_at", null)
    .gte("created_at", from)
    .lte("created_at", toEnd)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((e) => {
    const ingredient = (
      Array.isArray(e.ingredient) ? e.ingredient[0] : e.ingredient
    ) as { name: string } | null;
    const supplier = (
      Array.isArray(e.supplier) ? e.supplier[0] : e.supplier
    ) as { name: string } | null;
    return {
      id: e.id,
      created_at: e.created_at,
      ingredient_name: ingredient?.name ?? "(sin nombre)",
      lot_number: e.lot_number,
      supplier_name: supplier?.name ?? null,
      quantity: e.quantity,
      unit: e.unit,
      expiry_date: e.expiry_date,
    };
  });
}
