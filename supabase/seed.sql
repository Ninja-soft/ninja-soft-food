-- =============================================================================
-- supabase/seed.sql — datos de arranque para desarrollo local (db reset).
--
-- Las filas de `plans` ya se crean en la migración 00000000000001_core.sql con
-- precios en USD (rail internacional v2) y monthly_price_ars / yearly_price_ars
-- en NULL. Para el MVP de billing (Mercado Pago, ARS nativo) necesitamos los
-- precios en ARS. Esto NO va en una migración nueva a propósito: los precios son
-- comerciales y volátiles (doc 05 §1: "a definir comercialmente"); vivir en el
-- seed permite ajustarlos sin tocar el esquema ni regenerar tipos.
--
-- Anclas: ~USD 25 / 59 / 119 eq. (doc 05 §1) a una referencia de lanzamiento.
-- enterprise queda "a medida" (precio NULL → no se cobra self-service).
-- yearly = 10 meses (2 meses de descuento por pago anual).
--
-- Idempotente: UPDATE por `key`. No aplicar a la nube; se corre con `db reset`.
-- =============================================================================

update public.plans set monthly_price_ars = 24990,  yearly_price_ars = 249900  where key = 'start';
update public.plans set monthly_price_ars = 59990,  yearly_price_ars = 599900  where key = 'pro';
update public.plans set monthly_price_ars = 119990, yearly_price_ars = 1199900 where key = 'business';
-- 'enterprise': sin precio (a medida). Se contrata por ventas, no self-service.

-- =============================================================================
-- Templates de email (overrides por tenant).
--
-- Los defaults GLOBALES viven en el codigo (lib/emails/templates.ts y el espejo
-- de supabase/functions/send_email/index.ts), no en una tabla: la Edge Function
-- usa el catalogo cuando el tenant no tiene override en email_templates. Por eso
-- el seed NO crea filas "globales" (email_templates tiene PK tenant_id+key y
-- requiere un tenant existente).
--
-- Para desarrollo: si hay tenants cargados, les sembramos overrides de las keys
-- principales (welcome -> verify_account, trial_ending, payment_failed,
-- report_notification) para poder editarlos desde el modulo de emails del
-- tenant. Idempotente (ON CONFLICT DO NOTHING). REGLA DURA 6 de CLAUDE.md: sin
-- emojis, sin em-dashes, separador punto medio. Espanol rioplatense.
-- =============================================================================
do $$
declare
  t record;
begin
  for t in select id from public.tenants where deleted_at is null loop
    insert into public.email_templates (tenant_id, key, subject, html, enabled) values
      (t.id, 'verify_account',
       'Confirma tu cuenta en Ninja Food',
       '<p>Hola {{nombre}},</p><p>Gracias por sumarte a Ninja Food. Para activar tu cuenta confirma tu direccion de correo.</p><p><a class="btn" href="{{link}}">Confirmar mi cuenta</a></p><p class="muted">Si vos no creaste esta cuenta, podes ignorar este mensaje.</p>',
       true),
      (t.id, 'report_notification',
       'Nuevo informe bromatologico {{fecha}} en {{negocio}}',
       '<p>Hola {{nombre}},</p><p>Se registro un nuevo informe bromatologico en <strong>{{negocio}}</strong>.</p><table class="data" role="presentation"><tbody><tr><td class="k">Fecha</td><td class="v">{{fecha}}</td></tr><tr><td class="k">Importancia</td><td class="v">{{importancia}} / 100</td></tr></tbody></table><blockquote class="quote">{{extracto}}</blockquote><p><a class="btn" href="{{link}}">Ver el informe completo</a></p>',
       true),
      (t.id, 'trial_ending',
       'Tu prueba de Ninja Food vence en {{dias}} dias',
       '<p>Tu periodo de prueba de <strong>{{negocio}}</strong> termina en <strong>{{dias}} dias</strong> ({{vence}}).</p><p>Activa tu plan para no perder acceso a la trazabilidad y los informes.</p><p><a class="btn" href="{{link}}">Activar mi plan</a></p>',
       true),
      (t.id, 'payment_failed',
       'No pudimos procesar tu pago en Ninja Food',
       '<p>No pudimos procesar el pago de tu suscripcion de <strong>{{negocio}}</strong>.</p><table class="data" role="presentation"><tbody><tr><td class="k">Plan</td><td class="v">{{plan}}</td></tr><tr><td class="k">Monto</td><td class="v">{{monto}}</td></tr></tbody></table><p>Actualiza tu medio de pago para mantener el servicio activo y evitar la suspension.</p><p><a class="btn" href="{{link}}">Actualizar el pago</a></p>',
       true)
    on conflict (tenant_id, key) do nothing;
  end loop;
end $$;
