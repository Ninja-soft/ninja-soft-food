import { z } from "zod";

// Cliente: solo el nombre es obligatorio; el resto es opcional (se normaliza a
// null para no guardar cadenas vacías). Email validado si viene cargado.
export const customerSchema = z.object({
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
  phone: z
    .string()
    .max(40)
    .transform((v) => v.trim() || null)
    .nullable(),
  email: z
    .string()
    .max(160)
    .transform((v) => v.trim())
    .refine((v) => v === "" || z.string().email().safeParse(v).success, {
      message: "Email inválido",
    })
    .transform((v) => v || null)
    .nullable(),
});
export type CustomerInput = z.infer<typeof customerSchema>;

// Vehículo: la patente es obligatoria; UTA/URA (números y vencimientos) y la
// capacidad son opcionales.
export const vehicleSchema = z.object({
  plate: z.string().min(1, "Ingresá la patente").max(20),
  uta_number: z
    .string()
    .max(40)
    .transform((v) => v.trim() || null)
    .nullable(),
  uta_expiry: z.string().nullable(), // YYYY-MM-DD
  ura_number: z
    .string()
    .max(40)
    .transform((v) => v.trim() || null)
    .nullable(),
  ura_expiry: z.string().nullable(),
  capacity_kg: z
    .number({ invalid_type_error: "Capacidad inválida" })
    .positive("Debe ser mayor a 0")
    .nullable(),
});
export type VehicleInput = z.infer<typeof vehicleSchema>;

// Ítem de despacho: receta obligatoria, producción (lote) opcional para recall,
// cantidad en kg > 0.
export const dispatchItemSchema = z.object({
  recipe_id: z.string().uuid({ message: "Elegí un producto" }),
  production_id: z.string().uuid().nullable(),
  quantity_kg: z
    .number({ invalid_type_error: "Cantidad inválida" })
    .positive("Debe ser mayor a 0"),
});
export type DispatchItemInput = z.infer<typeof dispatchItemSchema>;

export const dispatchSchema = z.object({
  customer_id: z.string().uuid({ message: "Elegí un cliente" }),
  dispatch_date: z.string().min(1, "Elegí la fecha"),
  vehicle_id: z.string().uuid().nullable(),
  items: z.array(dispatchItemSchema).min(1, "Agregá al menos un ítem"),
});
export type DispatchInput = z.infer<typeof dispatchSchema>;
