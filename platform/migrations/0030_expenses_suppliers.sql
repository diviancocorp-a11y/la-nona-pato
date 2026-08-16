-- 0030_expenses_suppliers.sql — ETAPA 3 del plan de ERP (platform/PLAN-ERP.md)
--
-- Compras, gastos y proveedores: el otro lado del P&L. Con la Etapa 2 el
-- edificio ya sabe cuanto cuesta producir; esto es lo que sale por todo lo
-- demas.
--
-- ── SIN tabla `purchases` (correccion al plan) ──
-- El plan listaba `expenses`, `suppliers` y `purchases`. `purchases` y
-- `purchase_items` existen en el legacy desde el schema inicial y NINGUNA
-- pantalla las escribe: la pantalla de Compras registra filas en `expenses`
-- (una por categoria de alimento, con el detalle en `items` jsonb) y ajusta
-- el stock. `fetchPurchases` quedo en services/finance.js sin un solo
-- llamador. Portarlas habria sido portar codigo muerto y dejar dos verdades
-- sobre lo mismo.
--
-- ── Mismas columnas que el legacy ──
-- Igual que en 0026: la regla del plan es que si la pantalla necesita
-- cambios de fondo, la tabla se porto con un shape distinto. Finance.jsx y
-- Suppliers.jsx se reusan enteros, asi que las columnas se llaman igual.
-- Lo unico que se suma es `tenant_id`.
--
-- ── Dos operaciones van por RPC y no por tabla ──
-- Anular un gasto y registrar una compra tocan VARIAS filas y son plata. En
-- el legacy son bucles de llamadas desde el navegador: la anulacion inserta
-- la reversion, marca el original y si eso falla borra la reversion a mano
-- (un rollback escrito en JavaScript); la compra ajusta N stocks e inserta N
-- gastos sin nada que los ate. Si el navegador se cierra en el medio, los
-- libros quedan partidos. Aca son dos funciones: el cuerpo de una funcion
-- plpgsql corre dentro de UNA transaccion, asi que o pasa todo o no pasa
-- nada. Van `security invoker` a proposito — la RLS de siempre sigue
-- decidiendo quien toca que.

/* ═══════════════════════════ PROVEEDORES ═══════════════════════════ */

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,

  name text not null,
  category text,                         -- Carniceria, Verduleria, Servicios...
  cuit text,
  can_invoice boolean not null default false,
  location text,
  phone text,
  email text,
  notes text,

  -- is_active es PAUSE/PLAY, no soft-delete: pausado va al fondo del gestor y
  -- NO aparece en los selectores de gastos y compras. Eliminar es delete real.
  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists suppliers_tenant_idx
  on public.suppliers (tenant_id, is_active);

-- Novedad contra el legacy: dos proveedores con el mismo nombre en el mismo
-- negocio es siempre un error de carga. En el legacy el campo era texto libre
-- y termino generando duplicados (por eso en jun/2026 paso a ser un
-- desplegable). Total y no parcial como en `ingredients`: aca "eliminar" es
-- delete real, asi que no existe la fila archivada que ocuparia el nombre.
--
-- btrim ademas de lower: sin el, "  Carniceria" y "Carniceria" son dos filas
-- distintas para la DB y la misma para el que lee la lista. Se probo y pasaba.
create unique index if not exists suppliers_tenant_name_uniq
  on public.suppliers (tenant_id, lower(btrim(name)));

create or replace function public.tocar_suppliers_updated_at()
returns trigger language plpgsql
set search_path = public
as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists suppliers_updated_at on public.suppliers;
create trigger suppliers_updated_at
  before update on public.suppliers
  for each row execute function public.tocar_suppliers_updated_at();

alter table public.suppliers enable row level security;

drop policy if exists suppliers_select on public.suppliers;
create policy suppliers_select on public.suppliers
  for select using (tenant_id in (select private.current_user_tenants()));

drop policy if exists suppliers_insert on public.suppliers;
create policy suppliers_insert on public.suppliers
  for insert with check (tenant_id in (select private.current_user_tenants()));

drop policy if exists suppliers_update on public.suppliers;
create policy suppliers_update on public.suppliers
  for update using (tenant_id in (select private.current_user_tenants()))
  with check (tenant_id in (select private.current_user_tenants()));

drop policy if exists suppliers_delete on public.suppliers;
create policy suppliers_delete on public.suppliers
  for delete using (tenant_id in (select private.current_user_tenants()));

