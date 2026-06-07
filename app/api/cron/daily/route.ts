import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/crons/auth";
import { runReconcileBilling } from "@/lib/crons/jobs/reconcile-billing";
import { runStockAlerts } from "@/lib/crons/jobs/stock-alerts";
import { runTrialEnding } from "@/lib/crons/jobs/trial-ending";

// =============================================================================
// app/api/cron/daily — agregador de los jobs diarios.
//
// El plan de Vercel sólo permite 2 crons diarios, así que consolidamos los tres
// jobs diarios (reconcile-billing, stock-alerts, trial-ending) en un único cron
// que los corre SECUENCIALMENTE. Cada job se ejecuta en su propio try/catch: uno
// que falla NO aborta los demás (best-effort, como cada job individualmente).
//
// Los routes originales siguen funcionando para disparo manual; este endpoint
// reutiliza su lógica núcleo (run*) sin duplicarla.
//
// Auth: bearer CRON_SECRET (idéntico a los demás crons). Schedule (vercel.json):
// "17 6 * * *" UTC ≈ 03:17 AR. runtime nodejs (service_role).
// =============================================================================

export const runtime = "nodejs";

type JobResult = { ok: true; result: unknown } | { ok: false; error: string };

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

  const reconcile = await runJob(runReconcileBilling);
  const stockAlerts = await runJob(runStockAlerts);
  const trialEnding = await runJob(runTrialEnding);

  console.log(
    `[daily] reconcile=${reconcile.ok} stockAlerts=${stockAlerts.ok} trialEnding=${trialEnding.ok}`
  );
  return NextResponse.json({ reconcile, stockAlerts, trialEnding });
}

/** Corre un job aislando su fallo: nunca lanza, siempre devuelve ok/error. */
async function runJob(job: () => Promise<unknown>): Promise<JobResult> {
  try {
    const result = await job();
    return { ok: true, result };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    return { ok: false, error };
  }
}
