-- ============================================================
-- Ninja Food — 0011 fix submit_form search_path
-- En Supabase, pgcrypto se instala en el schema `extensions`, no en
-- `public`. submit_form (0009) fijaba search_path = public, por lo que
-- crypt() no resolvía (42883 "function crypt(text, text) does not exist")
-- y la verificación de PIN fallaba con un error genérico en vez de
-- invalid_pin. Fix: search_path = public, extensions (mismo cuerpo).
-- Detectado por scripts/smoke-forms.mjs paso 6b contra cloud.
-- ============================================================

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
set search_path = public, extensions
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

    -- bcrypt: crypt(pin, hash) reproduce el hash si el PIN es correcto.
    -- crypt vive en el schema extensions (pgcrypto en Supabase).
    if v_pin_hash is null or extensions.crypt(p_pin, v_pin_hash) <> v_pin_hash then
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
