import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedCron } from "@/lib/crons/auth";
import {
  TRIAL_ENDING_COOLDOWN_HOURS,
  daysBetween,
  isWithinTrialEndingWindow,
  isoHoursAgo,
  shouldSendEmail,
} from "@/lib/crons/decisions";
import { getTenantOwnerEmail, lastEmailSentAt } from "@/lib/crons/tenants";
import { sendSystemEmail } from "@/lib/emails/enqueue";
import {
  EMAIL_TEMPLATES_BY_KEY,
  buildEmailLayout,
  renderTemplateHtml,
} from "@/lib/emails/templates";
import { formatDate } from "@/lib/utils/format";

// =============================================================================
// app/api/cron/trial-ending — aviso diario de prueba por vencer.
//
// Subscriptions en trial cuyo current_period_end cae entre 5 y 9 días en el
// futuro (ventana ancha que tolera el anti-spam) → email trial_ending al owner
// con los días restantes y link a /configuracion. Un único aviso por trial:
// no reenvía si ya salió un trial_ending a ese tenant en los ultimos 10 días.
//
// Best-effort por tenant. Schedule (vercel.json): "23 8 * * *" UTC ≈ 05:23 AR.
// runtime nodejs (service_role).
// =============================================================================

export const runtime = "nodejs";

/** Subject fijo del aviso: estable para el match anti-spam por subject. */
const TRIAL_SUBJECT = "Tu prueba de Ninja Food esta por vencer";

type Summary = { processed: number; errors: string[] };

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

  const admin = createAdminClient();
  const now = new Date();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const summary: Summary = { processed: 0, errors: [] };

  const { data: subs, error: subsErr } = await admin
    .from("subscriptions")
    .select("id, tenant_id, current_period_end")
    .eq("status", "trial")
    .not("current_period_end", "is", null);

  if (subsErr) {
    return NextResponse.json(
      { processed: 0, errors: [`subs_query: ${subsErr.message}`] },
      { status: 500 }
    );
  }

  for (const sub of subs ?? []) {
    try {
      const periodEnd = sub.current_period_end;
      if (!isWithinTrialEndingWindow(periodEnd, now)) continue;

      // Un único aviso por trial: chequea cualquier trial_ending de los ultimos
      // 10 días para este tenant.
      const since = isoHoursAgo(TRIAL_ENDING_COOLDOWN_HOURS, now);
      const lastSent = await lastEmailSentAt(admin, {
        tenantId: sub.tenant_id,
        subject: TRIAL_SUBJECT,
        sinceIso: since,
      });
      if (!shouldSendEmail(lastSent, TRIAL_ENDING_COOLDOWN_HOURS, now))
        continue;

      const email = await getTenantOwnerEmail(admin, sub.tenant_id);
      if (!email) continue;

      const { data: tenant } = await admin
        .from("tenants")
        .select("name")
        .eq("id", sub.tenant_id)
        .maybeSingle();

      const days = daysBetween(now, new Date(periodEnd as string));
      const negocio = tenant?.name ?? "tu cuenta";
      const body = renderTemplateHtml(
        EMAIL_TEMPLATES_BY_KEY.trial_ending.defaultBody,
        {
          negocio,
          dias: days,
          vence: formatDate(periodEnd),
          link: `${appUrl}/configuracion`,
        }
      );
      const html = buildEmailLayout(body, { negocio });

      const res = await sendSystemEmail({
        tenantId: sub.tenant_id,
        to: email,
        subject: TRIAL_SUBJECT,
        html,
      });
      if (res.ok) summary.processed += 1;
      else
        summary.errors.push(`tenant:${sub.tenant_id}: ${res.error ?? "send"}`);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      summary.errors.push(`tenant:${sub.tenant_id}: ${message}`);
    }
  }

  console.log(
    `[trial-ending] processed=${summary.processed} errors=${summary.errors.length}`
  );
  return NextResponse.json(summary);
}
