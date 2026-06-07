import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/crons/auth";
import { runTrialEnding } from "@/lib/crons/jobs/trial-ending";

// =============================================================================
// app/api/cron/trial-ending — disparo HTTP del aviso de prueba por vencer.
//
// El route sólo autoriza (bearer CRON_SECRET) y delega en runTrialEnding
// (lib/crons/jobs/trial-ending), la misma lógica que ejecuta /api/cron/daily.
// Sigue disponible para disparo manual.
//
// Schedule histórico: "23 8 * * *" UTC ≈ 05:23 AR. Ya no tiene cron propio en
// vercel.json (consolidado en /api/cron/daily por el límite del plan Vercel).
// runtime nodejs (service_role).
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

  const summary = await runTrialEnding();
  return NextResponse.json(summary);
}
