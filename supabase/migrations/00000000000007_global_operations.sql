-- ============================================================
-- Ninja Food - 0007 global operations
-- Configuracion internacional por tenant: pais, locale, moneda,
-- impuestos, unidades y reglas de trazabilidad por mercado.
-- ============================================================

create table if not exists public.tenant_operating_profiles (
  tenant_id uuid primary key references public.tenants (id) on delete cascade,
  country text not null default 'AR' check (char_length(country) = 2),
  locale text not null default 'es-AR',
  currency text not null default 'ARS' check (char_length(currency) = 3),
  timezone text not null default 'America/Argentina/Buenos_Aires',
  tax_id_label text not null default 'CUIT',
  tax_id_value text,
  tax_label text not null default 'IVA',
  default_tax_rate numeric(6,3) not null default 21 check (default_tax_rate >= 0),
  measurement_system text not null default 'metric' check (measurement_system in ('metric','us')),
  weight_unit text not null default 'kg' check (weight_unit in ('kg','lb')),
  volume_unit text not null default 'l' check (volume_unit in ('l','gal')),
  temperature_unit text not null default 'celsius' check (temperature_unit in ('celsius','fahrenheit')),
  date_format text not null default 'DD/MM/YYYY' check (date_format in ('DD/MM/YYYY','MM/DD/YYYY','YYYY-MM-DD')),
  compliance_frameworks text[] not null default array['CAA','RNE','RNPA','BPM','POES'],
  label_languages text[] not null default array['es'],
  traceability_config jsonb not null default '{
    "fields": ["lote", "vencimiento", "RNE", "RNPA", "elaborador"],
    "authorities": ["ANMAT", "SENASA", "ARCA"],
    "billing_providers": ["mercadopago", "stripe", "paypal", "manual"]
  }',
  enabled_modules jsonb not null default '{
    "traceability": true,
    "stock": true,
    "recipes": true,
    "production": true,
    "dispatch": true,
    "quality": true,
    "billing": true,
    "public_api": false,
    "exports": true
  }',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at before update on public.tenant_operating_profiles
  for each row execute function public.set_updated_at();

alter table public.tenant_operating_profiles enable row level security;

create policy tenant_isolation on public.tenant_operating_profiles
  for all to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

create policy internal_read on public.tenant_operating_profiles
  for select to authenticated using (public.is_internal());

insert into public.tenant_operating_profiles (tenant_id, country)
select id, country
from public.tenants
on conflict (tenant_id) do nothing;

insert into public.feature_flags (key, description, default_enabled) values
  ('global_country_profiles', 'Perfiles operativos por pais, moneda, locale, impuestos y unidades.', true),
  ('multi_language_trace_pages', 'Trazas publicas y etiquetas preparadas para varios idiomas por tenant.', false),
  ('multi_currency_pricing', 'Precios, costos y suscripciones normalizados por moneda del mercado.', false),
  ('export_compliance_pack', 'Paquetes documentales para HACCP, FSMA, UE 178/2002, BRCGS e IFS.', false)
on conflict (key) do update set
  description = excluded.description,
  default_enabled = excluded.default_enabled;
