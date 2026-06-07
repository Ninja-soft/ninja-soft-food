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

const rtf = new Intl.RelativeTimeFormat("es-AR", { numeric: "auto" });

/** Fecha relativa legible ("hace 5 min", "ayer"). Port del POS. */
export function formatRelative(
  date: string | Date | null | undefined
): string {
  if (!date) return "nunca";
  const then = typeof date === "string" ? new Date(date) : date;
  const secs = Math.round((then.getTime() - Date.now()) / 1000);
  const abs = Math.abs(secs);
  if (abs < 60) return rtf.format(Math.trunc(secs / 1), "second");
  if (abs < 3600) return rtf.format(Math.trunc(secs / 60), "minute");
  if (abs < 86400) return rtf.format(Math.trunc(secs / 3600), "hour");
  if (abs < 2592000) return rtf.format(Math.trunc(secs / 86400), "day");
  if (abs < 31536000) return rtf.format(Math.trunc(secs / 2592000), "month");
  return rtf.format(Math.trunc(secs / 31536000), "year");
}

/** Días entre hoy y una fecha (negativo = vencido). */
export function daysUntil(date: string | null | undefined): number | null {
  if (!date) return null;
  const target = parseISO(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}
