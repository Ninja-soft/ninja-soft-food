-- ============================================================
-- Ninja Food — 0006 branding
-- Marca del negocio (patrón BrandingCard del POS): logo, color
-- de resalte y datos legales del tenant.
-- ============================================================

alter table public.tenant_branding
  add column if not exists accent text not null default '#3FA34D',
  add column if not exists legal_name text,
  add column if not exists cuit text,
  add column if not exists phone text,
  add column if not exists address text;
