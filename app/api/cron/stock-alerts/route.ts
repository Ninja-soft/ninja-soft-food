import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/crons/auth";
import { runStockAlerts } from "@/lib/crons/jobs/stock-alerts";

// =============================================================================
// app/api/cron/stock-alerts — disparo HTTP de las alertas diarias de stock.
//
// El route sólo autoriza (bearer CRON_SECRET) y delega en runStockAlerts
// (lib/crons/jobs/stock-alerts), la misma lógica que ejecuta /api/cron/daily.
// Sigue disponible para disparo manual.
//
// Schedule histórico: "37 7 * * *" UTC ≈ 04:37 AR. Ya no tiene cron propio en
// vercel.json (consolidado en /api/cron/daily por el límite del plan Vercel).
// runtime nodejs.
// =============================================================================

export const runtime = "nodejs";

export async function POST(req: Request) {
  return handle(req);
}

export async function GET(req: Request) {
  return handle(req);
}

async function handle(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const summary = await runStockAlerts();
  return NextResponse.json(summary);
}
