import { z } from "zod";

// Establecimiento (planta) del tenant. El nombre es obligatorio; dirección y
// localidad opcionales (se normalizan a null). Los permisos finos (RNE/RUCA) se
// gestionan con PermitsSection (entity_type='establishment'), no acá: el alta es
// nombre + ubicación. is_default lo controla la acción "marcar por defecto", no
// el form.
export const establishmentSchema = z.object({
  name: z.string().min(1, "Ingresá un nombre").max(120),
  address: z
    .string()
    .max(200)
    .transform((v) => v.trim() || null)
    .nullable(),
  locality: z
    .string()
    .max(120)
    .transform((v) => v.trim() || null)
    .nullable(),
});
export type EstablishmentInput = z.infer<typeof establishmentSchema>;