/* ═════════════════════════════ GASTOS ══════════════════════════════ */

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,

  date date not null default current_date,
  description text not null,
  amount numeric not null,

  -- Categoria propia del negocio (settings.exp_cats). `not null default` y no
  -- `not null` a secas como el legacy: un gasto sin categoria es preferible a
  -- un insert que revienta.
  category text not null default 'Otros',
  expense_type text not null default 'variable'
    check (expense_type in ('variable', 'fixed', 'installment')),

  -- Clasificacion USAR (Uniform System of Accounts for Restaurants). Es
  -- gastronomica: una barberia no la carga y la columna queda null. La usa el
  -- P&L estructurado de la Etapa 4.
  usar_category text,

  -- El nombre en texto ademas de la FK: si el proveedor se elimina, el gasto
  -- historico conserva de quien fue (la FK se suelta, el texto queda).
  supplier text,
  supplier_id uuid references public.suppliers(id) on delete set null,

  payment_method text,
  payment_account_id text,               -- id dentro de settings.payment_accounts

  installment_current integer,
  installment_total integer,

  -- Detalle de lo comprado: [{name, qty, unit, unit_cost, subtotal}]. Es una
  -- foto del momento de la compra a proposito — si despues cambia el precio
  -- del insumo, lo que se pago no cambia.
  items jsonb not null default '[]'::jsonb,

  receipt_url text,
  no_receipt boolean not null default false,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),

  -- Anulacion por asiento de reversion: el gasto NO se borra nunca. El
  -- original queda marcado y aparece una fila nueva por el monto negativo.
  voided_at timestamptz,
  voided_by text,
  voided_reason text,
  voids_expense_id uuid references public.expenses(id) on delete restrict
);

-- El listado siempre es "los gastos de este negocio, del mas nuevo al mas
-- viejo", casi siempre acotado al mes.
create index if not exists expenses_tenant_date_idx
  on public.expenses (tenant_id, date desc);

-- "cuanto le compre a este proveedor" — lo va a pedir el CRM de proveedores.
create index if not exists expenses_supplier_idx
  on public.expenses (supplier_id) where supplier_id is not null;

-- Encontrar la reversion de un original (la pantalla las linkea entre si).
create index if not exists expenses_voids_idx
  on public.expenses (voids_expense_id) where voids_expense_id is not null;

alter table public.expenses enable row level security;

drop policy if exists expenses_select on public.expenses;
create policy expenses_select on public.expenses
  for select using (tenant_id in (select private.current_user_tenants()));

drop policy if exists expenses_insert on public.expenses;
create policy expenses_insert on public.expenses
  for insert with check (tenant_id in (select private.current_user_tenants()));

drop policy if exists expenses_update on public.expenses;
create policy expenses_update on public.expenses
  for update using (tenant_id in (select private.current_user_tenants()))
  with check (tenant_id in (select private.current_user_tenants()));

-- Sin policy de DELETE a proposito: un gasto se anula, no se borra. Sin
-- policy, la RLS niega por defecto — la regla contable la sostiene la DB y no
-- la buena voluntad de la pantalla.

/* ═══════════════════════ ANULAR UN GASTO ═══════════════════════════ */
--
-- Devuelve DOS filas: primero el original ya marcado, despues la reversion.
-- Los guards viven aca y no en el service porque son reglas contables: que no
-- se anule dos veces, que no se anule una anulacion, y que no se toque un mes
-- ya cerrado.

create or replace function public.void_expense(
  p_expense_id uuid,
  p_reason text default null
)
returns setof public.expenses
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $$
declare
  v_orig   public.expenses;
  v_rev    public.expenses;
  v_reason text := nullif(btrim(left(coalesce(p_reason, ''), 500)), '');
  -- Quien anula sale del token, no de lo que mande el cliente.
  v_email  text := coalesce(auth.jwt() ->> 'email', 'desconocido');
begin
  -- El `for update` sobre una fila que la RLS no deja ver simplemente no
  -- encuentra nada: no hace falta un chequeo de tenant aparte.
  select * into v_orig from public.expenses where id = p_expense_id for update;
  if not found then
    raise exception 'expense_not_found' using errcode = 'P0002';
  end if;
  if v_orig.voided_at is not null then
    raise exception 'already_voided';
  end if;
  if v_orig.voids_expense_id is not null then
    raise exception 'is_a_reversal';
  end if;
  if to_char(v_orig.date, 'YYYY-MM') <> to_char(current_date, 'YYYY-MM') then
    raise exception 'outside_current_month';
  end if;

  insert into public.expenses (
    tenant_id, date, description, amount, category, expense_type, usar_category,
    supplier, supplier_id, payment_method, payment_account_id,
    voids_expense_id, voided_by, voided_reason, created_by
  ) values (
    v_orig.tenant_id, current_date,
    'Anulacion de: ' || coalesce(v_orig.description, '(sin descripcion)'),
    -abs(v_orig.amount), v_orig.category, v_orig.expense_type, v_orig.usar_category,
    v_orig.supplier, v_orig.supplier_id, v_orig.payment_method, v_orig.payment_account_id,
    v_orig.id, v_email, v_reason, auth.uid()
  ) returning * into v_rev;

  update public.expenses
     set voided_at = now(), voided_by = v_email, voided_reason = v_reason
   where id = v_orig.id
  returning * into v_orig;

  return next v_orig;
  return next v_rev;
