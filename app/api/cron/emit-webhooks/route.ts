import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";
import { isAuthorizedCron } from "@/lib/crons/auth";
import { buildDeliveryBody, deliverSigned } from "@/lib/api/webhooks";
import {
  buildDispatchCreatedPayload,
  buildDispatchVoidedPayload,
  buildProductionCompletedPayload,
  buildStockEntryCreatedPayload,
  isDeliveredStatus,
  isEmittableEvent,
  isRetryable,
  selectNewResources,
  type DispatchRow,
  type EmittableEvent,
  type ProductionRow,
  type StockEntryRow,
} from "@/lib/api/webhook-emit";

// =============================================================================
// app/api/cron/emit-webhooks — emisor outbox de eventos salientes.
//
// Dos fases por corrida:
//   1) ENCOLAR: por cada webhook activo y cada evento emitible al que está
//      suscrito, detecta recursos NUEVOS desde el cursor (MAX(resource_created_at)
//      ya encolado para ese (webhook, evento)) e inserta filas en
//      webhook_deliveries con ON CONFLICT DO NOTHING (idempotente).
//   2) ENTREGAR: toma las entregas pending/retryables (attempts < 3) y hace el
//      POST firmado HMAC; marca delivered (2xx) o suma attempt + last_error.
//      Tras 3 intentos fallidos queda 'failed'.
//
// Best-effort por webhook/entrega: un fallo acumula en errors[] y no corta el
// resto. Auth: bearer CRON_SECRET (como los demás crons). Schedule (vercel.json):
// cada 5 min. runtime nodejs (node:crypto para la firma).
// =============================================================================

export const runtime = "nodejs";

const MAX_RESOURCES_PER_RUN = 100; // tope por (webhook, evento) por corrida.
const MAX_DELIVERIES_PER_RUN = 200; // tope de POSTs salientes por corrida.

type AdminClient = ReturnType<typeof createAdminClient>;

type WebhookRow = {
  id: string;
  tenant_id: string;
  url: string;
  secret: string;
  events: string[];
};

type Summary = { enqueued: number; delivered: number; failed: number; errors: string[] };

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
  const summary: Summary = { enqueued: 0, delivered: 0, failed: 0, errors: [] };

  const { data: webhooks, error: hooksErr } = await admin
    .from("outbound_webhooks")
    .select("id, tenant_id, url, secret, events")
    .is("deleted_at", null)
    .eq("is_active", true);

  if (hooksErr) {
    return NextResponse.json(
      { ...summary, errors: [`webhooks_query: ${hooksErr.message}`] },
      { status: 500 },
    );
  }

  // ── Fase 1: encolar recursos nuevos por (webhook, evento) ──────────────────
  for (const hook of (webhooks ?? []) as WebhookRow[]) {
    for (const event of hook.events) {
      if (!isEmittableEvent(event)) continue; // stock.low u otros: no por cursor.
      try {
        const enq = await enqueueForWebhookEvent(admin, hook, event);
        summary.enqueued += enq;
      } catch (e) {
        summary.errors.push(`enqueue ${hook.id}/${event}: ${msg(e)}`);
      }
    }
  }

  // ── Fase 2: entregar pendientes/retryables ─────────────────────────────────
  try {
    const res = await deliverPending(admin, webhooks ?? []);
    summary.delivered += res.delivered;
    summary.failed += res.failed;
    summary.errors.push(...res.errors);
  } catch (e) {
    summary.errors.push(`deliver: ${msg(e)}`);
  }

  console.log(
    `[emit-webhooks] enqueued=${summary.enqueued} delivered=${summary.delivered} failed=${summary.failed} errors=${summary.errors.length}`,
  );
  return NextResponse.json(summary);
}

// ── Fase 1: detección + encolado ─────────────────────────────────────────────

