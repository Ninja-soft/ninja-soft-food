import { createClient } from "@/lib/supabase/client";
import { getTenantId } from "@/lib/utils/tenant";
import type { CustomerInput, DispatchInput, VehicleInput } from "./schemas";

// ── Tipos ────────────────────────────────────────────────────────────────────

export type Customer = {
  id: string;
  name: string;
  address: string | null;
  locality: string | null;
  phone: string | null;
  email: string | null;
};

export type Vehicle = {
  id: string;
  plate: string;
  uta_number: string | null;
  uta_expiry: string | null;
  ura_number: string | null;
  ura_expiry: string | null;
  capacity_kg: number | null;
};

export type DispatchItem = {
  id: string;
  recipe_id: string;
  production_id: string | null;
  quantity_kg: number;
  recipe: {
    title: string;
    commercial_name: string | null;
    rnpa_number: string | null;
  } | null;
  production: {
    code: string;
    product_lot_number: string | null;
    product_expiry_date: string | null;
  } | null;
};

export type Dispatch = {
  id: string;
  dispatch_date: string;
  status: string;
  created_at: string;
  customer: { name: string; locality: string | null } | null;
  vehicle: {
    plate: string;
    uta_expiry: string | null;
    ura_expiry: string | null;
  } | null;
  items: DispatchItem[];
};

export type DispatchDetail = {
  id: string;
  dispatch_date: string;
  status: string;
  customer: Customer | null;
  vehicle: Vehicle | null;
  items: DispatchItem[];
};

/** Producción completada disponible para asignar a un ítem de despacho. */
export type ProductionOption = {
  id: string;
  recipe_id: string;
  code: string;
  product_lot_number: string | null;
  product_expiry_date: string | null;
};

export type CreateDispatchResult = {
  dispatch_id: string;
  items: number;
};

// La RPC create_dispatch todavía no está en types/database.ts.
// regenerated after db:types
type DispatchRpcArgs = {
  p_customer_id: string;
  p_dispatch_date: string;
  p_items: DispatchInput["items"];
  p_vehicle_id?: string | null;
};

const DISPATCH_ITEM_SELECT = `
  id, recipe_id, production_id, quantity_kg,
  recipe:recipes(title, commercial_name, rnpa_number),
  production:productions(code, product_lot_number, product_expiry_date)
`;

const DISPATCH_SELECT = `
  id, dispatch_date, status, created_at,
  customer:customers(name, locality),
  vehicle:vehicles(plate, uta_expiry, ura_expiry),
  items:dispatch_items(${DISPATCH_ITEM_SELECT})
`;

// ── Clientes ─────────────────────────────────────────────────────────────────

const CUSTOMER_SELECT = "id, name, address, locality, phone, email";

export async function listCustomers(search = ""): Promise<Customer[]> {
  const supabase = createClient();
  let query = supabase
    .from("customers")
    .select(CUSTOMER_SELECT)
    .is("deleted_at", null)
    .order("name");
  if (search.trim()) query = query.ilike("name", `%${search.trim()}%`);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Customer[];
}

export async function createCustomer(input: CustomerInput): Promise<Customer> {
  const supabase = createClient();
  const tenant_id = await getTenantId();
  const { data, error } = await supabase
    .from("customers")
    .insert({ ...input, tenant_id })
    .select(CUSTOMER_SELECT)
    .single();
  if (error) throw error;
  return data as Customer;
}

export async function updateCustomer(
  id: string,
  input: CustomerInput
): Promise<Customer> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("customers")
    .update(input)
    .eq("id", id)
    .select(CUSTOMER_SELECT)
    .single();
  if (error) throw error;
  return data as Customer;
}

