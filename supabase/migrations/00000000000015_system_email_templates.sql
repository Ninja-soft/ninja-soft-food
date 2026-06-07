-- ============================================================================
-- 0015 — system_email_templates: overrides GLOBALES de plantillas del sistema.
--
-- Calcado del POS (system_email_templates: key/subject/html editables desde
-- /internal). Hoy en Food los defaults viven en codigo (lib/emails/templates.ts
-- y su espejo en la Edge Function send_email). Esta tabla los hace editables
-- desde la consola staff SIN tocar codigo.
--
-- Cadena de resolucion del subject/html en la Edge Function send_email:
--   1) email_templates (override POR TENANT, ya existente)        -> mas especifico
--   2) system_email_templates (override GLOBAL de plataforma)     -> esta tabla
--   3) DEFAULT_TEMPLATES en codigo (catalogo en send_email/index) -> fallback
--
-- SOLO service_role: sin politicas para anon/authenticated (como
-- system_email_smtp / system_emails). Las escrituras van por el route handler
-- /api/internal/email-templates con requireInternal() + admin client + audit.
-- ============================================================================

create table public.system_email_templates (
  key text primary key,
  subject text not null,
  html text not null,
  updated_by uuid references public.users (id),
  updated_at timestamptz not null default now()
);

alter table public.system_email_templates enable row level security;

-- Sin politicas para authenticated/anon -> solo service_role (bypassa RLS).
-- Mismo criterio que system_emails / system_email_smtp.

create trigger set_updated_at before update on public.system_email_templates
  for each row execute function public.set_updated_at();

comment on table public.system_email_templates is
  'Overrides GLOBALES de plantillas del sistema (subject/html por key del catalogo). Editables desde /internal. Resolucion en send_email: email_templates (tenant) -> system_email_templates (global) -> default en codigo. SOLO service_role.';
