import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendSystemEmails } from "@/lib/emails/enqueue";
import { htmlExcerpt } from "@/modules/quality/schemas";

// =============================================================================
// POST /api/emails/notify-report — notifica por email un informe bromatologico.
//
// Lo llama modules/quality/api.ts (createReport) cuando notify_member_ids no
// esta vacio. Resuelve los emails de los operarios elegidos (createClient server
// con RLS: solo lee datos del tenant de la sesion) y encola report_notification
// a cada uno via la Edge Function send_email. Best-effort: si el envio falla,
// el informe ya fue creado y NO se rompe nada (regla dura: email caido nunca
// tira una operacion de negocio).
//
// Body: { reportId: string }
// =============================================================================

export const runtime = "nodejs"; // service_role en enqueue: nunca edge/cliente.

export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { reportId?: string };
  try {
    body = (await req.json()) as { reportId?: string };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const reportId = String(body.reportId ?? "").trim();
  if (!reportId) {
    return NextResponse.json({ error: "missing_report" }, { status: 400 });
  }

  // RLS scopea al tenant de la sesion: si el informe no es del tenant, no se ve.
  const { data: report } = await supabase
    .from("reports")
    .select("id, tenant_id, report_date, importance, content_html, notify_member_ids")
    .eq("id", reportId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!report) {
    return NextResponse.json({ error: "report_not_found" }, { status: 404 });
  }

  const memberIds = report.notify_member_ids ?? [];
  if (memberIds.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, total: 0 });
  }

  // Operarios a notificar (solo los que tienen email cargado).
  const { data: members } = await supabase
    .from("members")
    .select("id, full_name, email")
    .in("id", memberIds)
    .is("deleted_at", null);
  const recipients = (members ?? []).filter(
    (m): m is { id: string; full_name: string; email: string } =>
      typeof m.email === "string" && m.email.trim().length > 0,
  );
  if (recipients.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, total: 0 });
  }

  // Nombre del negocio + logo para el branding del email.
  const [{ data: tenant }, { data: branding }] = await Promise.all([
    supabase.from("tenants").select("name").eq("id", report.tenant_id).maybeSingle(),
    supabase
      .from("tenant_branding")
      .select("logo_url")
      .eq("tenant_id", report.tenant_id)
      .maybeSingle(),
  ]);

  const negocio = tenant?.name ?? "Ninja Food";
  const logoUrl = branding?.logo_url ?? null;
  const extracto = htmlExcerpt(report.content_html, 280) || "Sin descripcion.";
  const fecha = formatDate(report.report_date);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const link = `${appUrl}/calidad/informes`;

  const { sent, total } = await sendSystemEmails(
    recipients.map((m) => ({
      tenantId: report.tenant_id,
      templateKey: "report_notification",
      to: m.email,
      variables: {
        negocio,
        logo_url: logoUrl ?? "",
        nombre: m.full_name,
        fecha,
        importancia: report.importance,
        extracto,
        link,
      },
    })),
  );

  return NextResponse.json({ ok: true, sent, total });
}

/** Fecha local AR (dd/mm/aaaa) a partir de un date string YYYY-MM-DD. */
function formatDate(value: string): string {
  const [y, m, d] = value.split("T")[0]!.split("-");
  if (y && m && d) return `${d}/${m}/${y}`;
  return value;
}
