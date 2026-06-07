-- ============================================================
-- Ninja Food — 0019 ai usage (metering)
-- Registro de uso de IA por tenant (tokens/llamadas) para controlar el
-- costo de la key de PLATAFORMA y aplicar límites por plan (doc 07
-- §"Fase 7", doc 11 Gap 3). Cada generación exitosa escribe una fila.
--
-- Modelo de negocio: la key es de Ninja-Soft, no del cliente. El metering
-- es interno (control de costo + visibilidad en /internal), por eso el
-- tenant NO ve esta tabla: solo staff lee (internal_read SELECT). Los
-- writes van por service_role (lib/ai/usage.logAIUsage, best-effort).
--
-- NUMERACIÓN: 0017/0018 las escriben otros agentes en paralelo. Esta es
-- 0019 y NO se aplica desde acá (deuda de aplicación junto al resto).
-- Patrón de RLS calcado de 0014 (tablas solo-staff): internal_read.
-- ============================================================

create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  -- feature que consumió IA (ej. 'nutrition_table', 'front_labels',
  -- 'report_format'). Texto libre: el catálogo de features de IA crece por fase.
  feature text not null,
  -- proveedor y modelo usados (auditoría de costo: distinto modelo, distinto $).
  provider text not null,
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  created_at timestamptz not null default now()
);

-- Agregación por tenant y rango de fecha (uso mensual, límite por plan).
create index ai_usage_tenant_idx on public.ai_usage (tenant_id, created_at);

comment on table public.ai_usage is
  'Metering de uso de IA por tenant (tokens/llamadas). Controla el costo de la key de plataforma y los límites por plan. Invisible para el tenant: solo staff (internal_read SELECT); writes por service_role (best-effort, nunca rompe el flujo).';

-- ------------------------------------------------------------
-- RLS — solo staff lee; writes por service_role (bypassa RLS).
-- ------------------------------------------------------------

alter table public.ai_usage enable row level security;

create policy internal_read on public.ai_usage
  for select to authenticated using (public.is_internal());