/** Cursor = MAX(resource_created_at) ya encolado para (webhook, evento). */
async function lastCursor(
  admin: AdminClient,
  webhookId: string,
  event: string,
): Promise<string | null> {
  const { data } = await admin
    .from("webhook_deliveries")
    .select("resource_created_at")
    .eq("webhook_id", webhookId)
    .eq("event", event)
    .order("resource_created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.resource_created_at ?? null;
}

async function enqueueForWebhookEvent(
  admin: AdminClient,
  hook: WebhookRow,
  event: EmittableEvent,
): Promise<number> {
  const cursor = await lastCursor(admin, hook.id, event);
  const rows = await buildPayloadsForEvent(admin, hook.tenant_id, event, cursor);
  if (rows.length === 0) return 0;

  // ON CONFLICT DO NOTHING sobre (webhook_id, event, resource_id): re-correr no
  // duplica. payload es el snapshot inmutable que se firmará en la entrega.
  const inserts = rows.map((r) => ({
    tenant_id: hook.tenant_id,
    webhook_id: hook.id,
    event,
    resource_id: r.resource_id,
    resource_created_at: r.resource_created_at,
    payload: r.payload as Json,
    status: "pending" as const,
  }));

  const { error } = await admin
    .from("webhook_deliveries")
    .upsert(inserts, {
      onConflict: "webhook_id,event,resource_id",
      ignoreDuplicates: true,
    });
  if (error) throw new Error(error.message);
  return inserts.length;
}

type BuiltPayload = {
  resource_id: string;
  resource_created_at: string;
  payload: Record<string, unknown>;
};

/** Lee los recursos del tenant para el evento, recorta por cursor y arma payloads. */
async function buildPayloadsForEvent(
  admin: AdminClient,
  tenantId: string,
  event: EmittableEvent,
  cursor: string | null,
): Promise<BuiltPayload[]> {
  if (event === "production.completed") {
    const { data } = await admin
      .from("productions")
      .select(
        "id, tenant_id, code, status, production_date, packaging_date, quantity_kg, product_lot_number, product_expiry_date, recipe_id, created_at",
      )
      .eq("tenant_id", tenantId)
      .eq("status", "completed")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(MAX_RESOURCES_PER_RUN * 2);
    const fresh = selectNewResources(
      (data ?? []) as ProductionRow[],
      cursor,
      MAX_RESOURCES_PER_RUN,
    );
    return fresh.map((p) => toBuilt(buildProductionCompletedPayload(p)));
  }

  if (event === "dispatch.created") {
    const { data } = await admin
      .from("dispatches")
      .select(
        "id, tenant_id, dispatch_date, status, customer_id, vehicle_id, created_at, updated_at",
      )
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(MAX_RESOURCES_PER_RUN * 2);
    const fresh = selectNewResources(
      (data ?? []) as DispatchRow[],
      cursor,
      MAX_RESOURCES_PER_RUN,
    );
    return fresh.map((d) => toBuilt(buildDispatchCreatedPayload(d)));
  }

  if (event === "dispatch.voided") {
    // El cursor de voided es updated_at: mapeamos created_at a updated_at para
    // que selectNewResources corte por el momento de anulación.
    const { data } = await admin
      .from("dispatches")
      .select(
        "id, tenant_id, dispatch_date, status, customer_id, vehicle_id, created_at, updated_at",
      )
      .eq("tenant_id", tenantId)
      .eq("status", "voided")
      .order("updated_at", { ascending: false })
      .limit(MAX_RESOURCES_PER_RUN * 2);
    const byVoidedAt = ((data ?? []) as DispatchRow[]).map((d) => ({
      ...d,
      created_at: d.updated_at, // selectNewResources corta por created_at.
    }));
    const fresh = selectNewResources(byVoidedAt, cursor, MAX_RESOURCES_PER_RUN);
    return fresh.map((d) => toBuilt(buildDispatchVoidedPayload(d)));
  }

  // stock.entry_created
  const { data } = await admin
    .from("stock_entries")
    .select(
      "id, tenant_id, ingredient_id, lot_number, quantity, unit, expiry_date, is_frozen, supplier_id, created_at, no_traceability",
    )
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .eq("no_traceability", false)
    .order("created_at", { ascending: false })
    .limit(MAX_RESOURCES_PER_RUN * 2);
  const fresh = selectNewResources(
    (data ?? []) as StockEntryRow[],
    cursor,
    MAX_RESOURCES_PER_RUN,
  );
  return fresh.map((s) => toBuilt(buildStockEntryCreatedPayload(s)));
}

function toBuilt(b: {
  resource_id: string;
  resource_created_at: string;
  data: Record<string, unknown>;
}): BuiltPayload {
  return {
    resource_id: b.resource_id,
    resource_created_at: b.resource_created_at,
    payload: b.data,
  };
}

// ── Fase 2: entrega ──────────────────────────────────────────────────────────

async function deliverPending(
  admin: AdminClient,
  webhooks: { id: string; url: string; secret: string }[],
): Promise<{ delivered: number; failed: number; errors: string[] }> {
  const byId = new Map(webhooks.map((w) => [w.id, w]));
  const out = { delivered: 0, failed: 0, errors: [] as string[] };

  const { data: pending, error } = await admin
    .from("webhook_deliveries")
    .select("id, webhook_id, event, payload, attempts")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(MAX_DELIVERIES_PER_RUN);
  if (error) throw new Error(error.message);

  for (const d of pending ?? []) {
    const hook = byId.get(d.webhook_id);
    if (!hook) continue; // webhook desactivado/borrado entre fases: lo dejamos.
    if (!isRetryable(d.attempts)) continue;

    const tsSeconds = Math.floor(Date.now() / 1000);
    const body = buildDeliveryBody(d.event, d.payload, tsSeconds);
    const status = await deliverSigned(hook.url, body, hook.secret, tsSeconds);
    const attempts = d.attempts + 1;

    if (isDeliveredStatus(status)) {
      out.delivered += 1;
      await admin
        .from("webhook_deliveries")
        .update({
          status: "delivered",
          attempts,
          last_status: status,
          last_error: null,
          delivered_at: new Date().toISOString(),
        })
        .eq("id", d.id);
      await touchWebhook(admin, hook.id, status);
    } else {
      const exhausted = !isRetryable(attempts);
      if (exhausted) out.failed += 1;
      await admin
        .from("webhook_deliveries")
        .update({
          status: exhausted ? "failed" : "pending",
          attempts,
          last_status: status,
          last_error:
            status === 0 ? "timeout/red" : `HTTP ${status}`,
        })
        .eq("id", d.id);
      await touchWebhook(admin, hook.id, status);
    }
  }

  return out;
}

/** Refleja la última entrega en outbound_webhooks (igual que emitWebhookEvent). */
async function touchWebhook(
  admin: AdminClient,
  webhookId: string,
  status: number,
): Promise<void> {
  try {
    await admin
      .from("outbound_webhooks")
      .update({
        last_delivery_at: new Date().toISOString(),
        last_delivery_status: status,
      })
      .eq("id", webhookId);
  } catch {
    // secundario: la entrega ya quedó registrada en webhook_deliveries.
  }
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
