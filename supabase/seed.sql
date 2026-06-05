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
