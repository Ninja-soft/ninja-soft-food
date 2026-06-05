import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedCron } from "@/lib/crons/auth";
import {
  STOCK_ALERT_COOLDOWN_HOURS,
  isoHoursAgo,
  shouldSendEmail,
} from "@/lib/crons/decisions";
import { computeTenantStockAlerts } from "@/lib/crons/stock";
import { getTenantOwnerEmail, lastEmailSentAt } from "@/lib/crons/tenants";
import { sendSystemEmail } from "@/lib/emails/enqueue";
import { DOT, buildEmailLayout, htmlToPlainText } from "@/lib/emails/templates";
import { formatDate, formatQty } from "@/lib/utils/format";

// =============================================================================
// app/api/cron/stock-alerts — alertas diarias de stock por tenant.
//
// Por cada tenant activo (status active o trial) calcula stock bajo umbral y
// lotes por vencer (<=14 d) reutilizando el criterio del dashboard. Si hay
// alertas, manda UN email RESUMEN al owner (combinado stock_low + expiry_alert),
// no uno por ingrediente. Anti-spam: no reenvía si ya salió uno igual en las
// ultimas 20 h (lectura de system_emails por tenant + subject fijo).
//
// Best-effort por tenant: un tenant que falla acumula en errors[] y no corta el
// resto. Schedule (vercel.json): "37 7 * * *" UTC ≈ 04:37 AR. runtime nodejs.
// =============================================================================

export const runtime = "nodejs";

/** Subject fijo del resumen de alertas: estable para el match anti-spam. */
const ALERT_SUBJECT = "Alertas de inventario en Ninja Food";

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

  const { data: tenants, error: tenantsErr } = await admin
    .from("tenants")
    .select("id, name")
    .is("deleted_at", null)
    .in("status", ["active", "trial"]);

  if (tenantsErr) {
    return NextResponse.json(
      { processed: 0, errors: [`tenants_query: ${tenantsErr.message}`] },
      { status: 500 }
    );
  }

  for (const tenant of tenants ?? []) {
    try {
      const alerts = await computeTenantStockAlerts(admin, tenant.id);
      if (alerts.low.length === 0 && alerts.expiring.length === 0) continue;

      // Anti-spam: no reenviar si ya salió uno igual en la ventana de cooldown.
      const since = isoHoursAgo(STOCK_ALERT_COOLDOWN_HOURS, now);
      const lastSent = await lastEmailSentAt(admin, {
        tenantId: tenant.id,
        subject: ALERT_SUBJECT,
        sinceIso: since,
      });
      if (!shouldSendEmail(lastSent, STOCK_ALERT_COOLDOWN_HOURS, now)) continue;

      const email = await getTenantOwnerEmail(admin, tenant.id);
      if (!email) continue;

      const html = buildAlertHtml({
        negocio: tenant.name,
        low: alerts.low,
        expiring: alerts.expiring,
        link: `${appUrl}/inventario`,
      });

      const res = await sendSystemEmail({
        tenantId: tenant.id,
        to: email,
        subject: ALERT_SUBJECT,
        html,
      });
      if (res.ok) summary.processed += 1;
      else summary.errors.push(`tenant:${tenant.id}: ${res.error ?? "send"}`);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      summary.errors.push(`tenant:${tenant.id}: ${message}`);
    }
  }

  console.log(
    `[stock-alerts] processed=${summary.processed} errors=${summary.errors.length}`
  );
  return NextResponse.json(summary);
}

interface AlertHtmlArgs {
  negocio: string;
  low: Awaited<ReturnType<typeof computeTenantStockAlerts>>["low"];
  expiring: Awaited<ReturnType<typeof computeTenantStockAlerts>>["expiring"];
  link: string;
}

/** Cuerpo HTML del resumen combinado, envuelto en el layout de marca. */
function buildAlertHtml(args: AlertHtmlArgs): string {
  const sections: string[] = [
    `<p>Hola, hay alertas de inventario que requieren tu atencion en <strong>${esc(args.negocio)}</strong>.</p>`,
  ];

  if (args.low.length > 0) {
    const rows = args.low
      .slice(0, 30)
      .map(
        (r) =>
          `<tr><td class="k">${esc(r.name)}</td><td class="v">${formatQty(r.total)} ${esc(r.unit)} ${DOT} minimo ${formatQty(r.threshold)}</td></tr>`
      )
      .join("");
    sections.push(
      `<p style="margin-top:20px;"><strong>Stock bajo el umbral (${args.low.length})</strong></p>` +
        `<table class="data" role="presentation"><tbody>${rows}</tbody></table>`
    );
  }

  if (args.expiring.length > 0) {
    const rows = args.expiring
      .slice(0, 30)
      .map(
        (r) =>
          `<tr><td class="k">${esc(r.name)}</td><td class="v">vence ${esc(formatDate(r.nextExpiry))} ${DOT} en ${r.expiryDays} dias</td></tr>`
      )
      .join("");
    sections.push(
      `<p style="margin-top:20px;"><strong>Lotes por vencer (${args.expiring.length})</strong></p>` +
        `<table class="data" role="presentation"><tbody>${rows}</tbody></table>`
    );
  }

  sections.push(
    `<p style="margin-top:24px;"><a class="btn" href="${esc(args.link)}">Revisar el inventario</a></p>`
  );

  return buildEmailLayout(sections.join(""), { negocio: args.negocio });
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
