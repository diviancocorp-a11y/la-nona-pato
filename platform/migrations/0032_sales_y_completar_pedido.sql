-- 0032_sales_y_completar_pedido.sql — ETAPA 4 del plan de ERP (platform/PLAN-ERP.md)
--
-- Ventas y P&L. Con las Etapas 2 y 3 el edificio sabe cuanto cuesta producir
-- y cuanto sale todo lo demas; esto es el lado de los ingresos.
--
-- ── Mismas columnas que el legacy, mas tres ──
-- La regla de siempre: si la pantalla necesita cambios de fondo, la tabla se
-- porto con un shape distinto. `sales` conserva los nombres del legacy
-- (incluido `recipe_id`, que aca referencia `products` — en el edificio la
-- receta ES el producto, decision de la Etapa 2). Se suman `tenant_id` y dos
-- columnas que la pantalla del legacy YA lee pero su tabla nunca tuvo:
-- MonthSummary intenta `s.payment_method` y `s.order_id` para el desglose por
-- medio de pago y siempre caia en "Sin especificar". Aca existen de verdad.
--
-- ── Completar un pedido va por RPC ──
-- En el legacy, completar un pedido dispara un bucle de createSale desde el
-- navegador (useOrderWorkflow): una llamada por item, sin nada que las ate.
-- Si el navegador se cierra en el medio, quedan ventas registradas de un
-- pedido que no llego a completarse — o al reves. Criterio de la Etapa 3:
-- si toca varias filas y es plata, va a la base. `complete_order` cambia el
-- estado y asienta las ventas en UNA transaccion, `security invoker` — la
-- RLS de siempre sigue decidiendo quien toca que.

/* ═══════════════════════════ VENTAS ═══════════════════════════ */

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,

  date date not null default current_date,

  -- Nombre historico del legacy; en el edificio apunta a products (la receta
  -- ES el producto). `set null` y no cascade: la venta es historia contable y
  -- sobrevive al producto.
  recipe_id uuid references public.products(id) on delete set null,

  qty numeric not null default 1,
  unit_price numeric not null default 0,

  -- Costo unitario CONGELADO al momento de la venta. Si despues cambia el
  -- precio del insumo, lo que costo producir esta venta no cambia. 0 = no se
  -- pudo calcular (sin receta); useFinancials cae a la receta actual.
  unit_cost numeric not null default 0,

  total numeric not null,

  -- De que pedido salio (null = venta manual). El desglose por medio de pago
  -- del resumen mensual sale de payment_method, que complete_order copia del
  -- pedido y el form manual deja elegir.
  order_id uuid references public.orders(id) on delete set null,
  payment_method text,

  created_at timestamptz not null default now()
);

-- El listado y el P&L siempre son "las ventas de este negocio por fecha".
create index if not exists sales_tenant_date_idx
  on public.sales (tenant_id, date desc);

-- "las ventas de este pedido" — lo usa el guard de complete_order.
create index if not exists sales_order_idx
  on public.sales (order_id) where order_id is not null;

alter table public.sales enable row level security;

drop policy if exists sales_select on public.sales;
create policy sales_select on public.sales
  for select using (tenant_id in (select private.current_user_tenants()));

drop policy if exists sales_insert on public.sales;
create policy sales_insert on public.sales
  for insert with check (tenant_id in (select private.current_user_tenants()));

-- Sin policies de UPDATE ni DELETE a proposito: una venta no se edita ni se
-- borra (mismo criterio que expenses — el legacy tenia deleteSale en el
-- service y ninguna pantalla lo llamaba). Cuando haga falta corregir una
-- venta manual erronea, va por asiento de reversion como void_expense.

/* ═══════════════════ COMPLETAR UN PEDIDO ═══════════════════════ */
--
-- Hace dos cosas que tienen que pasar juntas o no pasar:
--   1. marca el pedido como completado,
--   2. asienta una venta por cada item del pedido.
--
-- El costo unitario de cada venta sale de order_items.unit_cost (lo congela
-- submit-order al crear el pedido). Si vino en 0 —pedidos anteriores a la
-- Etapa 4, o un producto que recien ahora tiene receta— se calcula aca con la
-- receta actual, y se escribe TAMBIEN en order_items para que los dos libros
-- digan lo mismo.
--
-- Devuelve las ventas creadas.

create or replace function public.complete_order(p_order_id uuid)
returns setof public.sales
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $$
declare
  v_order public.orders;
begin
  -- El `for update` sobre una fila que la RLS no deja ver no encuentra nada:
  -- un pedido de otro negocio da 'pedido_no_encontrado', no una filtracion.
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'pedido_no_encontrado' using errcode = 'P0002';
  end if;
  if v_order.status = 'completed' then
    raise exception 'ya_completado';
  end if;
  if v_order.status = 'cancelled' then
    raise exception 'pedido_cancelado';
  end if;
  -- Cinturon ademas del guard de estado: si alguna vez un pedido vuelve a
  -- abrirse a mano, completarlo de nuevo no puede duplicar las ventas.
  if exists (select 1 from public.sales s where s.order_id = v_order.id) then
    raise exception 'ya_tiene_ventas';
  end if;

  update public.orders set status = 'completed' where id = v_order.id;

  -- Costo por producto segun la receta ACTUAL, para los items que no lo
  -- traigan congelado. Un producto sin receta queda en 0 (sin mentir: el
  -- margen de esa venta no se conoce).
  return query
  with costos as (
    select pi.product_id, sum(pi.qty * coalesce(i.cost, 0)) as unit_cost
      from public.product_ingredients pi
      join public.ingredients i on i.id = pi.ingredient_id
     where pi.tenant_id = v_order.tenant_id
     group by pi.product_id
  ),
  items as (
    select oi.id,
           oi.product_id,
           oi.qty,
           oi.unit_price,
           case when oi.unit_cost > 0 then oi.unit_cost
                else coalesce(c.unit_cost, 0) end as unit_cost,
           coalesce(oi.subtotal, oi.qty * oi.unit_price) as total
      from public.order_items oi
      left join costos c on c.product_id = oi.product_id
     where oi.order_id = v_order.id
  ),
  actualizados as (
    -- Los dos libros dicen lo mismo: el costo que se asienta en la venta
    -- queda tambien en el item del pedido.
    update public.order_items oi
       set unit_cost = it.unit_cost
      from items it
     where oi.id = it.id
       and oi.unit_cost is distinct from it.unit_cost
    returning oi.id
  )
  insert into public.sales (
    tenant_id, date, recipe_id, qty, unit_price, unit_cost, total,
    order_id, payment_method
  )
  select v_order.tenant_id, current_date, it.product_id, it.qty,
         it.unit_price, it.unit_cost, it.total,
         v_order.id, v_order.payment
    from items it
  returning *;
end;
$$;

comment on table public.sales is
  'Etapa 4: una fila por item vendido. order_id null = venta manual.';
comment on function public.complete_order is
  'Etapa 4: marca el pedido completado y asienta sus ventas en una transaccion.';
