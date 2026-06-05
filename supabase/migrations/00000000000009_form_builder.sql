-- ============================================================
-- Ninja Food — 0009 form builder (planillas configurables)
-- Builder de planillas por tenant (BPM/POES/PCC/temperatura/...) +
-- registros (submissions) INMUTABLES post-firma (regla docs/03 §4).
-- form_templates: editable, soft delete, triggers (como el resto).
-- form_submissions: append-only y PERMANENTE (sin updated_at/deleted_at).
--   - inmutabilidad por RLS (sin policy UPDATE/DELETE para authenticated,
--     patrón stock_movements/public_traces de 0001) Y por trigger BEFORE
--     UPDATE OR DELETE que aborta también a service_role accidental.
--   - correcciones = fila nueva vinculada (corrects_submission_id).
-- RPC submit_form: SECURITY INVOKER (como 0004/0005/0008), valida tenant,
--   template activo y firma con PIN bcrypt contra members.pin_hash.
-- Detalle: docs/03-modelo-datos.md §"Planillas configurables".
-- ============================================================

-- pgcrypto ya viene de 0001; defensivo por si esta migración corre aislada
-- (crypt()/gen_salt() para verificar el PIN bcrypt de members).
create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- Enums
-- ------------------------------------------------------------

create type form_kind as enum (
  'temperatura','limpieza','plagas','recepcion_mp','capacitacion','pcc','custom'
);
create type submission_status as enum ('ok','fail','corrected');

-- ------------------------------------------------------------
-- form_templates — definición del builder (editable por tenant)
-- ------------------------------------------------------------

create table public.form_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  kind form_kind not null default 'custom',
  -- fields: array de campos del builder. Cada item:
  --   {key, label, type(number|text|bool|select|temperature), required bool,
  --    min?, max?, options? text[], unit?}
  fields jsonb not null default '[]',
  -- frequency: {type(daily|weekly|monthly|none), time?, days?}
  frequency jsonb not null default '{"type":"none"}',
  requires_signature boolean not null default true,
  -- action_on_fail: workflow declarativo cuando un registro sale 'fail'
  --   (p.ej. {notify_member_ids:[...], require_corrective_action:true})
  action_on_fail jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ------------------------------------------------------------
-- form_submissions — registros firmados (INMUTABLE / append-only)
-- Sin updated_at ni deleted_at por diseño: nunca se editan ni se borran.
-- ------------------------------------------------------------

create table public.form_submissions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  template_id uuid not null references public.form_templates (id),
  -- firma del operario (members, sin login). Null si el template no la exige.
  submitted_by_member_id uuid references public.members (id),
  values jsonb not null,
  status submission_status not null default 'ok',
  corrective_action text,
  evidence_urls text[] not null default '{}',
  -- corrección = fila nueva que apunta a la submission corregida (mismo template)
  corrects_submission_id uuid references public.form_submissions (id),
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Índices
-- ------------------------------------------------------------

-- Listado/export por planilla, más reciente primero.
create index form_submissions_tenant_template_idx
  on public.form_submissions (tenant_id, template_id, submitted_at desc);
-- Reconstruir la cadena de correcciones de una submission.
create index form_submissions_corrects_idx
  on public.form_submissions (corrects_submission_id)
  where corrects_submission_id is not null;
-- Templates vivos del tenant.
create index form_templates_tenant_idx
  on public.form_templates (tenant_id)
  where deleted_at is null;

-- ------------------------------------------------------------
-- Trigger updated_at (solo form_templates; submissions es inmutable)
-- ------------------------------------------------------------

create trigger set_updated_at before update on public.form_templates
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- Inmutabilidad de form_submissions: defensa en profundidad.
-- RLS ya bloquea UPDATE/DELETE para authenticated (no hay policy), pero
-- service_role bypassa RLS; este trigger aborta cualquier UPDATE, y aborta
-- cualquier DELETE EXCEPTO el cascade de offboarding (cuando el tenant dueño
-- ya no existe: tenants on delete cascade borra el tenant primero y luego sus
-- hijos). Así no se pueden borrar registros vivos, pero sí se puede dar de baja
-- un tenant entero. Un job puntual puede deshabilitar el trigger explícito.
-- ------------------------------------------------------------

create or replace function public.reject_submission_update()
returns trigger language plpgsql as $$
begin
  raise exception 'immutable_submission'
    using hint = 'form_submissions es append-only; las correcciones crean una fila nueva (corrects_submission_id)';
end $$;

create or replace function public.reject_submission_delete()
returns trigger language plpgsql as $$
begin
  -- Permitir solo el borrado en cascada por baja del tenant (el tenant ya no existe).
  if exists (select 1 from public.tenants t where t.id = old.tenant_id) then
    raise exception 'immutable_submission'
      using hint = 'form_submissions es permanente (auditoría); no se borra mientras el tenant exista';
  end if;
  return old;
