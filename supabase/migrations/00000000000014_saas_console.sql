-- ============================================================
-- Ninja Food — 0014 saas console
-- Base de datos de la consola interna SaaS (Fase 5 del roadmap +
-- modelo IA add-on de Fase 7). Cubre los gaps 2 y 3 de
-- docs/11-auditoria-2026-06.md: cobros (manual/cortesía/vitalicio),
-- pagos por transferencia, add-ons (IA), feature flags por tenant,
-- notas internas, facturación mínima y settings de plataforma.
-- Detalle: docs/03-modelo-datos.md, docs/07-roadmap.md.
--
-- Patrón de RLS (regla dura 1):
--   - Tablas que el TENANT ve (sus addons/flags/facturas): policy
--     tenant_isolation SELECT + internal_read. Writes NUNCA por
--     authenticated → solo service_role (route handlers de /internal).
--   - Tablas SOLO staff (manual_payments, internal_notes,
--     internal_settings): solo internal_read SELECT, sin acceso del
--     tenant; writes por service_role.
--   - Catálogo plan_addons: lectura pública authenticated (como plans).
-- ============================================================

-- ------------------------------------------------------------
-- 1. subscriptions — modos de cobro y cortesías
--    current_period_end ya existe en 0001 (no se duplica).
-- ------------------------------------------------------------

alter table public.subscriptions
  add column if not exists billing_mode text not null default 'automatic'
    check (billing_mode in ('automatic', 'manual', 'comp'));

alter table public.subscriptions
  add column if not exists is_lifetime boolean not null default false;

comment on column public.subscriptions.billing_mode is
  'Modo de cobro: automatic = pasarela (MP preapproval), manual = transferencia/efectivo registrado por staff, comp = cortesía sin cobro.';
comment on column public.subscriptions.is_lifetime is
  'Acceso vitalicio (sin renovación ni vencimiento). Típicamente con billing_mode = comp. Se contabiliza como no-revenue en métricas.';

-- ------------------------------------------------------------
-- 2. manual_payments — pagos por transferencia/efectivo
--    SOLO staff lee (internal_read). El tenant NO ve esta tabla.
--    Writes vía service_role (route handlers de /internal).
-- ------------------------------------------------------------

create table public.manual_payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  subscription_id uuid references public.subscriptions (id) on delete set null,
  amount numeric(12,2) not null,
  currency text not null default 'ARS',
  method text not null check (method in ('transfer', 'cash', 'other')),
  reference text,                 -- nro de comprobante / id de transferencia
  receipt_url text,               -- adjunto del comprobante (bucket privado)
  paid_at date not null,
  period_months int not null default 1,  -- meses que cubre el pago
  notes text,
  created_by uuid references public.users (id),  -- staff que lo registró
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create trigger set_updated_at before update on public.manual_payments
  for each row execute function public.set_updated_at();

create index manual_payments_tenant_idx
  on public.manual_payments (tenant_id, paid_at desc)
  where deleted_at is null;

comment on table public.manual_payments is
  'Pagos por transferencia/efectivo registrados por staff. Activan/extienden la suscripción a mano. Invisible para el tenant: solo staff (internal_read); writes por service_role.';

-- ------------------------------------------------------------
-- 3. plan_addons (catálogo) + subscription_addons
--    plan_addons: como plans, lectura pública authenticated.
--    subscription_addons: el tenant ve los suyos; writes service_role.
-- ------------------------------------------------------------

