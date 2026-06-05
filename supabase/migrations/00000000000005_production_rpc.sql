-- ============================================================
-- Ninja Food — 0005 production RPC
-- Completar producción es UNA transacción: valida stock, consume
-- lotes (ledger), calcula vencimiento y publica la traza inmutable.
-- SECURITY INVOKER: RLS aplica con el JWT del usuario.
-- ============================================================

-- Secuencia de códigos de producción por tenant (PROD-<prefijo>-NNN)
create table public.production_counters (
  tenant_id uuid primary key references public.tenants (id) on delete cascade,
  last_value int not null default 0
);
alter table public.production_counters enable row level security;
create policy tenant_isolation on public.production_counters
  for all to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- inputs: jsonb [{ingredient_id, stock_entry_id|null, taken_qty, is_substitute, source_ingredient_id|null}]
create or replace function public.complete_production(
  p_recipe_id uuid,
  p_quantity_kg numeric,
  p_production_date date,
  p_inputs jsonb,
  p_product_lot_number text default null,
  p_manager_member_id uuid default null,
  p_notes text default null
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
    tenant_id, recipe_id, code, status, production_date, packaging_date,
    manager_member_id, quantity_kg, product_lot_number, product_expiry_date,
    shelf_life_snapshot, aging_snapshot, notes
  ) values (
    v_tenant, p_recipe_id, v_code, 'completed', p_production_date,
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
    'front_labels', to_jsonb(v_recipe.front_labels),
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
