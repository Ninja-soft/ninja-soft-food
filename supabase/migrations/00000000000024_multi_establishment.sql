-- ============================================================
-- Ninja Food — 0024 multi-establecimiento (plan Industria)
-- ------------------------------------------------------------
-- Un tenant industrial opera N plantas (establishments, ya existe desde 0001)
-- con STOCK y PRODUCCIÓN separados por planta. Diseño completo:
-- docs/12-multi-establecimiento.md.
--
-- stock_entries / productions / dispatches YA tienen establishment_id (0001).
-- create_stock_entry YA acepta p_establishment_id (0004). Esta migración:
--   1) agrega establishment_id NULLABLE a form_templates, form_submissions y
--      vehicles (+ FKs + índices parciales por planta);
--   2) crea los índices parciales (tenant_id, establishment_id) que faltaban en
--      las tablas que ya tenían la columna;
--   3) CREATE OR REPLACE de complete_production (base: 0021, la vigente) y
--      create_dispatch (base: 0008) agregando p_establishment_id default null.
--
-- COMPATIBILIDAD: establishment_id nullable en todas partes = datos legacy y
-- tenants mono-planta siguen funcionando. El parámetro nuevo de las RPCs tiene
-- DEFAULT NULL, así que los callers existentes (que no lo pasan) se comportan
-- EXACTAMENTE como hoy. Es el MISMO nombre de función con un parámetro con
-- default (NO una sobrecarga): PostgREST la resuelve sin ambigüedad.
--
-- RLS: NO cambia. establishment_id es un filtro de negocio DENTRO del tenant,
-- no un límite de aislamiento. El aislamiento sigue siendo tenant-level por
-- current_tenant_id() (las políticas de 0001/0009 ya cubren estas tablas).
-- Restricción por usuario (user_establishments) queda para v2 (ver doc §2).
-- ============================================================

-- ------------------------------------------------------------
-- 1) Columnas establishment_id NULLABLE + FKs
-- ------------------------------------------------------------

-- vehicles: del TENANT; opcionalmente "base" en una planta (nullable).
alter table public.vehicles
  add column if not exists establishment_id uuid references public.establishments (id);

-- form_templates: planilla de una planta o GLOBAL del tenant (null = global).
alter table public.form_templates
  add column if not exists establishment_id uuid references public.establishments (id);

-- form_submissions: registro firmado en una planta o global (null). Inmutable:
-- se setea en el INSERT y no se edita. La RPC submit_form (0009/0011) queda
-- frozen; el campo nace nullable (default null) y se poblará cuando la fase de
-- UI extienda submit_form en una migración posterior.
alter table public.form_submissions
  add column if not exists establishment_id uuid references public.establishments (id);

-- ------------------------------------------------------------
-- 2) Índices parciales (tenant_id, establishment_id)
--    Soportan el filtro "datos de esta planta" del selector de UI.
-- ------------------------------------------------------------

-- Tablas con soft delete: índice de filas vivas.
create index if not exists stock_entries_tenant_estab_idx
  on public.stock_entries (tenant_id, establishment_id)
  where deleted_at is null;

create index if not exists productions_tenant_estab_idx
  on public.productions (tenant_id, establishment_id)
  where deleted_at is null;

create index if not exists dispatches_tenant_estab_idx
  on public.dispatches (tenant_id, establishment_id)
  where deleted_at is null;

create index if not exists form_templates_tenant_estab_idx
  on public.form_templates (tenant_id, establishment_id)
  where deleted_at is null;

create index if not exists vehicles_tenant_estab_idx
  on public.vehicles (tenant_id, establishment_id)
  where deleted_at is null;

-- form_submissions es append-only (sin deleted_at): índice total.
create index if not exists form_submissions_tenant_estab_idx
  on public.form_submissions (tenant_id, establishment_id);

