import { z } from "zod";

// Entidad a la que aplica un permiso. Espejo de PermitEntityType de
// lib/globalization/permitTypes (contrato compartido con la migración 0013).
export const PERMIT_ENTITY_TYPES = [
  "tenant",
  "establishment",
  "supplier",
  "vehicle",
  "recipe",
] as const;
export type PermitEntityType = (typeof PERMIT_ENTITY_TYPES)[number];

export const permitSchema = z.object({
  entity_type: z.enum(PERMIT_ENTITY_TYPES),
  entity_id: z.string().uuid(),
  permit_type: z.string().min(1, "Elegí un tipo de permiso"),
  permit_number: z.string().min(1, "Ingresá el número").max(80),
  issued_at: z.string().nullable(),
  expires_at: z.string().nullable(),
  attachment_url: z
    .string()
    .max(500)
    .transform((v) => v.trim() || null)
    .nullable(),
  notes: z
    .string()
    .max(500)
    .transform((v) => v.trim() || null)
    .nullable(),
});
export type PermitInput = z.infer<typeof permitSchema>;
