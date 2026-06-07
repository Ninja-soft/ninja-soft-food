-- ============================================================
-- Ninja Food — 0026 notifications  (paridad POS H13b — F7)
-- Centro de notificaciones in-app por cuenta.
--
-- notifications: mensajes dirigidos por audiencia (todos los negocios /
--   un negocio / un rol dentro del negocio / un usuario puntual), con
--   severidad (info/success/warning/critical/blocking), acción embebida
--   opcional (action_label + action_url), requires_ack y vencimiento.
-- notification_reads: estado por usuario (leída / archivada / ack).
-- internal_notify(): RPC para que el staff (o RPCs del sistema) emitan
--   notificaciones. Composer en /internal/notificaciones.
--
-- Adaptaciones respecto del POS:
--   - Roles de Ninja Food: owner|manager|operator|viewer (no existe 'cashier').
--   - Food no tiene internal_level() como función; el nivel vive en
--     users.internal_level (viewer|editor|admin). El guard bloquea a 'viewer'
--     (equivalente al 'support' del POS: staff de solo lectura no emite).
--   - Food no tiene planes custom por tenant (plans sin tenant_id), por eso
--     NO se porta el auto-aviso de internal_update_custom_plan del POS.
-- ============================================================

create table if not exists public.notifications (
  id               uuid primary key default gen_random_uuid(),
  -- Audiencia: target_tenant_id null = todos los negocios (broadcast).
  target_tenant_id uuid references public.tenants (id) on delete cascade,
  target_role      text check (target_role in ('owner','manager','operator','viewer')),
  target_user_id   uuid references public.users (id) on delete cascade,
  type             text not null default 'news'
                     check (type in ('news','plan','billing','usage','security','afip','maintenance','support')),
  severity         text not null default 'info'
                     check (severity in ('info','success','warning','critical','blocking')),
  title            text not null,
  body             text,
  action_label     text,
  action_url       text,
  requires_ack     boolean not null default false,
  expires_at       timestamptz,
  created_by       uuid references public.users (id),
  created_at       timestamptz not null default now(),
  deleted_at       timestamptz
);

create index if not exists idx_notifications_tenant on public.notifications (target_tenant_id);
create index if not exists idx_notifications_created on public.notifications (created_at desc);

create table if not exists public.notification_reads (
  id              uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications (id) on delete cascade,
  user_id         uuid not null references public.users (id) on delete cascade,
  read_at         timestamptz,
  archived_at     timestamptz,
  acked_at        timestamptz,
  unique (notification_id, user_id)
);

create index if not exists idx_notification_reads_user on public.notification_reads (user_id);

alter table public.notifications enable row level security;
alter table public.notification_reads enable row level security;

-- Lectura: el destinatario (membresía activa del negocio + rol/usuario si
-- aplica) o staff interno. Vencidas/borradas no se listan.
create policy notifications_select on public.notifications
  for select to authenticated using (
    public.is_internal()
    or (
      deleted_at is null
      and (expires_at is null or expires_at > now())
      and (target_tenant_id is null or target_tenant_id = public.current_tenant_id())
      and (target_user_id is null or target_user_id = auth.uid())
      and (
        target_role is null
        or exists (
          select 1 from public.tenant_users me
          where me.tenant_id = public.current_tenant_id()
            and me.user_id = auth.uid()
            and me.role::text = notifications.target_role
        )
      )
      and exists (
        select 1 from public.tenant_users me
        where me.tenant_id = public.current_tenant_id()
          and me.user_id = auth.uid()
      )
    )
  );

-- Escritura de notifications: solo staff interno (composer / sistema vía RPC).
create policy notifications_insert on public.notifications
  for insert to authenticated with check (public.is_internal());
create policy notifications_update on public.notifications
  for update to authenticated using (public.is_internal()) with check (public.is_internal());

-- Estado de lectura: cada usuario maneja SOLO sus filas.
create policy notification_reads_select on public.notification_reads
  for select to authenticated using (user_id = auth.uid() or public.is_internal());
create policy notification_reads_insert on public.notification_reads
  for insert to authenticated with check (user_id = auth.uid());
create policy notification_reads_update on public.notification_reads
  for update to authenticated using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- RPC de emisión (staff o sistema). Devuelve el id creado. Auditado.
create or replace function public.internal_notify(
  p_tenant_id uuid,
  p_role text,
  p_user_id uuid,
  p_type text,
  p_severity text,
  p_title text,
  p_body text default null,
  p_action_label text default null,
  p_action_url text default null,
  p_requires_ack boolean default false,
  p_expires_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_level text;
begin
  if not public.is_internal() then
    raise exception 'forbidden';
  end if;
  -- Food no tiene internal_level() como función: leemos la columna.
  select internal_level into v_level from public.users where id = auth.uid();
  if coalesce(v_level, 'viewer') = 'viewer' then
    raise exception 'forbidden';
  end if;
  if coalesce(btrim(p_title), '') = '' then
    raise exception 'invalid_title';
  end if;

  insert into public.notifications (target_tenant_id, target_role, target_user_id, type,
                                    severity, title, body, action_label, action_url,
                                    requires_ack, expires_at, created_by)
  values (p_tenant_id, p_role, p_user_id, coalesce(p_type, 'news'),
          coalesce(p_severity, 'info'), btrim(p_title), p_body, p_action_label,
          p_action_url, coalesce(p_requires_ack, false), p_expires_at, auth.uid())
  returning id into v_id;

  insert into public.audit_logs (tenant_id, actor_user_id, entity_type, entity_id, action, after_data)
  values (p_tenant_id, auth.uid(), 'notifications', v_id, 'notification_sent',
          jsonb_build_object('title', btrim(p_title), 'severity', coalesce(p_severity, 'info'),
                             'role', p_role, 'user', p_user_id));
  return v_id;
end;
$$;
revoke all on function public.internal_notify(uuid, text, uuid, text, text, text, text, text, text, boolean, timestamptz) from public, anon;
grant execute on function public.internal_notify(uuid, text, uuid, text, text, text, text, text, text, boolean, timestamptz) to authenticated;
