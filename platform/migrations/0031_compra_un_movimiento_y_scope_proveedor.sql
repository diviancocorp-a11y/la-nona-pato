-- 0031_compra_un_movimiento_y_scope_proveedor.sql
-- Correcciones de la Etapa 3, salidas de probarla con datos reales.
--
-- ── 1. Una compra es UN movimiento ──
--
-- 0030 partia la compra en una fila de `expenses` por categoria de alimento,
-- copiando al legacy. Visto en pantalla no se sostiene: la lista de gastos
-- reescribe la descripcion de toda compra de materia prima a "Compra ·
-- <proveedor>", asi que las 2 o 3 filas quedaban IDENTICAS y parecian tres
-- compras distintas al mismo proveedor. La etiqueta por la que se partia
-- ("Secos", "Lacteos") no se ve en ningun lado.
--
-- Ahora es una fila por compra, que es lo que efectivamente paso, y el
-- desglose por categoria viaja DENTRO de `items` (cada linea lleva su
-- `food_category`). No se pierde nada: el P&L de la Etapa 4 saca el total de
-- `amount` y el desglose sumando el jsonb, en vez de agrupando filas.
--
-- `usar_category` queda SIEMPRE en null para las compras, sin excepciones —
-- una fila mixta no tiene una sola categoria USAR y hacer que a veces si y a
-- veces no la tenga es peor que no tenerla nunca. Lo que marca que es
-- mercaderia es `category = 'Materia Prima'`.
--
-- ── 2. Proveedores con tipo ──
--
-- `category` (Carniceria, Servicios, Limpieza...) dice DE QUE rubro es el
-- proveedor, y se usa para leerlo. No sirve para filtrar: la carniceria
-- aparecia en el desplegable de "Registrar gasto", donde no tiene nada que
-- hacer, y la empresa de luz aparecia al cargar una compra.
--
-- `scope` es otra pregunta: QUE le comprás. Insumos van a stock y se cargan
-- por Compra; servicios se cargan por Gasto. Default 'ambos' para que ningun
-- proveedor ya cargado desaparezca de ningun lado.

alter table public.suppliers
  add column if not exists scope text not null default 'ambos';

alter table public.suppliers drop constraint if exists suppliers_scope_check;
alter table public.suppliers
  add constraint suppliers_scope_check check (scope in ('insumos', 'servicios', 'ambos'));

comment on column public.suppliers.scope is
  'Que le comprás: insumos (van a stock, se cargan por Compra) | servicios (se cargan por Gasto) | ambos. Distinto de `category`, que dice de que rubro es.';

create or replace function public.register_purchase(
  p_tenant_id uuid,
  p_date date,
  p_items jsonb,                               -- [{ingredient_id, qty, unit_cost}]
  p_supplier text default null,
  p_supplier_id uuid default null,
  p_payment_method text default 'efectivo',
  p_payment_account_id text default null,
  p_receipt_url text default null,
  p_no_receipt boolean default false
)
returns setof public.expenses
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $$
declare
  v_lineas jsonb;
  v_ajenos integer;
  v_gastro boolean;
begin
  if p_tenant_id is null then
    raise exception 'falta_tenant';
  end if;
  if p_tenant_id not in (select private.current_user_tenants()) then
    raise exception 'no_sos_miembro';
  end if;

  -- El rubro decide que hacer con un insumo sin clasificar. En gastronomia
  -- cae en 'dry' como en el legacy: dejarlo sin clasificar lo sacaria del
  -- costo de comida del P&L y el food cost daria mas bajo de lo real, sin que
  -- nada avise. En barberia o retail queda sin clasificar — meter un gel en
  -- "Comida — Secos" es inventarle contabilidad de restaurante a quien no la
  -- lleva.
  select (t.vertical = 'gastro') into v_gastro
    from public.tenants t where t.id = p_tenant_id;

  -- Normalizacion: la pantalla deja cargar el mismo insumo en dos lineas. Se
  -- suman las cantidades y vale el ultimo precio cargado.
  select coalesce(jsonb_agg(jsonb_build_object(
           'ingredient_id', ingredient_id, 'qty', qty, 'unit_cost', unit_cost)), '[]'::jsonb)
    into v_lineas
    from (
      select (l ->> 'ingredient_id')::uuid                    as ingredient_id,
             sum(coalesce((l ->> 'qty')::numeric, 0))         as qty,
             (array_agg(coalesce((l ->> 'unit_cost')::numeric, 0) order by ord desc))[1] as unit_cost
        from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as t(l, ord)
       where nullif(l ->> 'ingredient_id', '') is not null
         and coalesce((l ->> 'qty')::numeric, 0) > 0
       group by 1
    ) g;

  if jsonb_array_length(v_lineas) = 0 then
    raise exception 'compra_sin_items';
  end if;

  -- Un insumo de otro negocio no se ignora en silencio: la RLS haria que el
  -- update no matchee y la compra quedaria cargada de menos sin avisar.
  select count(*) into v_ajenos
    from jsonb_to_recordset(v_lineas) as l(ingredient_id uuid)
    left join public.ingredients i
           on i.id = l.ingredient_id and i.tenant_id = p_tenant_id
   where i.id is null;
  if v_ajenos > 0 then
    raise exception 'insumo_de_otro_negocio';
  end if;

  return query
  with lineas as (
    select * from jsonb_to_recordset(v_lineas)
      as l(ingredient_id uuid, qty numeric, unit_cost numeric)
  ),
  movidos as (
    update public.ingredients i
       set stock = i.stock + l.qty,
           -- Un precio en 0 es "no lo cargue", no "ahora es gratis".
           cost  = case when l.unit_cost > 0 then l.unit_cost else i.cost end
      from lineas l
     where i.id = l.ingredient_id
       and i.tenant_id = p_tenant_id
    returning i.id, i.name, i.unit, i.food_category
  ),
  detalle as (
    select sum(l.qty * l.unit_cost) as total,
           jsonb_agg(jsonb_build_object(
             'name', m.name, 'qty', l.qty, 'unit', m.unit,
             'unit_cost', l.unit_cost, 'subtotal', l.qty * l.unit_cost,
             -- Aca vive el desglose que antes eran filas separadas.
             'food_category', coalesce(m.food_category, case when v_gastro then 'dry' end)
           ) order by m.name) as items
      from movidos m
      join lineas l on l.ingredient_id = m.id
  )
  insert into public.expenses (
    tenant_id, date, description, amount, category, expense_type, usar_category,
    supplier, supplier_id, payment_method, payment_account_id,
    receipt_url, no_receipt, items, created_by
  )
  select
    p_tenant_id,
    coalesce(p_date, current_date),
    'Compra de insumos',
    d.total,
    'Materia Prima',
    'variable',
    null,                       -- ver el comentario de arriba: siempre null
    nullif(btrim(coalesce(p_supplier, '')), ''),
    p_supplier_id,
    coalesce(nullif(btrim(coalesce(p_payment_method, '')), ''), 'efectivo'),
    nullif(btrim(coalesce(p_payment_account_id, '')), ''),
    nullif(btrim(coalesce(p_receipt_url, '')), ''),
    coalesce(p_no_receipt, false),
    d.items,
    auth.uid()
  from detalle d
  -- Total 0 = se ingreso mercaderia ya paga. El stock igual se movio arriba;
  -- lo que no tiene sentido es un gasto de $0 en el libro.
  where d.total > 0
  returning *;
end;
$$;
