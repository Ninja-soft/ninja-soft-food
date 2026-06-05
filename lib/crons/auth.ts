// =============================================================================
// lib/crons/auth.ts — autorización de los handlers de cron.
//
// Vercel Cron inyecta automáticamente `Authorization: Bearer ${CRON_SECRET}` en
// los requests programados cuando la env var CRON_SECRET existe. Cada handler
// exige ese header; sin él (o con secret inválido) responde 401. Esto evita que
// los endpoints de cron sean disparables por cualquiera desde internet.
// =============================================================================

/**
 * ¿El request trae el bearer correcto del cron? Compara contra CRON_SECRET.
 * Si la env var no está seteada, devuelve false (fail-closed): preferimos que el
 * job no corra a que quede abierto.
 */
export function isAuthorizedCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization");
  if (!header) return false;
  return header === `Bearer ${secret}`;
}
