-- ============================================================
-- Ninja Food — 0025 drop rpc overloads (HOTFIX)
-- 0024 recreó complete_production y create_dispatch agregando
-- p_establishment_id default null, pero en Postgres una firma
-- distinta es una FUNCION NUEVA: quedaron dos overloads y
-- PostgREST devuelve PGRST203 (ambiguous) en todo RPC call.
-- Se dropean las firmas viejas; las nuevas (con default null)
-- atienden idéntico a los callers existentes.
-- ============================================================

drop function if exists public.complete_production(uuid, numeric, date, jsonb, text, uuid, text);

drop function if exists public.create_dispatch(uuid, date, jsonb, uuid);