export async function softDeleteCustomer(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("customers")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

// ── Vehículos ────────────────────────────────────────────────────────────────

const VEHICLE_SELECT =
  "id, plate, uta_number, uta_expiry, ura_number, ura_expiry, capacity_kg";

export async function listVehicles(): Promise<Vehicle[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("vehicles")
    .select(VEHICLE_SELECT)
    .is("deleted_at", null)
    .order("plate");
  if (error) throw error;
  return (data ?? []) as Vehicle[];
}

export async function createVehicle(input: VehicleInput): Promise<Vehicle> {
  const supabase = createClient();
  const tenant_id = await getTenantId();
  const { data, error } = await supabase
    .from("vehicles")
    .insert({ ...input, tenant_id })
    .select(VEHICLE_SELECT)
    .single();
  if (error) throw error;
  return data as Vehicle;
}

export async function updateVehicle(
  id: string,
  input: VehicleInput
): Promise<Vehicle> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("vehicles")
    .update(input)
    .eq("id", id)
    .select(VEHICLE_SELECT)
    .single();
  if (error) throw error;
  return data as Vehicle;
}

export async function softDeleteVehicle(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("vehicles")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

// ── Producciones disponibles (para asignar lote a un ítem) ────────────────────

export async function listCompletedProductions(): Promise<ProductionOption[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("productions")
    .select("id, recipe_id, code, product_lot_number, product_expiry_date")
    .is("deleted_at", null)
    .eq("status", "completed")
    .order("production_date", { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []) as ProductionOption[];
}

// ── Despachos ────────────────────────────────────────────────────────────────

export async function listDispatches(params: {
  search?: string;
  from?: string | null;
  to?: string | null;
}): Promise<Dispatch[]> {
  const supabase = createClient();
  let query = supabase
    .from("dispatches")
    .select(DISPATCH_SELECT)
    .is("deleted_at", null)
    .order("dispatch_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200);

  if (params.from) query = query.gte("dispatch_date", params.from);
  if (params.to) query = query.lte("dispatch_date", params.to);

  const { data, error } = await query;
  if (error) throw error;

  let rows = (data ?? []) as unknown as Dispatch[];

  // Búsqueda por nombre de cliente (relación anidada): se filtra en cliente para
  // evitar inner joins que descarten despachos sin coincidencia parcial.
  const q = params.search?.trim().toLowerCase();
  if (q) {
    rows = rows.filter((d) =>
      (d.customer?.name ?? "").toLowerCase().includes(q)
    );
  }
  return rows;
}

/** Detalle completo de un despacho (para remito PDF). */
export async function getDispatchDetail(id: string): Promise<DispatchDetail> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("dispatches")
    .select(
      `id, dispatch_date, status,
       customer:customers(${CUSTOMER_SELECT}),
       vehicle:vehicles(${VEHICLE_SELECT}),
       items:dispatch_items(${DISPATCH_ITEM_SELECT})`
    )
    .eq("id", id)
    .is("deleted_at", null)
    .single();
  if (error) throw error;
  return data as unknown as DispatchDetail;
}

/** Alta de despacho + ítems: transacción única en Postgres (RPC). */
export async function createDispatch(
  input: DispatchInput
): Promise<CreateDispatchResult> {
  const supabase = createClient();
  const args: DispatchRpcArgs = {
    p_customer_id: input.customer_id,
    p_dispatch_date: input.dispatch_date,
    p_items: input.items,
    p_vehicle_id: input.vehicle_id ?? undefined,
  };
  // regenerated after db:types — cast local hasta regenerar los tipos de la RPC.
  const { data, error } = await (
    supabase.rpc as unknown as (
      fn: "create_dispatch",
      params: DispatchRpcArgs
    ) => Promise<{ data: unknown; error: { message: string } | null }>
  )("create_dispatch", args);
  if (error) {
    if (error.message.includes("empty_items"))
      throw new Error("El despacho debe tener al menos un ítem");
    if (error.message.includes("invalid_quantity"))
      throw new Error("Las cantidades deben ser mayores a 0");
    if (error.message.includes("production_not_completed"))
      throw new Error(
        "Solo se pueden despachar lotes de producciones completadas"
      );
    throw new Error(error.message);
  }
  return data as CreateDispatchResult;
}

/** Anular despacho: marca el estado como 'voided' (no borra el historial). */
export async function voidDispatch(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("dispatches")
    .update({ status: "voided" })
    .eq("id", id);
  if (error) throw error;
}

export async function softDeleteDispatch(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("dispatches")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}
