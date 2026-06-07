-- ============================================================
-- Ninja Food — 0016 production photo
-- Foto opcional del producto terminado en la producción. Se captura
-- DESPUÉS de completar la producción (la RPC complete_production 0005
-- está congelada y no se toca), por lo que NO forma parte del snapshot
-- inmutable de public_traces.payload (regla dura 5). Es un dato vivo y
-- complementario: la traza pública lo lee del registro de producción
-- (public_traces.production_id -> productions.photo_url), nunca del payload.
--
-- Reusa el bucket público `recipes` (0003_storage), apto para imágenes de
-- producto, con paths namespaced por tenant (<tenant_id>/productions/...).
-- No se crea bucket nuevo.
-- ============================================================

alter table public.productions
  add column if not exists photo_url text null;

comment on column public.productions.photo_url is
  'URL pública de la foto del producto terminado (bucket recipes, path <tenant_id>/productions/...). Dato vivo y complementario: NO entra en el snapshot inmutable de public_traces.payload (regla 5). La traza pública la lee del registro vivo.';
