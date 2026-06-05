-- ============================================================
-- Ninja Food — 0001 core
-- Núcleo SaaS multi-tenant (patrón Ninja-Soft POS) + dominio
-- bromatológico mínimo viable. Detalle: docs/03-modelo-datos.md
-- ============================================================

create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- Helpers
-- ------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- tenant_id desde el claim del JWT (patrón POS)
create or replace function public.current_tenant_id()
returns uuid language sql stable as $$
  select nullif(
    coalesce(
      current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'tenant_id',
      ''
    ), ''
  )::uuid
$$;

create or replace function public.is_internal()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select u.is_internal from public.users u where u.id = auth.uid()),
    false
  )
$$;

-- ------------------------------------------------------------
-- Núcleo SaaS
-- ------------------------------------------------------------

create type tenant_status as enum ('trial','active','past_due','suspended','cancelled');
create type tenant_industry as enum ('frigorifico','panaderia','lacteos','conservas','catering','otro');
create type tenant_role as enum ('owner','manager','operator','viewer');
create type billing_provider as enum ('mercadopago','stripe','paypal','manual');
create type billing_cycle as enum ('monthly','yearly');

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  cuit text,
  industry tenant_industry not null default 'otro',
  country text not null default 'AR',
  status tenant_status not null default 'trial',
  trial_ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  is_internal boolean not null default false,
  internal_level text check (internal_level in ('viewer','editor','admin')),
  settings jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tenant_users (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  role tenant_role not null default 'viewer',
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key in ('start','pro','business','enterprise')),
  name text not null,
  monthly_price_ars numeric(12,2),
  yearly_price_ars numeric(12,2),
  monthly_price_usd numeric(12,2),
  limits jsonb not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references public.tenants (id) on delete cascade,
  plan_id uuid not null references public.plans (id),
  status tenant_status not null default 'trial',
  billing_cycle billing_cycle not null default 'monthly',
  provider billing_provider not null default 'manual',
  provider_subscription_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.feature_flags (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  description text,
  default_enabled boolean not null default false
);

create table public.tenant_feature_flags (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  feature_flag_id uuid not null references public.feature_flags (id) on delete cascade,
  enabled boolean not null default false,
  configured_by uuid references public.users (id),
  configured_at timestamptz not null default now(),
  primary key (tenant_id, feature_flag_id)
);

-- Webhooks de pago: idempotencia por provider_event_id
create table public.payment_events (
  id uuid primary key default gen_random_uuid(),
  provider billing_provider not null,
  provider_event_id text not null,
  tenant_id uuid references public.tenants (id),
  payload jsonb not null,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants (id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  actor_user_id uuid references public.users (id),
  before_data jsonb,
  after_data jsonb,
  ip_address inet,
  user_agent text,
  reason text,
  created_at timestamptz not null default now()
);

create table public.email_templates (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  key text not null,
  subject text not null,
  html text not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, key)
);

