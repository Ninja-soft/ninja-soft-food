-- ============================================================
-- Ninja Food — 0023 webhook deliveries (outbox de eventos salientes)
-- Registro de cada entrega de un evento a un webhook del tenant. Es el
-- "outbox" del emisor: el cron app/api/cron/emit-webhooks detecta recursos
-- nuevos (producciones completadas, despachos, ingresos de stock), encola UNA
-- fila por (webhook, evento, recurso) y la entrega firmada HMAC-SHA256.
-- Detalle del modelo y del mecanismo: docs/10-api-publica.md §"Webhooks salientes".
--
-- POR QUÉ OUTBOX + CRON (y no pg_net desde triggers ni un POST best-effort):
--   Las acciones que generan eventos corren vía RPC frozen (complete_production,
--   create_dispatch, create_stock_entry) llamadas DESDE EL CLIENTE del tenant.
--   No hay route handler server en el medio donde colgar la emisión. Disparar
--   desde el browser se perdería si la pestaña se cierra. pg_net desde triggers
--   es server-side robusto pero acopla la entrega a la transacción y no se puede
--   testear/operar desde el gate de JS. El outbox por cron es server-side puro,
--   sobrevive a cualquier caller, no toca las RPC frozen y es idempotente por
--   diseño (un unique sobre (webhook, evento, recurso) impide doble entrega).
--
-- IDEMPOTENCIA: índice único (webhook_id, event, resource_id). El cron hace
--   INSERT ... ON CONFLICT DO NOTHING al encolar: re-correr no duplica. El
--   "corte" por (webhook, evento) sale de MAX(resource_created_at) ya encolado.
--
-- RLS: el tenant LEE sus entregas (transparencia: ver qué se entregó y errores);
--   staff lee todo (internal_read). Los WRITES son solo service_role (el cron
--   con admin client bypassa RLS): el tenant nunca inserta/edita entregas, igual
--   que no toca last_delivery_* de outbound_webhooks.
--
-- NUMERACIÓN: 0023, sigue a 0022 (recipe_labels). NO se aplica desde acá
--   (deuda de aplicación junto al resto de migraciones pendientes). Los types
--   de types/database.ts se editan a mano (patrón conocido del proyecto).
-- ============================================================

create extension if not exists pgcrypto;

create table public.webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  webhook_id uuid not null references public.outbound_webhooks (id) on delete cascade,
  -- evento del catálogo v1: 'production.completed','dispatch.created',
  -- 'dispatch.voided','stock.entry_created'. Texto libre a propósito: el catálogo
  -- crece por fase y no queremos una migración por evento nuevo.
  event text not null,
  -- id del recurso que disparó el evento (production.id / dispatch.id /
  -- stock_entry.id). Clave de idempotencia junto a (webhook_id, event).
  resource_id uuid not null,
  -- created_at del recurso de origen: es el "cursor" que el cron usa para
  -- detectar lo nuevo desde la última entrega encolada por (webhook, evento).
  resource_created_at timestamptz not null,
  -- snapshot del payload que se firmó y envió (data del POST). Inmutable: si una
  -- entrega falla y se reintenta, se reusa este payload (no se recalcula).
  payload jsonb not null,
  -- pending: encolada, sin intentar | delivered: 2xx | failed: agotó intentos.
  status text not null default 'pending'
    check (status in ('pending', 'delivered', 'failed')),
  attempts int not null default 0,
  -- último status HTTP (o 0 si fue timeout/red) y último error legible.
  last_status int,
  last_error text,
  created_at timestamptz not null default now(),
  delivered_at timestamptz
);

-- IDEMPOTENCIA: una sola fila por (webhook, evento, recurso). El encolado hace
-- ON CONFLICT DO NOTHING contra este índice: re-correr el cron no duplica.
create unique index webhook_deliveries_dedup_idx
  on public.webhook_deliveries (webhook_id, event, resource_id);

-- Listado del tenant (últimas entregas) y barrido del cron por estado.
create index webhook_deliveries_tenant_idx
  on public.webhook_deliveries (tenant_id, created_at desc);
create index webhook_deliveries_pending_idx
  on public.webhook_deliveries (status)
  where status = 'pending';
-- Corte de detección: MAX(resource_created_at) por (webhook, evento).
create index webhook_deliveries_cursor_idx
  on public.webhook_deliveries (webhook_id, event, resource_created_at desc);

comment on table public.webhook_deliveries is
  'Outbox de eventos salientes: una fila por (webhook, evento, recurso). El cron emit-webhooks la encola (ON CONFLICT DO NOTHING) y la entrega firmada HMAC. El tenant LEE sus entregas (transparencia); writes solo service_role.';

-- ------------------------------------------------------------
-- RLS — el tenant lee sus entregas; staff lee todo; writes service_role.
-- ------------------------------------------------------------

alter table public.webhook_deliveries enable row level security;

-- Solo lectura para el tenant dueño (ver estado/errores de sus webhooks). No hay
-- policy de INSERT/UPDATE/DELETE para authenticated: el cron escribe con
-- service_role (bypassa RLS), igual que ai_usage / last_delivery_* de webhooks.
create policy tenant_read on public.webhook_deliveries
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy internal_read on public.webhook_deliveries
  for select to authenticated using (public.is_internal());
