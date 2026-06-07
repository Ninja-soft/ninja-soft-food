import { createClient } from "@/lib/supabase/client";
import { getTenantId } from "@/lib/utils/tenant";
import type { PermitEntityType, PermitInput } from "./schemas";

// =============================================================================
// modules/permits — CRUD sobre regulatory_permits (tabla genérica de
// habilitaciones por país: RNE/RNPA/RUCA/UTA/URA y permisos de cualquier país).
// El catálogo de tipos vive en lib/globalization/permitTypes; aquí solo
// persistimos lo que el operario carga, scopeado por tenant (RLS).
// =============================================================================

export type Permit = {
  id: string;
  entity_type: PermitEntityType;
  entity_id: string;
  permit_type: string;
  permit_number: string;
  issued_at: string | null;
  expires_at: string | null;
  attachment_url: string | null;
  notes: string | null;
};

const PERMIT_SELECT =
  "id, entity_type, entity_id, permit_type, permit_number, issued_at, expires_at, attachment_url, notes";

/** Permisos activos de una entidad (establecimiento, proveedor, vehículo, receta). */
export async function listPermits(
  entityType: PermitEntityType,
  entityId: string,
): Promise<Permit[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("regulatory_permits")
    .select(PERMIT_SELECT)
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Permit[];
}

export async function createPermit(input: PermitInput): Promise<void> {
  const supabase = createClient();
  const tenant_id = await getTenantId();
  const { error } = await supabase
    .from("regulatory_permits")
    .insert({ ...input, tenant_id });
  if (error) throw error;
}

export async function updatePermit(
  id: string,
  input: PermitInput,
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("regulatory_permits")
    .update(input)
    .eq("id", id);
  if (error) throw error;
}

export async function deletePermit(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("regulatory_permits")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

/** Sube un adjunto de permiso al bucket privado `attachments`. */
export async function uploadPermitAttachment(file: File): Promise<string> {
  const supabase = createClient();
  const tenantId = await getTenantId();
  const ext = file.name.split(".").pop()?.toLowerCase() || "pdf";
  const path = `${tenantId}/permits/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from("attachments")
    .upload(path, file, { contentType: file.type });
  if (error) throw error;
  return path;
}
