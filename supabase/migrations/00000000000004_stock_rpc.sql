-- ============================================================
-- Ninja Food — 0004 stock RPCs
-- Operaciones atómicas de stock: ingreso y ajuste SIEMPRE crean
-- su movimiento (stock_movements es el ledger append-only).
-- SECURITY INVOKER: RLS aplica con el JWT del usuario.
-- ============================================================

create or replace function public.create_stock_entry(
  p_ingredient_id uuid,
  p_quantity numeric,
  p_unit text,
  p_lot_number text,
  p_expiry_date date default null,
  p_manufacture_date date default null,
  p_is_frozen boolean default false,
  p_supplier_id uuid default null,
  p_unit_cost numeric default null,
  p_is_internal_use boolean default false,
  p_invoice_url text default null,
  p_establishment_id uuid default null
) returns uuid
language plpgsql as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_id uuid;
begin
  if v_tenant is null then
    raise exception 'no_tenant';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'invalid_quantity';
  end if;

  insert into public.stock_entries (
    tenant_id, establishment_id, ingredient_id, supplier_id,
    quantity, remaining_quantity, unit, lot_number,
    expiry_date, manufacture_date, is_frozen,
    invoice_url, unit_cost, is_internal_use
  ) values (
    v_tenant, p_establishment_id, p_ingredient_id, p_supplier_id,
    p_quantity, p_quantity, p_unit, p_lot_number,
    p_expiry_date, p_manufacture_date, coalesce(p_is_frozen, false),
    p_invoice_url, p_unit_cost, coalesce(p_is_internal_use, false)
  ) returning id into v_id;

  insert into public.stock_movements (
    tenant_id, ingredient_id, stock_entry_id, type, quantity, actor_user_id
  ) values (
    v_tenant, p_ingredient_id, v_id, 'purchase', p_quantity, auth.uid()
  );

  return v_id;
end $$;

create or replace function public.adjust_stock_entry(
  p_entry_id uuid,
  p_delta numeric,
  p_reason text,
  p_type stock_movement_type default 'adjustment'
) returns numeric
language plpgsql as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_remaining numeric;
  v_ingredient uuid;
begin
  if v_tenant is null then
    raise exception 'no_tenant';
  end if;
  if p_delta is null or p_delta = 0 then
    raise exception 'invalid_delta';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'reason_required';
  end if;

  update public.stock_entries
     set remaining_quantity = remaining_quantity + p_delta
   where id = p_entry_id
     and tenant_id = v_tenant
  returning remaining_quantity, ingredient_id
    into v_remaining, v_ingredient;

  if not found then
    raise exception 'entry_not_found';
  end if;
  if v_remaining < 0 then
    raise exception 'insufficient_stock';
  end if;

  insert into public.stock_movements (
    tenant_id, ingredient_id, stock_entry_id, type, quantity,
    actor_user_id, reason
  ) values (
    v_tenant, v_ingredient, p_entry_id, p_type, p_delta,
    auth.uid(), trim(p_reason)
  );

  return v_remaining;
end $$;
