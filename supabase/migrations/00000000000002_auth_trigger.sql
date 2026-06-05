-- ============================================================
-- Ninja Food — 0002 auth trigger
-- Espejo de auth.users en public.users (patrón POS).
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', null)
  )
  on conflict (id) do update
    set email = excluded.email;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Mantener email sincronizado ante cambios
create trigger on_auth_user_updated
  after update of email on auth.users
  for each row execute function public.handle_new_user();
