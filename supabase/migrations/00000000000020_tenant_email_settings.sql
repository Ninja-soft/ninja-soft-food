-- ============================================================
-- Ninja Food — 0020 tenant email settings
-- Identidad de remitente del tenant para los envios "manuales"
-- (planillas, remitos, recetas, recall, informes) que salen desde
-- /api/emails/send. El SMTP REAL sigue siendo el de plataforma
-- (system_email_smtp): el tenant NO configura servidor propio
-- (decision: simplicidad + entregabilidad). Solo define como se
-- presenta: nombre que firma, email de respuesta y pie opcional.
--
-- Se cuelga de tenant_branding (1:1 con tenant) en vez de una tabla
-- nueva: ya es el hogar natural de la identidad visible del negocio
-- (logo, colores, razon social) y comparte sus politicas RLS.
--
-- Reglas duras: multi-tenant via tenant_branding (RLS heredada,
-- migracion 0001/0006). Regla 6 (emails): el pie no admite emojis ni
-- em-dashes; eso se valida en el cliente/route handler (zod), no en SQL.
-- ============================================================

alter table public.tenant_branding
  -- Nombre que firma los envios del tenant. Si es null, el envio usa
  -- el nombre del negocio (tenants.name) y, en ultima instancia, la
  -- marca de plataforma (system_email_smtp.from_name).
  add column if not exists email_from_name text,
  -- Direccion de respuesta (Reply-To). El From sigue siendo el de
  -- plataforma (no-reply@...); las respuestas del cliente caen aca.
  add column if not exists email_reply_to text,
  -- Pie / firma opcional que se agrega al final del cuerpo del email.
  -- Texto plano (se renderiza escapado). Sin emojis ni em-dashes.
  add column if not exists email_signature text;
