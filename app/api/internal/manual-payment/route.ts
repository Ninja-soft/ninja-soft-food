import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireInternal } from "@/modules/internal/server";

// =============================================================================
// POST /api/internal/manual-payment — registra un pago por transferencia/efectivo.
//
// Inserta en manual_payments y, en el MISMO handler, extiende la suscripción:
//   current_period_end += period_months, status = 'active', billing_mode = 'manual'.
// Así una suscripción cobrada a mano queda exenta de la reconciliación con MP
// (lib/billing/sync: isReconciliationExempt). Admin client + requireInternal() +
// audit_logs before/after (regla dura 4 y 7).
// =============================================================================

export const runtime = "nodejs";

const METHODS = new Set(["transfer", "cash", "other"]);

export async function POST(req: Request) {
  const actor = await requireInternal({ api: true });
  if (!actor) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: {
    tenantId?: string;
    amount?: number;
    currency?: string;
    method?: string;
    reference?: string;
    paidAt?: string;
    periodMonths?: number;
    notes?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const tenantId = String(body.tenantId ?? "").trim();
  const amount = Number(body.amount);
  const currency = String(body.currency ?? "ARS").trim().toUpperCase();
  const method = String(body.method ?? "").trim();
  const reference = body.reference ? String(body.reference).trim() : null;
  const paidAt = String(body.paidAt ?? "").trim();
  const periodMonths = Math.max(1, Math.floor(Number(body.periodMonths) || 1));
  const notes = body.notes ? String(body.notes).trim() : null;

  if (!tenantId) {
    return NextResponse.json({ error: "missing_tenant" }, { status: 400 });
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "invalid_amount" }, { status: 400 });
  }
  if (!METHODS.has(method)) {
    return NextResponse.json({ error: "invalid_method" }, { status: 400 });
  }
  if (!paidAt) {
    return NextResponse.json({ error: "missing_paid_at" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: sub, error: subErr } = await admin
    .from("subscriptions")
    .select("id, status, billing_mode, current_period_end")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (subErr) {
    return NextResponse.json({ error: "lookup_failed" }, { status: 500 });
  }
  if (!sub) {
    return NextResponse.json(
      { error: "subscription_not_found" },
      { status: 404 },
    );
  }

  // Base de extensión: el fin vigente si es futuro, si no la fecha de pago.
  const now = Date.now();
  const currentEnd = sub.current_period_end
    ? new Date(sub.current_period_end).getTime()
    : 0;
  const paidAtMs = new Date(paidAt).getTime();
  const base = currentEnd > now ? currentEnd : Math.max(now, paidAtMs);
  const newEnd = new Date(base);
  newEnd.setMonth(newEnd.getMonth() + periodMonths);
  const newEndIso = newEnd.toISOString();

  // 1) Registrar el pago manual.
  const { data: payment, error: payErr } = await admin
    .from("manual_payments")
    .insert({
      tenant_id: tenantId,
      subscription_id: sub.id,
      amount,
      currency,
      method,
      reference,
      paid_at: paidAt,
      period_months: periodMonths,
      notes,
      created_by: actor.userId,
    })
    .select("id")
    .single();
  if (payErr || !payment) {
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }

  const before = {
    status: sub.status,
    billing_mode: sub.billing_mode,
    current_period_end: sub.current_period_end,
  };

  // 2) Activar/extender la suscripción a mano (billing_mode = manual).
  const { error: updErr } = await admin
    .from("subscriptions")
    .update({
      status: "active",
      billing_mode: "manual",
      current_period_end: newEndIso,
      cancel_at_period_end: false,
    })
    .eq("id", sub.id);
  if (updErr) {
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }

  await admin.from("tenants").update({ status: "active" }).eq("id", tenantId);

  await admin.from("audit_logs").insert({
    tenant_id: tenantId,
    actor_user_id: actor.userId,
    entity_type: "subscriptions",
    entity_id: sub.id,
    action: "internal_manual_payment",
    reason: `Staff Ninja-Soft · pago manual ${method} ${currency} ${amount} · +${periodMonths} mes(es)`,
    before_data: before,
    after_data: {
      status: "active",
      billing_mode: "manual",
      current_period_end: newEndIso,
      manual_payment_id: payment.id,
      amount,
      currency,
      method,
    },
  });

  return NextResponse.json({ ok: true, current_period_end: newEndIso });
}
