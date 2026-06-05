-- ============================================================
-- Ninja Food — 0003 storage
-- Buckets namespaced por tenant: la primera carpeta del path es
-- SIEMPRE el tenant_id (regla: docs/04-arquitectura.md §9).
-- ============================================================

-- Imágenes públicas (lectura anónima, escritura del tenant)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('ingredients', 'ingredients', true, 5242880, array['image/jpeg','image/png','image/webp']),
  ('recipes', 'recipes', true, 5242880, array['image/jpeg','image/png','image/webp']),
  ('members', 'members', true, 5242880, array['image/jpeg','image/png','image/webp']),
  ('branding', 'branding', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

-- Privados (facturas, adjuntos de calidad) — acceso solo del tenant
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('invoices', 'invoices', false, 10485760, array['image/jpeg','image/png','image/webp','application/pdf']),
  ('attachments', 'attachments', false, 10485760, null)
on conflict (id) do nothing;

-- Escritura: solo en la carpeta del propio tenant (todos los buckets)
create policy tenant_storage_insert on storage.objects
  for insert to authenticated
  with check ((storage.foldername(name))[1] = public.current_tenant_id()::text);

create policy tenant_storage_update on storage.objects
  for update to authenticated
  using ((storage.foldername(name))[1] = public.current_tenant_id()::text);

create policy tenant_storage_delete on storage.objects
  for delete to authenticated
  using ((storage.foldername(name))[1] = public.current_tenant_id()::text);

-- Lectura autenticada de los buckets privados, solo carpeta propia
create policy tenant_storage_select on storage.objects
  for select to authenticated
  using (
    bucket_id in ('invoices', 'attachments')
    and (storage.foldername(name))[1] = public.current_tenant_id()::text
  );
