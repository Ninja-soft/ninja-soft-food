import { createClient } from "@/lib/supabase/client";
import { getTenantId } from "@/lib/utils/tenant";
import type { StockEntryInput, SupplierInput } from "./schemas";

export type StockEntry = {
  id: string;
  ingredient_id: string;
  supplier_id: string | null;
  establishment_id: string | null;
  quantity: number;
  remaining_quantity: number;
  unit: string;
  lot_number: string;
  expiry_date: string | null;
  manufacture_date: string | null;
  is_frozen: boolean;
  invoice_url: string | null;
  unit_cost: number | null;
  is_internal_use: boolean;
  created_at: string;
  ingredient: {
    name: string;
    image_url: string | null;
    is_perishable: boolean;
    low_stock_threshold: number | null;
  } | null;
  supplier: { name: string } | null;
};

export type Supplier = {
  id: string;
  name: string;
  tax_id: string | null;
  rne_number: string | null;
  rne_expiry: string | null;
};

const ENTRY_SELECT = `
  id, ingredient_id, supplier_id, establishment_id, quantity, remaining_quantity,
  unit, lot_number, expiry_date, manufacture_date, is_frozen, invoice_url,
  unit_cost, is_internal_use, created_at,
  ingredient:ingredients(name, image_url, is_perishable, low_stock_threshold),
  supplier:suppliers(name)
`;

// Filtro de planta activa (doc 12 §3): con planta seleccionada, SOLO los lotes
// de esa planta (los legacy con establishment_id null quedan visibles únicamente
// en "Todas"). establishmentId null/undefined = sin filtro.
type StockListOpts = { establishmentId?: string | null };

/** Lotes con stock disponible (para vista "stock actual" agregada en cliente). */
export async function listAvailableEntries(
  opts: StockListOpts = {},
): Promise<StockEntry[]> {
  const supabase = createClient();
  let query = supabase
    .from("stock_entries")
    .select(ENTRY_SELECT)
    .is("deleted_at", null)
    .gt("remaining_quantity", 0)
    .order("expiry_date", { ascending: true, nullsFirst: false });
  if (opts.establishmentId)
    query = query.eq("establishment_id", opts.establishmentId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as StockEntry[];
}

/** Historial de ingresos (todos los lotes, consumidos o no). */
export async function listEntryHistory(
  search: string,
  opts: StockListOpts = {},
): Promise<StockEntry[]> {
  const supabase = createClient();
  let query = supabase
    .from("stock_entries")
    .select(ENTRY_SELECT)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(200);
  if (search.trim()) query = query.ilike("lot_number", `%${search.trim()}%`);
  if (opts.establishmentId)
    query = query.eq("establishment_id", opts.establishmentId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as StockEntry[];
}

/** Ingreso atómico (entrada + movimiento) vía RPC. establishment_id opcional:
 *  la planta a la que pertenece el lote (default null = sin planta / legacy). */
export async function createEntry(
  input: StockEntryInput & {
    unit: string;
    invoice_url?: string | null;
    establishment_id?: string | null;
  },
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("create_stock_entry", {
    p_ingredient_id: input.ingredient_id,
    p_quantity: input.quantity,
    p_unit: input.unit,
    p_lot_number: input.lot_number,
    p_expiry_date: input.expiry_date ?? undefined,
    p_manufacture_date: input.manufacture_date ?? undefined,
    p_is_frozen: input.is_frozen,
    p_supplier_id: input.supplier_id ?? undefined,
    p_unit_cost: input.unit_cost ?? undefined,
    p_is_internal_use: input.is_internal_use,
    p_invoice_url: input.invoice_url ?? undefined,
    p_establishment_id: input.establishment_id ?? undefined,
  });
  if (error) throw error;
}

/** Ajuste manual con motivo (auditoría) vía RPC. */
export async function adjustEntry(params: {
  entryId: string;
  delta: number;
  reason: string;
  type?: "adjustment" | "loss" | "return" | "internal";
}): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("adjust_stock_entry", {
    p_entry_id: params.entryId,
    p_delta: params.delta,
    p_reason: params.reason,
    p_type: params.type ?? "adjustment",
  });
  if (error) {
    if (error.message.includes("insufficient_stock"))
      throw new Error("Stock insuficiente para ese ajuste");
    throw error;
  }
}

// ── Proveedores ──────────────────────────────────────────────────────────────

export async function listSuppliers(): Promise<Supplier[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("suppliers")
    .select("id, name, tax_id, rne_number, rne_expiry")
    .is("deleted_at", null)
    .order("name");
  if (error) throw error;
  return (data ?? []) as Supplier[];
}

export async function createSupplier(input: SupplierInput): Promise<Supplier> {
  const supabase = createClient();
  const tenant_id = await getTenantId();
  const { data, error } = await supabase
    .from("suppliers")
    .insert({ ...input, tenant_id })
    .select("id, name, tax_id, rne_number, rne_expiry")
    .single();
  if (error) throw error;
  return data as Supplier;
}

// ── Factura adjunta (bucket privado) ─────────────────────────────────────────

export async function uploadInvoice(file: File): Promise<string> {
  const supabase = createClient();
  const tenantId = await getTenantId();
  const ext = file.name.split(".").pop()?.toLowerCase() || "pdf";
  const path = `${tenantId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from("invoices")
    .upload(path, file, { contentType: file.type });
  if (error) throw error;
  return path; // privado: se accede con signed URL
}

export async function getInvoiceUrl(path: string): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from("invoices")
    .createSignedUrl(path, 60 * 10);
  if (error) throw error;
  return data.signedUrl;
}
