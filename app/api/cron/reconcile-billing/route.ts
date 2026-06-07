import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/crons/auth";
import { runReconcileBilling } from "@/lib/crons/jobs/reconcile-billing";

// =============================================================================
// app/api/cron/reconcile-billing — disparo HTTP de la reconciliación del cobro.
//
// El route sólo autoriza (bearer CRON_SECRET) y delega en runReconcileBilling
// (lib/crons/jobs/reconcile-billing), que es la misma lógica que ejecuta
// /api/cron/daily. Sigue disponible para disparo manual.
//
// Schedule histórico: "17 6 * * *" UTC ≈ 03:17 AR. Ya no tiene cron propio en
// vercel.json (consolidado en /api/cron/daily por el límite del plan Vercel).
// runtime nodejs: service_role + fetch a MP, jamás edge/cliente.
// =============================================================================

export const runtime = "nodejs";

export async function POST(req: Request) {
  return handle(req);
}

// Vercel Cron dispara GET por defecto; aceptamos ambos.
export async function GET(req: Request) {
  return handle(req);
}

async function handle(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const summary = await runReconcileBilling();
  return NextResponse.json(summary);
}
