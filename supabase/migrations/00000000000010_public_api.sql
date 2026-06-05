-- ============================================================
-- Ninja Food — 0010 API pública (v1)
-- Credenciales de la API pública del tenant + webhooks salientes.
-- Detalle del modelo: docs/03-modelo-datos.md §"API pública (v1)".
--
-- api_keys: el SECRET nunca se persiste en claro. Se guarda solo el
--   sha256 hex (key_hash, 64 chars, único) y un prefijo visible
--   (key_prefix, p.ej. "nf_live_a1b2") para identificar la credencial
--   en la UI. El secreto completo se muestra UNA sola vez al crearla.
--   Revocación = soft (revoked_at), nunca DELETE.
-- outbound_webhooks: editable (tabla estándar). Guarda `secret` en
--   claro a propósito: firma HMAC los payloads salientes (a diferencia
--   de api_keys, donde el secreto es del cliente y solo se valida).
--
-- verify_api_key: SECURITY DEFINER + GRANT a anon (justificación abajo).
--   La API pública v1 entra SIN JWT (Authorization: Bearer nf_live_...),
--   así que dentro del request no hay current_tenant_id(); el handler
--   resuelve el tenant a partir del hash de la key. El guard real es que
--   key_hash es un sha256 de 64 hex (no enumerable) y la función NUNCA
--   devuelve filas: solo el {tenant_id, scopes, key_id} de la key exacta.
-- ============================================================

-- pgcrypto ya viene de 0001 (gen_random_uuid / crypt). Defensivo por si
-- esta migración corriera aislada.
create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- api_keys — credenciales de acceso a la API pública del tenant
-- ------------------------------------------------------------

create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  -- sha256 hex (64 chars) del secreto. El secreto en claro NUNCA se guarda.
  key_hash text not null,
  -- prefijo visible para identificar la key en la UI (p.ej. "nf_live_a1b2").
  -- No es secreto: son los primeros chars del token, suficientes para que el
  -- dueño reconozca cuál revoca sin exponer el resto.
  key_prefix text not null,
  -- scopes de lectura concedidos a la key.
  scopes text[] not null default '{}',
  last_used_at timestamptz,
  -- revocación SOFT: una key revocada no se borra (auditoría) y deja de validar.
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

-- Lookup O(1) por hash en cada request de la API; único: un hash = una key.
create unique index api_keys_key_hash_idx on public.api_keys (key_hash);
-- Listado de keys vivas del tenant (oculta las revocadas por defecto en UI).
create index api_keys_tenant_idx on public.api_keys (tenant_id)
  where revoked_at is null;

-- ------------------------------------------------------------
-- outbound_webhooks — endpoints del tenant para eventos salientes
-- ------------------------------------------------------------

create table public.outbound_webhooks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  url text not null,
  -- eventos suscritos: 'production.completed','dispatch.created','stock.low'.
  events text[] not null default '{}',
  -- secreto de firma HMAC de los payloads salientes. Se guarda en claro porque
  -- el emisor (nosotros) necesita el material para firmar cada entrega; el
  -- receptor lo usa para verificar la cabecera de firma. Distinto a api_keys.
  secret text not null,
  is_active boolean not null default true,
  last_delivery_at timestamptz,
  last_delivery_status int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Despacho de eventos: webhooks activos del tenant para un evento dado.
create index outbound_webhooks_tenant_idx on public.outbound_webhooks (tenant_id)
  where deleted_at is null and is_active;

-- ------------------------------------------------------------
-- Trigger updated_at (solo outbound_webhooks; api_keys no se edita,
-- last_used_at lo toca la RPC verify_api_key y revoked_at es soft delete).
-- ------------------------------------------------------------

create trigger set_updated_at before update on public.outbound_webhooks
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------

alter table public.api_keys enable row level security;
alter table public.outbound_webhooks enable row level security;

-- api_keys: aislamiento estándar por tenant + lectura staff.
-- Nota: el SELECT del tenant nunca expone el secreto (no se guarda); solo
-- key_prefix / key_hash / scopes / fechas. La validación entrante NO pasa
-- por estas policies: usa verify_api_key (SECURITY DEFINER) sin JWT.
create policy tenant_isolation on public.api_keys
  for all to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());
