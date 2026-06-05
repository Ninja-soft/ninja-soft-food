import { z } from "zod";

// Rango de fechas para planillas semanales / resúmenes. Máximo 92 días para
// acotar el volumen de un PDF/Excel generado en cliente (CLAUDE.md: volúmenes
// grandes irían a cola/Edge Function, fuera del alcance del MVP).
export const MAX_RANGE_DAYS = 92;

export const dateRangeSchema = z
  .object({
    from: z.string().min(1, "Elegí la fecha de inicio"),
    to: z.string().min(1, "Elegí la fecha de fin"),
  })
  .refine((v) => v.from <= v.to, {
    message: "La fecha de inicio debe ser anterior o igual a la de fin",
    path: ["to"],
  })
  .refine(
    (v) => {
      const from = new Date(v.from).getTime();
      const to = new Date(v.to).getTime();
      const days = Math.round((to - from) / 86_400_000) + 1;
      return days <= MAX_RANGE_DAYS;
    },
    {
      message: `El rango no puede superar ${MAX_RANGE_DAYS} días`,
      path: ["to"],
    },
  );

export type DateRangeInput = z.infer<typeof dateRangeSchema>;