create table public.plan_addons (
  key text primary key,           -- 'ai' es el primero
  name text not null,
  description text,
  monthly_price_ars numeric(12,2),
  monthly_price_usd numeric(12,2),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at before update on public.plan_addons
  for each row execute function public.set_updated_at();

comment on table public.plan_addons is
  'Catálogo de add-ons que suman al monto de la suscripción (primero: IA). Lectura pública authenticated, como plans. Precios reales se setean desde /internal.';

create table public.subscription_addons (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  subscription_id uuid references public.subscriptions (id) on delete cascade,
  addon_key text not null references public.plan_addons (key),
  status text not null default 'active' check (status in ('active', 'cancelled')),
  source text not null default 'purchase'
    check (source in ('purchase', 'included', 'granted')),
  provider_subscription_id text,  -- preapproval MP separado si aplica
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create trigger set_updated_at before update on public.subscription_addons
  for each row execute function public.set_updated_at();

-- Un add-on activo por tenant (los cancelados/borrados no cuentan).
create unique index subscription_addons_unique_active
  on public.subscription_addons (tenant_id, addon_key)
  where deleted_at is null and status = 'active';

comment on table public.subscription_addons is
  'Add-ons contratados/incluidos/regalados por tenant (ej. IA). source: purchase = pago extra, included = viene con el plan, granted = cortesía. El tenant ve los suyos (necesita saber si tiene IA); writes por service_role.';

-- ------------------------------------------------------------
-- 4. tenant_feature_flags — flags por tenant (string libre)
--    OJO: 0001 ya tiene una tabla tenant_feature_flags ligada al
--    catálogo feature_flags (id, feature_flag_id). Esta consola usa
--    flags por string (ej. 'ai_enabled') sin pasar por el catálogo,
--    así que la tabla nueva se llama tenant_flags para no chocar.
-- ------------------------------------------------------------

create table public.tenant_flags (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  flag text not null,
  enabled boolean not null default true,
  note text,
  set_by uuid references public.users (id),  -- staff que lo seteó
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, flag)
);

create trigger set_updated_at before update on public.tenant_flags
  for each row execute function public.set_updated_at();

comment on table public.tenant_flags is
  'Feature flags por tenant por string (ej. ai_enabled, impersonation). Independiente del catálogo feature_flags de 0001. El tenant lee los suyos; writes por service_role desde /internal.';

-- ------------------------------------------------------------
-- 5. internal_notes — notas internas por tenant (CRM staff)
--    SOLO staff lee/escribe (via service_role). Tenant sin acceso.
-- ------------------------------------------------------------

create table public.internal_notes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  author_id uuid not null references public.users (id),
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create trigger set_updated_at before update on public.internal_notes
  for each row execute function public.set_updated_at();

create index internal_notes_tenant_idx
  on public.internal_notes (tenant_id, created_at desc)
  where deleted_at is null;

comment on table public.internal_notes is
  'Notas internas del staff por tenant (CRM). Invisible para el tenant: solo staff (internal_read); writes por service_role.';

-- ------------------------------------------------------------
-- 6. subscription_invoices — facturación mínima (ARCA/CFDI después)
--    El tenant ve sus facturas; writes service_role.
-- ------------------------------------------------------------

create table public.subscription_invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  subscription_id uuid references public.subscriptions (id) on delete set null,
  number text not null,
  amount numeric(12,2) not null,
  currency text not null,
  status text not null default 'issued'
    check (status in ('draft', 'issued', 'paid', 'voided')),
  issued_at date not null,
  due_date date,
  pdf_url text,
  external_ref text,              -- CAE (AFIP/ARCA) / UUID fiscal (CFDI MX) futuro
  notes text,
  created_by uuid references public.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (tenant_id, number)
);

create trigger set_updated_at before update on public.subscription_invoices
  for each row execute function public.set_updated_at();

create index subscription_invoices_tenant_idx
  on public.subscription_invoices (tenant_id, issued_at desc)
  where deleted_at is null;

comment on table public.subscription_invoices is
  'Facturas de suscripción (base mínima). external_ref guardará CAE (ARCA) o UUID (CFDI MX) en la integración fiscal futura. El tenant ve las suyas; writes por service_role.';

-- ------------------------------------------------------------
-- 7. internal_settings — config de plataforma key-value
--    SOLO staff lee; writes service_role. Las keys sensibles
--    (ej. API keys de IA de Fase 7) se guardan CIFRADAS por la app
--    (server-side), nunca en texto plano: este store es el contenedor.
-- ------------------------------------------------------------

create table public.internal_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references public.users (id),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at before update on public.internal_settings
  for each row execute function public.set_updated_at();

comment on table public.internal_settings is
  'Config global de plataforma (key-value). Las keys sensibles (API keys de IA, Fase 7) se guardan CIFRADAS por la app server-side, nunca en texto plano. SOLO staff (internal_read); writes por service_role.';

-- ------------------------------------------------------------
-- RLS — habilitar en todas las tablas nuevas
-- ------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'manual_payments', 'plan_addons', 'subscription_addons',
    'tenant_flags', 'internal_notes', 'subscription_invoices',
    'internal_settings'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- 7.1 Tablas que el tenant ve (SELECT propio) + staff internal_read.
--     Writes NUNCA por authenticated → solo service_role.
do $$
declare t text;
begin
  foreach t in array array[
    'subscription_addons', 'tenant_flags', 'subscription_invoices'
  ] loop
    execute format(
      'create policy tenant_read on public.%I
       for select to authenticated
       using (tenant_id = public.current_tenant_id())', t);
    execute format(
      'create policy internal_read on public.%I
       for select to authenticated using (public.is_internal())', t);
  end loop;
end $$;

-- 7.2 Tablas SOLO staff (el tenant NO las ve): solo internal_read.
--     Writes por service_role.
do $$
declare t text;
begin
  foreach t in array array[
    'manual_payments', 'internal_notes', 'internal_settings'
  ] loop
    execute format(
      'create policy internal_read on public.%I
       for select to authenticated using (public.is_internal())', t);
  end loop;
end $$;

-- 7.3 plan_addons: catálogo de lectura pública authenticated (como plans).
--     Writes por service_role (desde /internal).
create policy addons_public_read on public.plan_addons
  for select to authenticated using (true);

-- ------------------------------------------------------------
-- Seed: catálogo de add-ons (precio real se setea desde /internal)
-- ------------------------------------------------------------

insert into public.plan_addons (key, name, description, monthly_price_ars, monthly_price_usd)
values
  ('ai', 'Asistente IA',
   'Generación asistida de rotulado, octógonos/sellos y tabla nutricional. Incluido en planes altos; add-on en planes bajos.',
   0, 0)
on conflict (key) do nothing;