create policy internal_read on public.api_keys
  for select to authenticated using (public.is_internal());

-- outbound_webhooks: aislamiento estándar por tenant + lectura staff.
create policy tenant_isolation on public.outbound_webhooks
  for all to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());
create policy internal_read on public.outbound_webhooks
  for select to authenticated using (public.is_internal());

-- ------------------------------------------------------------
-- RPC verify_api_key — valida una key entrante de la API pública.
--
-- Decisión de seguridad (a cargo del arquitecto de datos):
--   SECURITY DEFINER + GRANT a anon. Mismo patrón que el POS resuelve la
--   exposición anónima por slug (public_catalog(text), SECURITY DEFINER,
--   grant a anon, guard interno por el slug pedido).
--
-- Por qué DEFINER+anon y no service_role-only:
--   1. La API pública v1 entra SIN sesión Supabase (Bearer nf_live_...), así
--      que dentro del request NO hay current_tenant_id() ni rol authenticated.
--      Resolver el tenant a partir del hash es justamente el trabajo de esta fn.
--   2. key_hash es un sha256 hex de 64 chars derivado de un secreto aleatorio:
--      el espacio es no enumerable. La función no lista nada; recibe el hash ya
--      calculado y devuelve SOLO la fila exacta (o null). No hay forma de barrer
--      keys ni de leakear de otros tenants.
--   3. Evita exponer el service_role en el edge/handler para una operación de
--      validación de routine (menos superficie de credencial privilegiada).
--   4. search_path fijo ('') + nombres calificados: sin secuestro de search_path.
--
-- Throttle de last_used_at: solo se actualiza si pasaron >60s desde el último
-- uso, para no escribir en cada request (reduce write amplification y bloat).
--
-- Devuelve jsonb {tenant_id, scopes, key_id} si la key existe y NO está
-- revocada; null en cualquier otro caso (no distingue "no existe" de
-- "revocada" hacia afuera: el handler responde 401 igual).
-- ------------------------------------------------------------

create or replace function public.verify_api_key(p_key_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key record;
begin
  if p_key_hash is null or length(p_key_hash) <> 64 then
    return null;
  end if;

  select id, tenant_id, scopes, last_used_at
    into v_key
    from public.api_keys
   where key_hash = p_key_hash
     and revoked_at is null;

  if not found then
    return null;
  end if;

  -- Throttle: una sola escritura por minuto por key, no por request.
  if v_key.last_used_at is null or v_key.last_used_at < now() - interval '60 seconds' then
    update public.api_keys
       set last_used_at = now()
     where id = v_key.id;
  end if;

  return jsonb_build_object(
    'tenant_id', v_key.tenant_id,
    'scopes',    to_jsonb(v_key.scopes),
    'key_id',    v_key.id
  );
end $$;

-- Bloquear el default de Postgres (EXECUTE para PUBLIC) y conceder explícito.
-- anon: la API pública entra sin JWT. authenticated: por si el panel del tenant
-- quisiera previsualizar la validación (guard interno idéntico).
revoke all on function public.verify_api_key(text) from public;
grant execute on function public.verify_api_key(text) to anon, authenticated;

-- ------------------------------------------------------------
-- Notas
-- ------------------------------------------------------------
-- · Sin seed: las keys y webhooks los crea cada tenant desde su panel
--   (Ajustes → API), gated por el plan (limits.api_access / módulo
--   enabled_modules.public_api de tenant_operating_profiles). Nada hardcodeado.
-- · El secreto en claro de api_keys se genera y muestra UNA vez en el handler
--   de creación (app-side): allí se calcula sha256(secret) → key_hash y se
--   deriva key_prefix; la DB solo almacena el hash. Generación del secreto y
--   verificación de scope viven en el edge/handler de la API pública v1.
-- · Mejora futura: rate-limit por key (contador/ventana) y rotación de secret
--   de outbound_webhooks. Fuera del alcance de esta migración.
