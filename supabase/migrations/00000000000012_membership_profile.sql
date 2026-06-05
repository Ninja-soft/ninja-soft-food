-- ============================================================
-- Ninja Food — 0012 membership profile
-- Perfil del usuario en el tenant (patrón POS): tenant_users gana
-- display_name y avatar (URL del bucket público `members` o key de
-- icono preset). Editable desde el menú de usuario del AppShell.
-- RLS: cubierto por la policy tenant_isolation existente (0001).
-- ============================================================

alter table public.tenant_users
  add column if not exists display_name text,
  add column if not exists avatar text;

comment on column public.tenant_users.display_name is
  'Nombre visible del miembro dentro del tenant (editable por el propio usuario).';
comment on column public.tenant_users.avatar is
  'URL pública (bucket members) o key de icono preset del componente Avatar.';
