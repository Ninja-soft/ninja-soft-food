import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

/** dd/MM/yyyy (es-AR). Acepta Date o ISO string (date o timestamp). */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "-";
  const d = typeof value === "string" ? parseISO(value) : value;
  return format(d, "dd/MM/yyyy", { locale: es });
}

/** Cantidad con coma decimal es-AR, sin ceros colgantes. */
export function formatQty(value: number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  return new Intl.NumberFormat("es-AR", {
    maximumFractionDigits: 3,
  }).format(value);
}

/** Moneda ARS. */
export function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 2,
  }).format(value);
}

/** Días entre hoy y una fecha (negativo = vencido). */
export function daysUntil(date: string | null | undefined): number | null {
  if (!date) return null;
  const target = parseISO(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}
