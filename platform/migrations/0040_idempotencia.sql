-- 0040 — Idempotencia en las rutas que faltaban (Etapa 0).
--
-- EL ESTADO REAL, VERIFICADO ANTES DE ESCRIBIR ESTO
-- La estrategia ya existe y esta bien aplicada donde dolio:
--
--   complete_order   for update + guard de estado + corta si ya hay ventas
--   signup_tenant    devuelve el tenant existente en vez de fallar (0019)
--   mp-webhook       (legacy) ya la tenia
--
-- O sea el problema NO era "la aplicacion no tiene idempotencia". Era que
-- estaba en tres lugares y no en los otros tres. Esto la homogeneiza.
--
-- LO QUE PASA HOY SIN ESTO
--   submit-order     doble click o reintento de red = DOS pedidos cobrados
--   register_waste   reintento = descuenta el stock dos veces
--   register_purchase reintento = ingresa la mercaderia dos veces
--
-- POR QUE UNA CLAVE DEL CLIENTE Y NO UN HASH DEL CONTENIDO
-- Dos mermas iguales del mismo insumo el mismo dia son legitimas: se rompieron
-- dos veces. Un hash del contenido las tomaria como duplicado y perderia una.
-- La clave la genera el cliente UNA VEZ por accion del usuario (al abrir el
-- checkout, al tocar guardar) y viaja con el reintento, asi que distingue
-- "lo mando de nuevo" de "paso de nuevo".
--
-- POR QUE UN INDICE UNICO PARCIAL Y NO NOT NULL
-- Las filas viejas no tienen clave y no se les puede inventar. `where ... is
-- not null` deja convivir lo historico con lo nuevo sin backfill mentiroso.
-- Y un cliente viejo que no manda la clave sigue funcionando: pierde la
-- garantia, no el servicio.

-- ───────────────────────────── orders ──────────────────────────────────

alter table public.orders
  add column if not exists client_request_id uuid;

create unique index if not exists orders_client_request_uniq
  on public.orders (tenant_id, client_request_id)
  where client_request_id is not null;

comment on column public.orders.client_request_id is
  'Etapa 0: clave que genera el navegador por checkout. Un reintento con la '
  'misma clave choca contra el indice unico y submit-order devuelve el pedido '
  'que ya existe en vez de crear otro.';

-- ─────────────────────────── waste_log ─────────────────────────────────

alter table public.waste_log
  add column if not exists client_request_id uuid;

create unique index if not exists waste_log_client_request_uniq
  on public.waste_log (tenant_id, client_request_id)
  where client_request_id is not null;

create or replace function public.register_waste(
  p_tenant_id uuid,
  p_ingredient_id uuid,
  p_qty numeric,
  p_reason text default 'otro',
  p_note text default null,
  p_client_request_id uuid default null
)
returns setof public.waste_log
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $$
declare
  v_ing public.ingredients;
  v_ya  public.waste_log;
begin
  if p_tenant_id is null then
    raise exception 'falta_tenant';
  end if;
  if p_tenant_id not in (select private.current_user_tenants()) then
    raise exception 'no_sos_miembro';
  end if;
  if coalesce(p_qty, 0) <= 0 then
    raise exception 'cantidad_invalida';
  end if;

  -- Idempotencia: si esta merma ya se registro, se devuelve la que existe sin
  -- volver a descontar. Va ANTES del for update para no tomar el lock al
  -- pedazo por un reintento.
  if p_client_request_id is not null then
    select * into v_ya from public.waste_log w
     where w.tenant_id = p_tenant_id
       and w.client_request_id = p_client_request_id;
    if found then
      return next v_ya;
      return;
    end if;
  end if;

  -- El for update tambien serializa dos mermas simultaneas del mismo insumo.
  select * into v_ing from public.ingredients i
   where i.id = p_ingredient_id and i.tenant_id = p_tenant_id
   for update;
  if not found then
    raise exception 'insumo_de_otro_negocio';
  end if;

  update public.ingredients
     set stock = greatest(0, stock - p_qty)
   where id = v_ing.id;

  return query
  insert into public.waste_log (
    tenant_id, ingredient_id, qty, reason, note, client_request_id
  )
  values (
    p_tenant_id, v_ing.id, p_qty,
    coalesce(nullif(btrim(coalesce(p_reason, '')), ''), 'otro'),
    nullif(btrim(coalesce(p_note, '')), ''),
    p_client_request_id
  )
  returning *;
end $$;

revoke all on function public.register_waste(uuid, uuid, numeric, text, text, uuid)
  from public, anon;