-- ------------------------------------------------------------
-- 3a) complete_production — base EXACTA de 0021 (la vigente, con
--     regulatory_labels en el payload) + p_establishment_id default null.
--     Setea productions.establishment_id y, si hay planta, limita el consumo
--     de lotes a esa planta (o lotes legacy sin planta). Con null = idéntico
--     a hoy (regla 5: solo afecta producciones NUEVAS).
-- ------------------------------------------------------------

-- inputs: jsonb [{ingredient_id, stock_entry_id|null, taken_qty, is_substitute, source_ingredient_id|null}]
create or replace function public.complete_production(
  p_recipe_id uuid,
  p_quantity_kg numeric,
  p_production_date date,
  p_inputs jsonb,
  p_product_lot_number text default null,
  p_manager_member_id uuid default null,
  p_notes text default null,
  p_establishment_id uuid default null
) returns jsonb
language plpgsql as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_recipe record;
  v_input record;
  v_remaining numeric;
  v_production_id uuid;
  v_counter int;
  v_code text;
  v_lot text;
  v_packaging_date date;
  v_expiry date;
  v_slug text;
  v_payload jsonb;
begin
  if v_tenant is null then
    raise exception 'no_tenant';
  end if;
  if p_quantity_kg is null or p_quantity_kg <= 0 then
    raise exception 'invalid_quantity';
  end if;

  select * into v_recipe
    from public.recipes
   where id = p_recipe_id and tenant_id = v_tenant and deleted_at is null;
  if not found then
    raise exception 'recipe_not_found';
  end if;

  -- Establecimiento (opcional): debe ser del tenant.
  if p_establishment_id is not null and not exists (
    select 1 from public.establishments
     where id = p_establishment_id and tenant_id = v_tenant and deleted_at is null
  ) then
    raise exception 'establishment_not_found';
  end if;

  -- Código secuencial por tenant (lock por fila del contador)
  insert into public.production_counters (tenant_id, last_value)
  values (v_tenant, 0)
  on conflict (tenant_id) do nothing;

  update public.production_counters
     set last_value = last_value + 1
   where tenant_id = v_tenant
  returning last_value into v_counter;

  v_code := 'PROD-' || lpad(v_counter::text, 5, '0');

  -- Lote del producto: manual o autogenerado (fecha + secuencia)
  v_lot := coalesce(
    nullif(trim(p_product_lot_number), ''),
    'L' || to_char(p_production_date, 'YYMMDD') || '-' || lpad(v_counter::text, 4, '0')
  );

  -- Vencimiento: producción (+aging si corresponde) + vida útil
  v_packaging_date := p_production_date;
  if v_recipe.packaging_delay_type = 'aging' then
    v_packaging_date := p_production_date + coalesce(v_recipe.aging_days, 0);
  end if;
  v_expiry := v_packaging_date + v_recipe.shelf_life_days;

  insert into public.productions (
    tenant_id, establishment_id, recipe_id, code, status, production_date,
    packaging_date, manager_member_id, quantity_kg, product_lot_number,
    product_expiry_date, shelf_life_snapshot, aging_snapshot, notes
  ) values (
    v_tenant, p_establishment_id, p_recipe_id, v_code, 'completed', p_production_date,
    v_packaging_date, p_manager_member_id, p_quantity_kg, v_lot, v_expiry,
    v_recipe.shelf_life_days, v_recipe.aging_days, p_notes
  ) returning id into v_production_id;

  -- Consumir lotes
  for v_input in
    select *
      from jsonb_to_recordset(p_inputs) as x(
        ingredient_id uuid,
        stock_entry_id uuid,
        taken_qty numeric,
        is_substitute boolean,
        source_ingredient_id uuid
      )
  loop
    if v_input.taken_qty is null or v_input.taken_qty <= 0 then
      raise exception 'invalid_input_qty';
    end if;

    insert into public.production_inputs (
      production_id, ingredient_id, required_qty, stock_entry_id,
      taken_qty, is_substitute, source_ingredient_id
    ) values (
      v_production_id, v_input.ingredient_id, v_input.taken_qty,
      v_input.stock_entry_id, v_input.taken_qty,
      coalesce(v_input.is_substitute, false), v_input.source_ingredient_id
    );

    -- stock_entry_id null = "stock infinito" (sin trazabilidad de origen)
    if v_input.stock_entry_id is not null then
      update public.stock_entries
         set remaining_quantity = remaining_quantity - v_input.taken_qty
       where id = v_input.stock_entry_id
         and tenant_id = v_tenant
         and ingredient_id = v_input.ingredient_id
         -- Si hay planta, consumir solo lotes de esa planta (o legacy sin planta).
         -- Con p_establishment_id null = comportamiento idéntico al actual.
         and (p_establishment_id is null
              or establishment_id is null
              or establishment_id = p_establishment_id)
      returning remaining_quantity into v_remaining;

      if not found then
        raise exception 'entry_not_found';
      end if;
      if v_remaining < 0 then
        raise exception 'insufficient_stock';
      end if;

      insert into public.stock_movements (
        tenant_id, ingredient_id, stock_entry_id, type, quantity,
        production_id, actor_user_id
      ) values (
        v_tenant, v_input.ingredient_id, v_input.stock_entry_id,
        'production', -v_input.taken_qty, v_production_id, auth.uid()
      );
    end if;
  end loop;

  -- Traza pública: snapshot INMUTABLE (no cambia si después editan la receta)
  v_slug := lower(replace(v_code, 'PROD-', '')) || '-' ||
            substr(md5(v_production_id::text || clock_timestamp()::text), 1, 8);

  select jsonb_build_object(
    'code', v_code,
    'product_lot', v_lot,
    'recipe_title', v_recipe.title,
    'commercial_name', v_recipe.commercial_name,
    'category', v_recipe.category,
    'production_date', p_production_date,
    'packaging_date', v_packaging_date,
    'expiry_date', v_expiry,
    'quantity_kg', p_quantity_kg,
    'rnpa_number', v_recipe.rnpa_number,
    'rnpa_exempt', v_recipe.rnpa_exempt,
    -- front_labels: octógonos AR legacy (DEPRECATED). Se mantiene para no romper
    -- trazas/lectores existentes; el rotulado canónico por país es el de abajo.
    'front_labels', to_jsonb(v_recipe.front_labels),
    -- regulatory_labels: rotulado frontal resuelto por país ({"system","values"}).
    -- AGREGADO en 0021: sin esto, un tenant no-AR producía trazas sin sellos.
    'regulatory_labels', v_recipe.regulatory_labels,
    'inputs', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'ingredient', i.name,
        'lot', se.lot_number,
        'supplier', s.name,
        'no_origin', pi.stock_entry_id is null
      )), '[]'::jsonb)
        from public.production_inputs pi
        join public.ingredients i on i.id = pi.ingredient_id
        left join public.stock_entries se on se.id = pi.stock_entry_id
        left join public.suppliers s on s.id = se.supplier_id
       where pi.production_id = v_production_id
    )
  ) into v_payload;

  insert into public.public_traces (tenant_id, production_id, slug, payload)
  values (v_tenant, v_production_id, v_slug, v_payload);

  return jsonb_build_object(
    'production_id', v_production_id,
    'code', v_code,
    'product_lot', v_lot,
    'expiry_date', v_expiry,
    'trace_slug', v_slug
  );
