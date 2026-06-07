import { createClient } from "@/lib/supabase/client";
import { getTenantId } from "@/lib/utils/tenant";
import type { EstablishmentInput } from "./schemas";

// =============================================================================
// modules/establishments — CRUD sobre establishments (plantas del tenant).
// El plan Industria habilita N plantas (plans.limits.max_establishments); el
// alta de tenant ya crea una is_default = true, así que todo tenant tiene ≥1.
// RLS scopea por tenant; el filtro de planta activa es de UI, no de seguridad
// (doc 12 §2). Soft delete (deleted_at) por regla dura 4.
// =============================================================================

export type Establishment = {
  id: string;
  name: string;
  address: string | null;
  locality: string | null;
  is_default: boolean;
  created_at: string;
};

const SELECT = "id, name, address, locality, is_default, created_at";

/** Establecimientos activos del tenant, default primero y luego por nombre. */
export async function listEstablishments(): Promise<Establishment[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("establishments")
    .select(SELECT)
    .is("deleted_at", null)
    .order("is_default", { ascending: false })
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Establishment[];
}

export async function createEstablishment(
  input: EstablishmentInput,
): Promise<Establishment> {
  const supabase = createClient();
  const tenant_id = await getTenantId();
  const { data, error } = await supabase
    .from("establishments")
    .insert({ ...input, tenant_id })
    .select(SELECT)
    .single();
  if (error) throw error;
  return data as Establishment;
}

export async function updateEstablishment(
  id: string,
  input: EstablishmentInput,
): Promise<Establishment> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("establishments")
    .update(input)
    .eq("id", id)
    .select(SELECT)
    .single();
  if (error) throw error;
  return data as Establishment;
}

/**
 * Marca un establecimiento como el por defecto: pone is_default = false en el
 * resto del tenant (RLS scopea el update) y true en el elegido. Dos updates
 * secuenciales — no hay RPC dedicada; el tenant tiene pocas plantas y el costo
 * es nulo. Si el segundo update fallara, ningún default quedaría: por eso se
 * setea el nuevo ANTES de limpiar los demás… pero entonces habría dos default
 * un instante. Orden elegido: limpiar resto, luego setear el nuevo (el caso de
 * error deja "sin default" recuperable re-eligiendo, peor que "dos default").
 */
export async function setDefaultEstablishment(id: string): Promise<void> {
  const supabase = createClient();
  const tenant_id = await getTenantId();

  const { error: clearErr } = await supabase
    .from("establishments")
    .update({ is_default: false })
    .eq("tenant_id", tenant_id)
    .neq("id", id)
    .is("deleted_at", null);
  if (clearErr) throw clearErr;

  const { error: setErr } = await supabase
    .from("establishments")
    .update({ is_default: true })
    .eq("id", id);
  if (setErr) throw setErr;
}

/**
 * Borrado lógico de un establecimiento. No se permite borrar el default ni el
 * último activo (el tenant debe quedar con al menos una planta): esa validación
 * la hace el caller (UI) con el listado actual; acá solo marcamos deleted_at.
 */
export async function deleteEstablishment(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("establishments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}