grant execute on function public.register_waste(uuid, uuid, numeric, text, text, uuid)
  to authenticated;

-- La firma vieja (5 args) queda inutilizable a proposito: si sigue existiendo,
-- una llamada sin la clave la elige por resolucion de sobrecarga y se pierde
-- la garantia sin que nadie lo note.
drop function if exists public.register_waste(uuid, uuid, numeric, text, text);

-- ──────────────────────────── expenses ─────────────────────────────────
--
-- La compra escribe UN gasto con sus items adentro (0031). La clave va en el
-- gasto porque es la fila que representa el movimiento entero.

alter table public.expenses
  add column if not exists client_request_id uuid;

create unique index if not exists expenses_client_request_uniq
  on public.expenses (tenant_id, client_request_id)
  where client_request_id is not null;

comment on column public.expenses.client_request_id is
  'Etapa 0: idempotencia de register_purchase. Un reintento devuelve el gasto '
  'ya asentado en vez de ingresar la mercaderia dos veces.';

-- ─────────────────── register_purchase idempotente ─────────────────────
--
-- Se reescribe entera (no se puede parchear el cuerpo) agregando SOLO el
-- guard del principio y la escritura de la clave. La logica de normalizacion,
-- el chequeo de insumos ajenos y el desglose quedan identicos a 0031.
--
-- HUECO CONOCIDO, QUE SE CIERRA EN 0042
-- Una compra con total 0 mueve stock pero NO inserta gasto (`where d.total > 0`
-- en 0031: un gasto de $0 no tiene sentido en el libro). Como el guard se
-- apoya en la fila de expenses, ese caso —mercaderia ya paga— sigue sin
-- proteccion. Cuando el ledger sea la fuente de verdad del stock, la clave
-- vive en inventory_movements, que se escribe SIEMPRE, y el hueco desaparece
-- sin caso especial.

create or replace function public.register_purchase(
  p_tenant_id uuid,
  p_date date,
  p_items jsonb,
  p_supplier text default null,
  p_supplier_id uuid default null,
  p_payment_method text default 'efectivo',
  p_payment_account_id text default null,
  p_receipt_url text default null,
  p_no_receipt boolean default false,
  p_client_request_id uuid default null
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
  v_ya     public.expenses;
begin
  if p_tenant_id is null then
    raise exception 'falta_tenant';
  end if;
  if p_tenant_id not in (select private.current_user_tenants()) then
    raise exception 'no_sos_miembro';
  end if;

  -- Idempotencia: esta compra ya se asento. Se devuelve la que existe sin
  -- volver a ingresar la mercaderia.
  if p_client_request_id is not null then
    select * into v_ya from public.expenses e
     where e.tenant_id = p_tenant_id
       and e.client_request_id = p_client_request_id;
    if found then
      return next v_ya;
      return;
    end if;
  end if;

  select (t.vertical = 'gastro') into v_gastro
    from public.tenants t where t.id = p_tenant_id;

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
             'food_category', coalesce(m.food_category, case when v_gastro then 'dry' end)
           ) order by m.name) as items
      from movidos m
      join lineas l on l.ingredient_id = m.id
  )
  insert into public.expenses (
    tenant_id, date, description, amount, category, expense_type, usar_category,
    supplier, supplier_id, payment_method, payment_account_id,
    receipt_url, no_receipt, items, created_by, client_request_id
  )
  select
    p_tenant_id,
    coalesce(p_date, current_date),
    'Compra de insumos',
    d.total,
    'Materia Prima',
    'variable',
    null,
    nullif(btrim(coalesce(p_supplier, '')), ''),
    p_supplier_id,
    coalesce(nullif(btrim(coalesce(p_payment_method, '')), ''), 'efectivo'),
    nullif(btrim(coalesce(p_payment_account_id, '')), ''),
    nullif(btrim(coalesce(p_receipt_url, '')), ''),
    coalesce(p_no_receipt, false),
    d.items,
    auth.uid(),
    p_client_request_id
  from detalle d
  where d.total > 0
  returning *;
end;
$$;

revoke all on function public.register_purchase(
  uuid, date, jsonb, text, uuid, text, text, text, boolean, uuid) from public, anon;
grant execute on function public.register_purchase(
  uuid, date, jsonb, text, uuid, text, text, text, boolean, uuid) to authenticated;

-- Igual que con register_waste: la firma vieja se saca para que una llamada
-- sin clave no la elija por resolucion de sobrecarga y pierda la garantia en
-- silencio.
drop function if exists public.register_purchase(
  uuid, date, jsonb, text, uuid, text, text, text, boolean);
