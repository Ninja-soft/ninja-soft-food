import { parseISO } from "date-fns";
import { getCountryProfile } from "@/lib/globalization/countries";

type LocaleFormatOptions = {
  locale?: string;
  country?: string | null;
};

type MoneyFormatOptions = LocaleFormatOptions & {
  currency?: string;
};

function resolveLocale(options?: LocaleFormatOptions): string {
  return options?.locale ?? getCountryProfile(options?.country).locale;
}

/** Fecha localizada. Acepta Date o ISO string (date o timestamp). */
export function formatDate(
  value: string | Date | null | undefined,
  options?: LocaleFormatOptions
): string {
  if (!value) return "-";
  const d = typeof value === "string" ? parseISO(value) : value;
  return new Intl.DateTimeFormat(resolveLocale(options)).format(d);
}

/** Cantidad localizada, sin ceros colgantes. */
export function formatQty(
  value: number | null | undefined,
  options?: LocaleFormatOptions & { maximumFractionDigits?: number }
): string {
  if (value === null || value === undefined) return "-";
  return new Intl.NumberFormat(resolveLocale(options), {
    maximumFractionDigits: options?.maximumFractionDigits ?? 3,
  }).format(value);
}

/** Moneda localizada. Default ARS para mantener compatibilidad. */
export function formatMoney(
  value: number | null | undefined,
  options?: MoneyFormatOptions
): string {
  if (value === null || value === undefined) return "-";
  const profile = getCountryProfile(options?.country);
  return new Intl.NumberFormat(options?.locale ?? profile.locale, {
    style: "currency",
    currency: options?.currency ?? profile.currency,
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