end $$;

-- ------------------------------------------------------------
-- 3b) create_dispatch — base EXACTA de 0008 + p_establishment_id default null.
--     Setea dispatches.establishment_id. Con null = idéntico a hoy.
--     SECURITY INVOKER + search_path como 0008.
-- ------------------------------------------------------------

-- items: jsonb [{recipe_id, production_id|null, quantity_kg}]
create or replace function public.create_dispatch(
  p_customer_id uuid,
  p_dispatch_date date,
  p_items jsonb,
  p_vehicle_id uuid default null,
  p_establishment_id uuid default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_item record;
  v_dispatch_id uuid;
  v_count int := 0;
  v_recipe_ok boolean;
  v_prod_status production_status;
begin
  if v_tenant is null then
    raise exception 'no_tenant';
  end if;

  -- Cliente del tenant
  if not exists (
    select 1 from public.customers
     where id = p_customer_id and tenant_id = v_tenant and deleted_at is null
  ) then
    raise exception 'customer_not_found';
  end if;

  -- Vehículo (opcional) del tenant
  if p_vehicle_id is not null and not exists (
    select 1 from public.vehicles
     where id = p_vehicle_id and tenant_id = v_tenant and deleted_at is null
  ) then
    raise exception 'vehicle_not_found';
  end if;

  -- Establecimiento (opcional) del tenant
  if p_establishment_id is not null and not exists (
    select 1 from public.establishments
     where id = p_establishment_id and tenant_id = v_tenant and deleted_at is null
  ) then
    raise exception 'establishment_not_found';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'empty_items';
  end if;

  insert into public.dispatches (
    tenant_id, establishment_id, customer_id, vehicle_id, dispatch_date, status
  ) values (
    v_tenant, p_establishment_id, p_customer_id, p_vehicle_id, p_dispatch_date, 'completed'
  ) returning id into v_dispatch_id;

  for v_item in
    select *
      from jsonb_to_recordset(p_items) as x(
        recipe_id uuid,
        production_id uuid,
        quantity_kg numeric
      )
  loop
    if v_item.quantity_kg is null or v_item.quantity_kg <= 0 then
      raise exception 'invalid_quantity';
    end if;

    -- Receta del tenant (obligatoria)
    select true into v_recipe_ok
      from public.recipes
     where id = v_item.recipe_id and tenant_id = v_tenant and deleted_at is null;
    if not found then
      raise exception 'recipe_not_found';
    end if;

    -- Producción (opcional): del tenant y completada (vínculo lote → recall)
    if v_item.production_id is not null then
      select status into v_prod_status
        from public.productions
       where id = v_item.production_id and tenant_id = v_tenant and deleted_at is null;
      if not found then
        raise exception 'production_not_found';
      end if;
      if v_prod_status <> 'completed' then
        raise exception 'production_not_completed';
      end if;
    end if;

    insert into public.dispatch_items (
      dispatch_id, production_id, recipe_id, quantity_kg
    ) values (
      v_dispatch_id, v_item.production_id, v_item.recipe_id, v_item.quantity_kg
    );

    v_count := v_count + 1;
  end loop;

  return jsonb_build_object(
    'dispatch_id', v_dispatch_id,
    'items', v_count
  );
end $$;

-- ------------------------------------------------------------
-- Comments
-- ------------------------------------------------------------

comment on column public.vehicles.establishment_id is
  'Planta base del vehículo (opcional). null = del tenant, sin planta fija. Filtro de UI, no de RLS.';
comment on column public.form_templates.establishment_id is
  'Planta dueña de la planilla (opcional). null = planilla global del tenant.';
comment on column public.form_submissions.establishment_id is
  'Planta donde se registró la planilla (opcional). null = global. Inmutable (se setea en INSERT).';
comment on column public.stock_entries.establishment_id is
  'Planta donde vive el lote. null = legacy/mono-planta. Filtro de negocio dentro del tenant.';
comment on column public.productions.establishment_id is
  'Planta donde se produjo. null = legacy/mono-planta.';
comment on column public.dispatches.establishment_id is
  'Planta desde la que sale el despacho. null = legacy/mono-planta.';

comment on function public.complete_production(uuid, numeric, date, jsonb, text, uuid, text, uuid) is
  'Completa una producción (base 0021 + regulatory_labels). p_establishment_id default null: setea '
  'productions.establishment_id y, si hay planta, consume solo lotes de esa planta (o legacy sin '
  'planta). Con null = comportamiento idéntico al previo. Regla 5: solo afecta producciones nuevas.';
comment on function public.create_dispatch(uuid, date, jsonb, uuid, uuid) is
  'Crea un despacho (base 0008). p_establishment_id default null: setea dispatches.establishment_id. '
  'Con null = comportamiento idéntico al previo.';
