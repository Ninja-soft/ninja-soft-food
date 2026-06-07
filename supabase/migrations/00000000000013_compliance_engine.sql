-- ============================================================
-- Ninja Food — 0013 compliance engine
-- Motor de compliance internacional: reemplaza el hardcodeo
-- argentino (RNE/RNPA/RUCA/UTA/URA, octógonos Ley 27.642, sello
-- ABR, CUIT) por estructuras genéricas resueltas por país.
-- El catálogo de permit_type y sistemas de rotulado vive en
-- lib/globalization (NO en SQL). Detalle: docs/03-modelo-datos.md,
-- gap 1 de docs/11-auditoria-2026-06.md.
--
-- Las columnas viejas (rne_*, rnpa_*, uta_*, ura_*, front_labels,
-- sello_abr_enabled, cuit) QUEDAN congeladas/deprecated y se
-- dropean en una migración futura, una vez migrada la lectura.
-- ============================================================

-- ------------------------------------------------------------
-- 1. regulatory_permits — tabla genérica de permisos regulatorios
--    Absorbe RNE/RNPA/RUCA/UTA/URA y habilita permisos de otros
--    países (cofepris_aviso_funcionamiento, fda_facility, etc.).
-- ------------------------------------------------------------

create table public.regulatory_permits (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  entity_type text not null
    check (entity_type in ('tenant','establishment','supplier','vehicle','recipe')),
  entity_id uuid not null,
  permit_type text not null,        -- catálogo en lib/globalization, no en SQL
  permit_number text not null,
  issued_at date,
  expires_at date,
  attachment_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create trigger set_updated_at before update on public.regulatory_permits
  for each row execute function public.set_updated_at();

-- Lookup por entidad (la consulta más común: permisos de un establecimiento/receta).
create index regulatory_permits_entity_idx
  on public.regulatory_permits (tenant_id, entity_type, entity_id)
  where deleted_at is null;

-- Alertas de vencimiento por tenant.
create index regulatory_permits_expiry_idx
  on public.regulatory_permits (tenant_id, expires_at)
  where deleted_at is null and expires_at is not null;

-- Un permiso de cada tipo por entidad (los vencidos/borrados no cuentan).
create unique index regulatory_permits_unique_active
  on public.regulatory_permits (tenant_id, entity_type, entity_id, permit_type)
  where deleted_at is null;

alter table public.regulatory_permits enable row level security;

create policy tenant_isolation on public.regulatory_permits
  for all to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

create policy internal_read on public.regulatory_permits
  for select to authenticated using (public.is_internal());

comment on table public.regulatory_permits is
  'Permisos regulatorios genéricos por entidad. permit_type/permit_number absorben RNE/RNPA/RUCA/UTA/URA y permisos de cualquier país. Catálogo de tipos en lib/globalization.';

-- ------------------------------------------------------------
-- 2. recipes.regulatory_labels — sistema de rotulado por país
--    Shape: {"system":"<id>","values":["..."]}. Sistemas válidos
--    (validados en app): ar_octogonos, mx_nom051, cl_sellos,
--    br_anvisa, eu_nutriscore, us_fda.
-- ------------------------------------------------------------

alter table public.recipes
  add column if not exists regulatory_labels jsonb;

-- Check liviano: si no es null, debe traer la key "system" (los valores
-- se validan en app, no con constraint rígida — distintos sistemas, distintas reglas).
alter table public.recipes
  add constraint recipes_regulatory_labels_shape
  check (regulatory_labels is null or regulatory_labels ? 'system');

comment on column public.recipes.regulatory_labels is
  'Sistema de rotulado frontal resuelto por país: {"system":"ar_octogonos|mx_nom051|cl_sellos|br_anvisa|eu_nutriscore|us_fda","values":[...]}. Reemplaza front_labels.';
comment on column public.recipes.front_labels is
  'DEPRECATED: octógonos Ley 27.642 (AR-only). Migrado a regulatory_labels. Se dropea en migración futura.';

-- ------------------------------------------------------------
-- 3. tenant_branding.regulatory_seals — sellos/avales por tenant
--    Array de {"type":"abr","enabled":true,"logo_url":null}.
--    Reemplaza el booleano sello_abr_enabled (ARG-only).
-- ------------------------------------------------------------

alter table public.tenant_branding
  add column if not exists regulatory_seals jsonb not null default '[]';

comment on column public.tenant_branding.regulatory_seals is
  'Sellos/avales del tenant: [{"type":"abr","enabled":true,"logo_url":null}]. Reemplaza sello_abr_enabled.';
comment on column public.tenant_branding.sello_abr_enabled is
  'DEPRECATED: aval ABR como booleano (AR-only). Migrado a regulatory_seals. Se dropea en migración futura.';

-- ------------------------------------------------------------
-- 4. tenants.tax_id / suppliers.tax_id — identificador fiscal genérico
--    Reemplaza cuit (AR-only). La etiqueta (CUIT/RFC/CNPJ/...) la
--    resuelve tenant_operating_profiles.tax_id_label por país.
-- ------------------------------------------------------------

alter table public.tenants
  add column if not exists tax_id text;
alter table public.suppliers
  add column if not exists tax_id text;

comment on column public.tenants.tax_id is
  'Identificador fiscal genérico (CUIT/RFC/CNPJ/EIN/...). Etiqueta por país vía tenant_operating_profiles.tax_id_label.';
comment on column public.tenants.cuit is
  'DEPRECATED: CUIT (AR-only). Migrado a tax_id. Se dropea en migración futura.';
comment on column public.suppliers.tax_id is
  'Identificador fiscal genérico del proveedor. Etiqueta por país vía operating profile.';
comment on column public.suppliers.cuit is
  'DEPRECATED: CUIT del proveedor (AR-only). Migrado a tax_id. Se dropea en migración futura.';

-- ------------------------------------------------------------
-- 5. compliance_frameworks por país
--    Función pura reusable + corrección de perfiles existentes
--    no-AR + trigger que crea el operating profile de tenants
--    nuevos con los frameworks correctos de su país.
-- ------------------------------------------------------------

create or replace function public.default_compliance_frameworks(country_code text)
returns text[] language sql immutable as $$
  select case upper(coalesce(country_code, ''))
    when 'AR' then array['CAA','RNE','RNPA','BPM','POES']
    when 'MX' then array['NOM-051','COFEPRIS','HACCP']
    when 'CL' then array['RSA','Ley 20.606','HACCP']
    when 'BR' then array['ANVISA','SIF','HACCP']
    when 'ES' then array['RGSEAA','Reg UE 1169/2011','APPCC']
    when 'US' then array['FDA','FSMA','HACCP']
    else array['HACCP','BPM']
  end
$$;

comment on function public.default_compliance_frameworks(text) is
  'Frameworks regulatorios por país (ISO-3166 alpha-2). default → {HACCP,BPM}. Espejo SQL de lib/globalization.';

-- Trigger: cada tenant nuevo nace con su operating profile resuelto por país
-- (create_tenant ya no depende de seedearlo a mano y nunca queda sin perfil).
create or replace function public.create_default_operating_profile()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.tenant_operating_profiles (tenant_id, country, compliance_frameworks)
  values (
    new.id,
    coalesce(new.country, 'AR'),
    public.default_compliance_frameworks(new.country)
  )
  on conflict (tenant_id) do nothing;
  return new;
end $$;

create trigger create_operating_profile_after_tenant
  after insert on public.tenants
  for each row execute function public.create_default_operating_profile();

-- Corregir perfiles existentes no-AR que quedaron con los frameworks argentinos
-- por el default de la columna (0007). Solo si todavía traen el set AR exacto
-- (no pisar lo que el tenant haya personalizado a mano).
update public.tenant_operating_profiles op
set compliance_frameworks = public.default_compliance_frameworks(op.country)
where upper(op.country) <> 'AR'
  and op.compliance_frameworks = array['CAA','RNE','RNPA','BPM','POES'];

-- ------------------------------------------------------------
-- 6. Backfills idempotentes (solo tenants AR o legacy sin país)
--    Los permits son conceptos argentinos: NO crear para otros países.
--    Reusables: el unique index parcial hace que un re-run no duplique.
-- ------------------------------------------------------------

-- Conjunto de tenants elegibles para backfill (AR o legacy sin país definido).
-- tenants.country es NOT NULL default 'AR', así que en la práctica son los AR;
-- el filtro deja la puerta abierta a datos legacy con country en blanco.

-- 6.1 establishments.rne_* → permit 'rne'
insert into public.regulatory_permits
  (tenant_id, entity_type, entity_id, permit_type, permit_number, expires_at, attachment_url)
select e.tenant_id, 'establishment', e.id, 'rne', e.rne_number, e.rne_expiry, e.rne_attachment_url
from public.establishments e
join public.tenants t on t.id = e.tenant_id
where e.deleted_at is null
  and e.rne_number is not null and btrim(e.rne_number) <> ''
  and (t.country is null or upper(t.country) = 'AR')
on conflict do nothing;

-- 6.1b establishments.ruca_* → permit 'ruca' (cárnicos)
insert into public.regulatory_permits
  (tenant_id, entity_type, entity_id, permit_type, permit_number, expires_at)
select e.tenant_id, 'establishment', e.id, 'ruca', e.ruca_number, e.ruca_expiry
from public.establishments e
join public.tenants t on t.id = e.tenant_id
where e.deleted_at is null
  and e.ruca_number is not null and btrim(e.ruca_number) <> ''
  and (t.country is null or upper(t.country) = 'AR')
on conflict do nothing;

-- 6.2 suppliers.rne_* → permit 'rne' (cuit NO: no es un permiso → va a tax_id)
insert into public.regulatory_permits
  (tenant_id, entity_type, entity_id, permit_type, permit_number, expires_at, attachment_url)
select s.tenant_id, 'supplier', s.id, 'rne', s.rne_number, s.rne_expiry, s.rne_attachment_url
from public.suppliers s
join public.tenants t on t.id = s.tenant_id
where s.deleted_at is null
  and s.rne_number is not null and btrim(s.rne_number) <> ''
  and (t.country is null or upper(t.country) = 'AR')
on conflict do nothing;

-- 6.3 recipes.rnpa_* → permit 'rnpa' (salvo rnpa_exempt=true)
insert into public.regulatory_permits
  (tenant_id, entity_type, entity_id, permit_type, permit_number, expires_at, attachment_url)
select r.tenant_id, 'recipe', r.id, 'rnpa', r.rnpa_number, r.rnpa_expiry, r.rnpa_attachment_url
from public.recipes r
join public.tenants t on t.id = r.tenant_id
where r.deleted_at is null
  and r.rnpa_exempt is not true
  and r.rnpa_number is not null and btrim(r.rnpa_number) <> ''
  and (t.country is null or upper(t.country) = 'AR')
on conflict do nothing;

-- 6.4 vehicles.uta_* → permit 'uta'
insert into public.regulatory_permits
  (tenant_id, entity_type, entity_id, permit_type, permit_number, expires_at)
select v.tenant_id, 'vehicle', v.id, 'uta', v.uta_number, v.uta_expiry
from public.vehicles v
join public.tenants t on t.id = v.tenant_id
where v.deleted_at is null
  and v.uta_number is not null and btrim(v.uta_number) <> ''
  and (t.country is null or upper(t.country) = 'AR')
on conflict do nothing;

-- 6.4b vehicles.ura_* → permit 'ura'
insert into public.regulatory_permits
  (tenant_id, entity_type, entity_id, permit_type, permit_number, expires_at)
select v.tenant_id, 'vehicle', v.id, 'ura', v.ura_number, v.ura_expiry
from public.vehicles v
join public.tenants t on t.id = v.tenant_id
where v.deleted_at is null
  and v.ura_number is not null and btrim(v.ura_number) <> ''
  and (t.country is null or upper(t.country) = 'AR')
on conflict do nothing;

-- 6.5 recipes.front_labels (no vacío) → regulatory_labels ar_octogonos
update public.recipes r
set regulatory_labels = jsonb_build_object(
  'system', 'ar_octogonos',
  'values', to_jsonb(r.front_labels)
)
from public.tenants t
where t.id = r.tenant_id
  and r.deleted_at is null
  and r.regulatory_labels is null
  and r.front_labels is not null
  and array_length(r.front_labels, 1) > 0
  and (t.country is null or upper(t.country) = 'AR');

-- 6.6 tenant_branding.sello_abr_enabled=true → regulatory_seals [{abr}]
update public.tenant_branding tb
set regulatory_seals = jsonb_build_array(
  jsonb_build_object('type', 'abr', 'enabled', true)
)
from public.tenants t
where t.id = tb.tenant_id
  and tb.sello_abr_enabled is true
  and tb.regulatory_seals = '[]'::jsonb
  and (t.country is null or upper(t.country) = 'AR');

-- 6.7 tenants.cuit → tax_id (todos: tax_id es genérico, no AR-only)
update public.tenants
set tax_id = cuit
where tax_id is null and cuit is not null and btrim(cuit) <> '';

-- 6.8 suppliers.cuit → tax_id
update public.suppliers
set tax_id = cuit
where tax_id is null and cuit is not null and btrim(cuit) <> '';