end;
$$;

/* ═════════════════════ REGISTRAR UNA COMPRA ════════════════════════ */
--
-- Una compra hace tres cosas que tienen que pasar juntas o no pasar:
--   1. sube el stock de cada insumo,
--   2. actualiza su costo unitario al precio que se acaba de pagar,
--   3. deja el gasto asentado.
--
-- El gasto se parte en una fila POR CATEGORIA DE ALIMENTO. No es capricho:
-- es lo que permite que el P&L (Etapa 4) separe comida de packaging sin
-- contar dos veces, que es exactamente el bug que se arreglo en el legacy el
-- 12/jun.
--
-- Que pasa con un insumo SIN food_category depende del rubro, y las dos
-- respuestas obvias son malas de un lado:
--   - En gastronomia cae en 'dry', como en el legacy. Dejarlo sin clasificar
--     lo sacaria del costo de comida del P&L, y el food cost quedaria mas
--     bajo de lo real sin que nada avise. El formulario de alta rapida de
--     insumo (dentro de la compra) no pide la categoria, asi que este caso no
--     es raro: es el camino normal del que carga apurado.
--   - En barberia o retail queda sin `usar_category`. Meter un shampoo en
--     "Comida — Secos" seria inventarle contabilidad de restaurante a quien
--     no la lleva.

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
  v_lineas   jsonb;
  v_ajenos   integer;
  v_gastro   boolean;
begin
  if p_tenant_id is null then
    raise exception 'falta_tenant';
  end if;
  if p_tenant_id not in (select private.current_user_tenants()) then
    raise exception 'no_sos_miembro';
  end if;

  select (t.vertical = 'gastro') into v_gastro
    from public.tenants t where t.id = p_tenant_id;

  -- Normalizacion: la pantalla deja cargar el mismo insumo en dos lineas. Se
  -- suman las cantidades y vale el ultimo precio cargado, que es lo que hacia
  -- el bucle del legacy.
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
  grupos as (
    select coalesce(m.food_category, case when v_gastro then 'dry' end) as fc,
           sum(l.qty * l.unit_cost) as total,
           jsonb_agg(jsonb_build_object(
             'name', m.name, 'qty', l.qty, 'unit', m.unit,
             'unit_cost', l.unit_cost, 'subtotal', l.qty * l.unit_cost
           ) order by m.name) as items
      from movidos m
      join lineas l on l.ingredient_id = m.id
     group by 1
  )
  insert into public.expenses (
    tenant_id, date, description, amount, category, expense_type, usar_category,
    supplier, supplier_id, payment_method, payment_account_id,
    receipt_url, no_receipt, items, created_by
  )
  select
    p_tenant_id,
    coalesce(p_date, current_date),
    case g.fc
      when 'protein'   then 'Compra de insumos — Proteínas'
      when 'dairy'     then 'Compra de insumos — Lácteos'
      when 'vegetable' then 'Compra de insumos — Vegetales'
      when 'dry'       then 'Compra de insumos — Secos'
      when 'beverage'  then 'Compra de insumos — Bebidas'
      when 'packaging' then 'Compra de insumos — Packaging'
      else 'Compra de insumos'
    end,
    g.total,
    'Materia Prima',
    'variable',
    case g.fc
      when 'protein'   then 'food_protein'
      when 'dairy'     then 'food_dairy'
      when 'vegetable' then 'food_vegetable'
      when 'dry'       then 'food_dry'
      when 'beverage'  then 'food_beverage'
      when 'packaging' then 'packaging'
      else null
    end,
    nullif(btrim(coalesce(p_supplier, '')), ''),
    p_supplier_id,
    coalesce(nullif(btrim(coalesce(p_payment_method, '')), ''), 'efectivo'),
    nullif(btrim(coalesce(p_payment_account_id, '')), ''),
    nullif(btrim(coalesce(p_receipt_url, '')), ''),
    coalesce(p_no_receipt, false),
    g.items,
    auth.uid()
  from grupos g
  where g.total > 0
  returning *;
end;
$$;

comment on function public.register_purchase is
  'Etapa 3: ingresa mercaderia, actualiza costos y asienta el gasto en una sola transaccion.';
comment on function public.void_expense is
  'Etapa 3: anula un gasto por asiento de reversion. El original nunca se borra.';