end $$;

create trigger no_update_form_submissions
  before update on public.form_submissions
  for each row execute function public.reject_submission_update();

create trigger no_delete_form_submissions
  before delete on public.form_submissions
  for each row execute function public.reject_submission_delete();

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------

alter table public.form_templates enable row level security;
alter table public.form_submissions enable row level security;

-- form_templates: aislamiento estándar (editable) + lectura staff.
create policy tenant_isolation on public.form_templates
  for all to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());
create policy internal_read on public.form_templates
  for select to authenticated using (public.is_internal());

-- form_submissions: SOLO INSERT + SELECT por tenant. Sin UPDATE/DELETE para
-- authenticated (patrón stock_movements/public_traces) → inmutable por RLS.
create policy tenant_insert on public.form_submissions
  for insert to authenticated
  with check (tenant_id = public.current_tenant_id());
create policy tenant_select on public.form_submissions
  for select to authenticated
  using (tenant_id = public.current_tenant_id());
create policy internal_read on public.form_submissions
  for select to authenticated using (public.is_internal());

-- ------------------------------------------------------------
-- RPC submit_form — registra una planilla, validando firma con PIN.
-- SECURITY INVOKER: RLS aplica con el JWT del usuario (defensa en
-- profundidad, además del chequeo explícito de current_tenant_id()).
-- Devuelve {submission_id, signed}.
-- ------------------------------------------------------------

create or replace function public.submit_form(
  p_template_id uuid,
  p_values jsonb,
  p_member_id uuid default null,
  p_pin text default null,
  p_status text default 'ok',
  p_corrective_action text default null,
  p_corrects uuid default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_template record;
  v_pin_hash text;
  v_status submission_status;
  v_signed boolean := false;
  v_member_id uuid := null;
  v_submission_id uuid;
begin
  if v_tenant is null then
    raise exception 'no_tenant';
  end if;

  -- Estado válido (cast explícito para mensaje propio en vez de error de enum)
  begin
    v_status := p_status::submission_status;
  exception when invalid_text_representation then
    raise exception 'invalid_status';
  end;

  if p_values is null or jsonb_typeof(p_values) <> 'object' then
    raise exception 'invalid_values';
  end if;

  -- Template del tenant y activo
  select * into v_template
    from public.form_templates
   where id = p_template_id
     and tenant_id = v_tenant
     and deleted_at is null;
  if not found then
    raise exception 'template_not_found';
  end if;
  if not v_template.is_active then
    raise exception 'template_inactive';
  end if;

  -- Firma: si el template la exige, member + PIN obligatorios y válidos
  if v_template.requires_signature then
    if p_member_id is null or p_pin is null or length(trim(p_pin)) = 0 then
      raise exception 'signature_required';
    end if;

    select pin_hash into v_pin_hash
      from public.members
     where id = p_member_id
       and tenant_id = v_tenant
       and deleted_at is null;
    if not found then
      raise exception 'member_not_found';
    end if;

    -- bcrypt: crypt(pin, hash) reproduce el hash si el PIN es correcto
    if v_pin_hash is null or crypt(p_pin, v_pin_hash) <> v_pin_hash then
      raise exception 'invalid_pin';
    end if;

    v_signed := true;
    v_member_id := p_member_id;
  elsif p_member_id is not null then
    -- Firma opcional: si igual mandan member, validarlo (sin PIN obligatorio)
    if not exists (
      select 1 from public.members
       where id = p_member_id and tenant_id = v_tenant and deleted_at is null
    ) then
      raise exception 'member_not_found';
    end if;
    v_member_id := p_member_id;
  end if;

  -- Corrección: la submission corregida debe ser del mismo tenant y template
  if p_corrects is not null then
    if not exists (
      select 1 from public.form_submissions
       where id = p_corrects
         and tenant_id = v_tenant
         and template_id = p_template_id
    ) then
      raise exception 'corrects_not_found';
    end if;
  end if;

  insert into public.form_submissions (
    tenant_id, template_id, submitted_by_member_id, values, status,
    corrective_action, corrects_submission_id
  ) values (
    v_tenant, p_template_id, v_member_id, p_values, v_status,
    nullif(trim(coalesce(p_corrective_action, '')), ''), p_corrects
  ) returning id into v_submission_id;

  return jsonb_build_object(
    'submission_id', v_submission_id,
    'signed', v_signed
  );
end $$;

-- ------------------------------------------------------------
-- Notas
-- ------------------------------------------------------------
-- · Sin seed: los templates default por rubro (BPM/POES/temperatura...) se
--   crean app-side al onboardear el tenant (regla 10: nada hardcodeado).
-- · Mejora futura: rate-limit de intentos de PIN (tabla/contador por member o
--   por IP). Fuera del alcance de esta migración.
