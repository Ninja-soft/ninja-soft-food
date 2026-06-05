// =============================================================================
// lib/crons/decisions.ts — decisiones PURAS de los jobs programados.
//
// Los handlers en app/api/cron/* hacen el I/O (Supabase, pasarela, emails); acá
// vive solo la lógica que decide QUÉ hacer, sin dependencias externas, para poder
// testearla en aislamiento (tests/unit/crons.test.ts). Reglas:
//   - ventana de aviso de trial por vencer,
//   - predicado anti-spam (no reenviar un email igual demasiado seguido),
//   - cálculo de días restantes redondeado hacia arriba.
// =============================================================================

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Días enteros (redondeo hacia arriba) entre `now` y `target`. */
export function daysBetween(now: Date, target: Date): number {
  return Math.ceil((target.getTime() - now.getTime()) / MS_PER_DAY);
}

// -----------------------------------------------------------------------------
// Ventana de "prueba por vencer".
// -----------------------------------------------------------------------------

/** Ventana (en días) para el aviso de trial por vencer. Ancha a propósito: el
 *  anti-spam de "un único aviso por trial" evita repetir, así que tolera que el
 *  job corra cualquier día dentro de la ventana sin perder el aviso. */
export const TRIAL_ENDING_MIN_DAYS = 5;
export const TRIAL_ENDING_MAX_DAYS = 9;

/**
 * ¿La fecha de fin de período cae dentro de la ventana de aviso de trial por
 * vencer (entre MIN y MAX días en el futuro)? `null`/inválida → false.
 */
export function isWithinTrialEndingWindow(
  periodEnd: string | Date | null | undefined,
  now: Date = new Date()
): boolean {
  if (!periodEnd) return false;
  const end = periodEnd instanceof Date ? periodEnd : new Date(periodEnd);
  if (Number.isNaN(end.getTime())) return false;
  const days = daysBetween(now, end);
  return days >= TRIAL_ENDING_MIN_DAYS && days <= TRIAL_ENDING_MAX_DAYS;
}

// -----------------------------------------------------------------------------
// Anti-spam de emails recurrentes.
// -----------------------------------------------------------------------------

/** Ventana anti-spam por defecto para alertas de stock/vencimiento (20 h). */
export const STOCK_ALERT_COOLDOWN_HOURS = 20;
/** Ventana anti-spam para el aviso de trial: un único aviso por trial (10 d). */
export const TRIAL_ENDING_COOLDOWN_HOURS = 10 * 24;

/**
 * ¿Hace falta enviar el email, dado el timestamp del último envío del mismo tipo
 * para ese tenant? Devuelve true si nunca se envió o si el último quedó fuera de
 * la ventana de enfriamiento. PURA: el reloj y la ventana son parámetros.
 */
export function shouldSendEmail(
  lastSentAt: string | Date | null | undefined,
  cooldownHours: number,
  now: Date = new Date()
): boolean {
  if (!lastSentAt) return true;
  const last = lastSentAt instanceof Date ? lastSentAt : new Date(lastSentAt);
  if (Number.isNaN(last.getTime())) return true;
  const elapsedMs = now.getTime() - last.getTime();
  return elapsedMs >= cooldownHours * 60 * 60 * 1000;
}

/** Marca temporal "hace N horas" en ISO, para acotar la query anti-spam. */
export function isoHoursAgo(hours: number, now: Date = new Date()): string {
  return new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString();
}