create table public.system_emails (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants (id),
  recipient text not null,
  subject text not null,
  html_content text not null,
  status text not null default 'pending' check (status in ('pending','sent','failed')),
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

-- Solo service_role (sin políticas para anon/authenticated)
create table public.system_email_smtp (
  id int primary key default 1 check (id = 1),
  hostname text not null,
  port int not null default 587,
  username text not null,
  password text not null,
  from_email text not null,
  from_name text not null,
  secure boolean not null default true,
  updated_at timestamptz not null default now()
);

create table public.tenant_branding (
  tenant_id uuid primary key references public.tenants (id) on delete cascade,
  logo_url text,
  trace_page_config jsonb not null default '{}',
  sello_abr_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Dominio: establecimientos y compliance
-- ------------------------------------------------------------

create table public.establishments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  address text,
  locality text,
  rne_number text,
  rne_expiry date,
  rne_attachment_url text,
  ruca_number text,
  ruca_expiry date,
  municipal_permit_status text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  cuit text,
  rne_number text,
  rne_expiry date,
  rne_attachment_url text,
  contact jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  plate text not null,
  uta_number text,
  uta_expiry date,
  ura_number text,
  ura_expiry date,
  capacity_kg numeric(10,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.laboratories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  contact jsonb not null default '{}',
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Operarios de planta (sin login): firman planillas y producciones con PIN
create table public.members (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  full_name text not null,
  position text,
  email text,
  pin_hash text not null,
  photo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ------------------------------------------------------------
-- Dominio: catálogo
-- ------------------------------------------------------------

create table public.ingredient_families (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  image_url text,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.measure_units (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants (id) on delete cascade, -- null = global
  name text not null,
  abbr text not null
);

create table public.ingredients (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  family_id uuid references public.ingredient_families (id),
  name text not null,
  unit text not null default 'kg',
  is_perishable boolean not null default true,
  image_url text,
  description text,
  low_stock_threshold numeric(12,3),
  default_shelf_days int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.recipe_groups (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  image_url text,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create type food_category as enum ('carnes','lacteos','panificados','conservas','bebidas','aditivos','otros');
create type product_type as enum ('solido','liquido','semisolido','polvo','concentrado');
create type packaging_delay as enum ('none','aging','freeze');

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  group_id uuid references public.recipe_groups (id),
  title text not null,
  commercial_name text,
  category food_category not null default 'otros',
  product_type product_type not null default 'solido',
  description text,
  shelf_life_days int not null default 30,
  aging_days int not null default 0,
  packaging_delay_type packaging_delay not null default 'none',
  rnpa_number text,
  rnpa_expiry date,
  rnpa_exempt boolean not null default false,
  rnpa_exempt_reason text,
  rnpa_attachment_url text,
  bpm_attachment_url text,
  image_url text,
  nutrition jsonb not null default '{}',
  front_labels text[] not null default '{}', -- octógonos Ley 27.642
  declaration_unit text,
  household_measure text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  ingredient_id uuid not null references public.ingredients (id),
  quantity numeric(12,3) not null,
  unit text not null,
  is_substitute boolean not null default false,
  source_ingredient_id uuid references public.ingredients (id)
);

-- ------------------------------------------------------------
-- Dominio: stock y lotes
-- ------------------------------------------------------------

create table public.lot_code_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  tokens jsonb not null default '[]', -- [{type: remito|fecha_fab|siglas|secuencia, ...}]
  is_default boolean not null default false
);

create table public.stock_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  establishment_id uuid references public.establishments (id),
  ingredient_id uuid not null references public.ingredients (id),
  supplier_id uuid references public.suppliers (id),
  quantity numeric(12,3) not null check (quantity > 0),
  remaining_quantity numeric(12,3) not null,
  unit text not null,
  lot_number text not null,
  expiry_date date,
  manufacture_date date,
  is_frozen boolean not null default false,
  frozen_extra_days int not null default 60, -- regla CAA congelados
  invoice_url text,
  unit_cost numeric(12,2),
  currency text not null default 'ARS',
  is_internal_use boolean not null default false,
  no_traceability boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create type stock_movement_type as enum ('purchase','production','adjustment','loss','return','internal');

-- Append-only (patrón POS): nunca UPDATE/DELETE
create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  ingredient_id uuid not null references public.ingredients (id),
  stock_entry_id uuid references public.stock_entries (id),
  type stock_movement_type not null,
  quantity numeric(12,3) not null, -- positivo entra, negativo sale
  production_id uuid,
  actor_user_id uuid references public.users (id),
  reason text,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Dominio: producción y trazabilidad
-- ------------------------------------------------------------

create type production_status as enum ('draft','completed','voided');

create table public.productions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  establishment_id uuid references public.establishments (id),
  recipe_id uuid not null references public.recipes (id),
  code text not null,
  status production_status not null default 'draft',
  production_date date not null,
  packaging_date date,
  manager_member_id uuid references public.members (id),
  quantity_kg numeric(12,3),
  product_lot_number text,
  product_expiry_date date,
  shelf_life_snapshot int,
  aging_snapshot int,
  notes text,
  total_cost numeric(14,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (tenant_id, code)
);

alter table public.stock_movements
  add constraint stock_movements_production_fk
  foreign key (production_id) references public.productions (id);

create table public.production_inputs (
  id uuid primary key default gen_random_uuid(),
  production_id uuid not null references public.productions (id) on delete cascade,
  ingredient_id uuid not null references public.ingredients (id),
  required_qty numeric(12,3) not null,
  stock_entry_id uuid references public.stock_entries (id), -- null = stock infinito
  taken_qty numeric(12,3) not null default 0,
  is_substitute boolean not null default false,
  source_ingredient_id uuid references public.ingredients (id)
);

create table public.production_reserves (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  ingredient_id uuid not null references public.ingredients (id),
  stock_entry_id uuid not null references public.stock_entries (id),
  quantity numeric(12,3) not null,
  expires_at timestamptz not null,
  created_by uuid references public.users (id),
  created_at timestamptz not null default now()
);

-- Traza pública QR: snapshot inmutable
create table public.public_traces (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  production_id uuid not null references public.productions (id),
  slug text not null unique,
  payload jsonb not null,
  qr_config jsonb not null default '{}',
  views_count int not null default 0,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Dominio: despacho
-- ------------------------------------------------------------

create table public.localities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  address text,
  locality text,
  phone text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.dispatches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  establishment_id uuid references public.establishments (id),
  customer_id uuid not null references public.customers (id),
  vehicle_id uuid references public.vehicles (id),
  dispatch_date date not null,
  status text not null default 'completed',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.dispatch_items (
  id uuid primary key default gen_random_uuid(),
  dispatch_id uuid not null references public.dispatches (id) on delete cascade,
  production_id uuid references public.productions (id), -- vínculo lote-despacho (recall)
  recipe_id uuid not null references public.recipes (id),
  quantity_kg numeric(12,3) not null
);

create table public.xlsx_imports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  kind text not null default 'dispatch',
  file_url text,
  rows_total int not null default 0,
  rows_ok int not null default 0,
  rows_error int not null default 0,
  result jsonb not null default '{}',
  actor_user_id uuid references public.users (id),
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Dominio: calidad
-- ------------------------------------------------------------

create table public.reports ( -- informes bromatológicos
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  member_id uuid references public.members (id),
  content_html text not null,
  importance int not null default 50 check (importance between 0 and 100),
  notify_member_ids uuid[] not null default '{}',
  report_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.report_attachments (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports (id) on delete cascade,
  url text not null,
  name text not null,
  mime text,
  size int
);

create type analysis_type as enum ('agua','alimentos','productos','superficies','ambiente','materia_prima','bebidas','otro');

create table public.analyses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  type analysis_type not null,
  sample_code text,
  laboratory_id uuid references public.laboratories (id),
  member_id uuid references public.members (id),
  observations_html text,
  conformity int not null default 50 check (conformity between 0 and 100),
  analysis_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.analysis_attachments (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.analyses (id) on delete cascade,
  url text not null,
  name text not null,
  mime text,
  size int
);

-- ------------------------------------------------------------
-- Triggers updated_at
-- ------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'tenants','users','plans','subscriptions','establishments','suppliers',
    'vehicles','members','ingredients','recipes','stock_entries','productions',
    'customers','dispatches','reports','analyses'
  ] loop
    execute format(
      'create trigger set_updated_at before update on public.%I
       for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'tenants','users','tenant_users','plans','subscriptions','feature_flags',
    'tenant_feature_flags','payment_events','audit_logs','email_templates',
    'system_emails','system_email_smtp','tenant_branding','establishments',
    'suppliers','vehicles','laboratories','members','ingredient_families',
    'measure_units','ingredients','recipe_groups','recipes','recipe_ingredients',
    'lot_code_templates','stock_entries','stock_movements','productions',
    'production_inputs','production_reserves','public_traces','localities',
    'customers','dispatches','dispatch_items','xlsx_imports','reports',
    'report_attachments','analyses','analysis_attachments'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Aislamiento estándar por tenant (tablas con tenant_id directo)
do $$
declare t text;
begin
  foreach t in array array[
    'tenant_users','subscriptions','tenant_feature_flags','email_templates',
    'tenant_branding','establishments','suppliers','vehicles','laboratories',
    'members','ingredient_families','ingredients','recipe_groups','recipes',
    'lot_code_templates','stock_entries','stock_movements','productions',
    'production_reserves','localities','customers','dispatches','xlsx_imports',
    'reports','analyses'
  ] loop
    execute format(
      'create policy tenant_isolation on public.%I
       for all to authenticated
       using (tenant_id = public.current_tenant_id())
       with check (tenant_id = public.current_tenant_id())', t);
    execute format(
      'create policy internal_read on public.%I
       for select to authenticated using (public.is_internal())', t);
  end loop;
end $$;

-- Tablas hijas (aislamiento vía padre)
create policy tenant_isolation on public.recipe_ingredients for all to authenticated
  using (exists (select 1 from public.recipes r where r.id = recipe_id and r.tenant_id = public.current_tenant_id()));
create policy tenant_isolation on public.production_inputs for all to authenticated
  using (exists (select 1 from public.productions p where p.id = production_id and p.tenant_id = public.current_tenant_id()));
create policy tenant_isolation on public.dispatch_items for all to authenticated
  using (exists (select 1 from public.dispatches d where d.id = dispatch_id and d.tenant_id = public.current_tenant_id()));
create policy tenant_isolation on public.report_attachments for all to authenticated
  using (exists (select 1 from public.reports r where r.id = report_id and r.tenant_id = public.current_tenant_id()));
create policy tenant_isolation on public.analysis_attachments for all to authenticated
  using (exists (select 1 from public.analyses a where a.id = analysis_id and a.tenant_id = public.current_tenant_id()));

-- Catálogos y casos especiales
create policy own_tenant on public.tenants for select to authenticated
  using (id = public.current_tenant_id() or public.is_internal());
create policy own_user on public.users for select to authenticated
  using (id = auth.uid() or public.is_internal());
create policy own_user_update on public.users for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy plans_public_read on public.plans for select to authenticated using (true);
create policy flags_public_read on public.feature_flags for select to authenticated using (true);
create policy units_read on public.measure_units for select to authenticated
  using (tenant_id is null or tenant_id = public.current_tenant_id());
create policy units_write on public.measure_units for all to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- Traza pública: lectura anónima por slug, escritura del tenant
create policy public_read on public.public_traces for select to anon, authenticated using (true);
create policy tenant_write on public.public_traces for insert to authenticated
  with check (tenant_id = public.current_tenant_id());

-- Auditoría: inserta el sistema, lee staff y el owner de su tenant
create policy internal_read on public.audit_logs for select to authenticated
  using (public.is_internal() or tenant_id = public.current_tenant_id());

-- system_emails / payment_events / system_email_smtp: sin políticas para
-- authenticated → solo service_role (bypassa RLS).

-- Inmutabilidad: stock_movements y public_traces no se actualizan ni borran
-- (sin políticas UPDATE/DELETE para authenticated; service_role solo en jobs justificados).

-- ------------------------------------------------------------
-- Seed: planes (doc 05)
-- ------------------------------------------------------------

insert into public.plans (key, name, monthly_price_ars, monthly_price_usd, limits) values
  ('start', 'Inicio', null, 29, '{
    "max_establishments": 1, "max_users": 3, "max_members": 10,
    "max_recipes": 30, "max_productions_per_month": 100,
    "configurable_forms": false, "api_access": false, "integrations": false,
    "advanced_kpis": false, "quality_module": false
  }'),
  ('pro', 'Pyme', null, 69, '{
    "max_establishments": 1, "max_users": 10, "max_members": null,
    "max_recipes": null, "max_productions_per_month": 1000,
    "configurable_forms": true, "api_access": false, "integrations": false,
    "advanced_kpis": true, "quality_module": true
  }'),
  ('business', 'Industria', null, 139, '{
    "max_establishments": 5, "max_users": 30, "max_members": null,
    "max_recipes": null, "max_productions_per_month": null,
    "configurable_forms": true, "api_access": true, "integrations": true,
    "advanced_kpis": true, "quality_module": true
  }'),
  ('enterprise', 'Corporativo', null, null, '{
    "max_establishments": null, "max_users": null, "max_members": null,
    "max_recipes": null, "max_productions_per_month": null,
    "configurable_forms": true, "api_access": true, "integrations": true,
    "advanced_kpis": true, "quality_module": true, "white_label": true
  }');

-- Unidades globales (heredadas de La Jamonera)
insert into public.measure_units (tenant_id, name, abbr) values
  (null, 'Kilogramo', 'kg'), (null, 'Gramo', 'gr'), (null, 'Mililitro', 'ml'),
  (null, 'Litro', 'lts'), (null, 'Centímetro cúbico', 'cc'), (null, 'Unidad', 'un'),
  (null, 'Gotas', 'gts'), (null, 'Onza', 'oz'), (null, 'Pizca', 'pzc'),
  (null, 'Cucharada', 'cda'), (null, 'Cucharadita', 'cdita');
