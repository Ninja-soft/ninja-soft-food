-- ============================================================
-- Ninja Food — 0008 dispatch RPC
-- Registrar un despacho es UNA transacción: inserta la cabecera y
-- todos sus ítems (vínculo lote → cliente para recall). Valida que
-- recetas y producciones pertenezcan al tenant.
-- SECURITY INVOKER (como 0004/0005): RLS aplica dentro de la función,
-- defensa en profundidad además del chequeo explícito current_tenant_id().
-- ============================================================

-- items: jsonb [{recipe_id, production_id|null, quantity_kg}]
create or replace function public.create_dispatch(
  p_customer_id uuid,
  p_dispatch_date date,
  p_items jsonb,
  p_vehicle_id uuid default null
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

  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'empty_items';
  end if;

  insert into public.dispatches (
    tenant_id, customer_id, vehicle_id, dispatch_date, status
  ) values (
    v_tenant, p_customer_id, p_vehicle_id, p_dispatch_date, 'completed'
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
