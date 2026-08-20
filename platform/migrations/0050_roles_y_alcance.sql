-- 0050 ETAPA 6f — Roles con alcance. Seccion 4 de PLAN-LOCAL-Y-ROLES.md.
--
-- EL PROBLEMA QUE RESUELVE
-- Las etapas 6c, 6d y 6e construyeron salon, caja, comanda, propinas y fichaje:
-- todo para un local CON EMPLEADOS. Pero `tenant_members` solo distingue
-- 'owner' de 'staff', y ninguna policy mira el rol: son todas
-- `tenant_id in (select private.current_user_tenants())`. O sea que dar de alta
-- a un mozo hoy es darle el P&L, los costos, los proveedores y la nomina —y no
-- por la UI, que se puede esconder, sino por la API, que no.
--
-- Sin esto, tres etapas de trabajo no se le pueden entregar a un local real.
--
-- UNA FILA POR PERSONA Y SUCURSAL, CON VARIOS ROLES
-- Una persona es barbero *y* cajero, o encargada en una sucursal y vendedora en
-- otra. `roles[]` cubre lo primero y `branch_id` lo segundo.
--
--   branch_id null = todas las sucursales (es el caso del duenio).
--
-- El unique va con NULLS NOT DISTINCT porque si no, Postgres considera que dos
-- filas con branch_id null son distintas y la misma persona podria entrar dos
-- veces con roles contradictorios. Y va como UNIQUE y no como PRIMARY KEY
-- porque una PK no admite nulos en ninguna de sus columnas: por eso la tabla
-- pasa a tener un `id` propio, como el resto del schema.
--
-- LO QUE NO SE CONSTRUYE (decision registrada en la seccion 9 del plan)
-- No hay motor de permisos configurable. Los permisos siguen DECLARADOS en el
-- registry del codigo, versionados con el, y no en una tabla que el usuario
-- edita. La tabla de permisos custom se hace cuando aparezca el cliente que la
-- pida; para entonces el alcance ya va a estar en su lugar.
--
-- POR QUE `role` NO SE ELIMINA TODAVIA
-- Produccion corre codigo viejo que la lee (`fetchMyTenant`, `signup_tenant`,
-- las edge functions) y hay commits sin deployar. Dropearla ahora deja el
-- panel de produccion sin poder resolver el rol hasta el deploy. Queda
-- sincronizada por trigger y marcada como deprecada: se elimina cuando
-- produccion este al dia y ningun consumidor la lea.

/* ───────────────────── 1. La membresia gana alcance ───────────────────── */

alter table public.tenant_members
  add column if not exists branch_id uuid references public.branches(id) on delete cascade,
  add column if not exists roles text[];

-- Backfill. Los 7 miembros de hoy son todos 'owner' (verificado antes de
-- escribir esto), asi que esto no le cambia los permisos a nadie. El mapeo de
-- 'staff' va a `manager` y no a `attendant` a proposito: hoy un staff ve el
-- panel entero, y bajarlo de golpe al rol mas acotado le sacaria accesos que
-- ya tenia. Achicar permisos es una decision del duenio, no de una migracion.
update public.tenant_members
   set roles = case when role = 'owner' then array['owner'] else array['manager'] end
 where roles is null;

alter table public.tenant_members
  alter column roles set not null,
  alter column roles set default array['attendant'];

alter table public.tenant_members
  drop constraint if exists tenant_members_roles_validos;
alter table public.tenant_members
  add constraint tenant_members_roles_validos check (
    array_length(roles, 1) >= 1
    and roles <@ array['owner','manager','cashier','attendant','kitchen','marketer','accountant']
  );

-- La PK vieja (tenant_id, user_id) impide que una persona sea encargada en una
-- sucursal y vendedora en otra, que es justo el caso que 6f viene a habilitar.
alter table public.tenant_members
  add column if not exists id uuid not null default gen_random_uuid();

alter table public.tenant_members drop constraint if exists tenant_members_pkey;
alter table public.tenant_members add constraint tenant_members_pkey primary key (id);

alter table public.tenant_members drop constraint if exists tenant_members_una_fila_por_sucursal;
alter table public.tenant_members
  add constraint tenant_members_una_fila_por_sucursal
  unique nulls not distinct (tenant_id, user_id, branch_id);

create index if not exists idx_tenant_members_user on public.tenant_members(user_id);

/* ── `role` deprecada: se mantiene sola para no romper lo que todavia la lee ── */

create or replace function private.sincronizar_role_deprecado()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  -- El check viejo solo admite 'owner' y 'staff', asi que todo lo que no sea
  -- duenio se refleja como 'staff'. Es exactamente lo que el codigo viejo
  -- entiende, y nada mas que eso.
  new.role := case when 'owner' = any(new.roles) then 'owner' else 'staff' end;
  return new;
end $$;

drop trigger if exists tenant_members_sync_role on public.tenant_members;
create trigger tenant_members_sync_role
  before insert or update of roles on public.tenant_members
  for each row execute function private.sincronizar_role_deprecado();

comment on column public.tenant_members.role is
  'DEPRECADA (0050). La verdad esta en roles[]. Se mantiene sincronizada por '
  'trigger para el codigo que todavia no migro. Eliminar cuando produccion '
  'este al dia y ningun consumidor la lea.';

comment on column public.tenant_members.branch_id is
  'Sucursal donde aplican estos roles. NULL = todas (el caso del duenio).';

/* ─────────────────────── 2. Los helpers de rol ───────────────────────── */

/**
 * Todos los roles de la persona en un negocio, juntando sus filas de todas las
 * sucursales. Para "puede ver esta pantalla" alcanza con saber si el rol existe
 * en algun lado; el recorte fino por sucursal lo hace `alcanza_branch`.
 */
create or replace function private.user_roles(p_tenant uuid)
returns text[]
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select coalesce(array_agg(distinct r), '{}')
    from public.tenant_members m, unnest(m.roles) as r
   where m.tenant_id = p_tenant and m.user_id = auth.uid()
$$;

/** Si la persona tiene AL MENOS UNO de los roles pedidos en este negocio. */
create or replace function private.tiene_rol(p_tenant uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select private.user_roles(p_tenant) && p_roles
$$;

/**
 * Si el alcance de la persona llega a esa sucursal.
 *
 * Una fila con branch_id null vale por todas. Un dato SIN sucursal (branch_id
 * null en la fila de datos) lo ve cualquiera del negocio: negarlo escondería
 * las filas historicas anteriores a 0041, que es peor que mostrarlas.
 */
create or replace function private.alcanza_branch(p_tenant uuid, p_branch uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select p_branch is null or exists (
    select 1 from public.tenant_members m
     where m.tenant_id = p_tenant
       and m.user_id = auth.uid()
       and (m.branch_id is null or m.branch_id = p_branch)
  )
$$;

revoke all on function private.user_roles(uuid) from public, anon;
revoke all on function private.tiene_rol(uuid, text[]) from public, anon;
revoke all on function private.alcanza_branch(uuid, uuid) from public, anon;
grant execute on function private.user_roles(uuid) to authenticated;
grant execute on function private.tiene_rol(uuid, text[]) to authenticated;
grant execute on function private.alcanza_branch(uuid, uuid) to authenticated;

/* ──────────────── 3. La plata deja de ser de todos ──────────────────── */

-- Este es el corte de 6f: lo que un mozo NO puede ver aunque tenga sesion.
-- Productos, pedidos y salon quedan como estaban —todos los ven de alguna
-- forma y su recorte es de UI, no de tabla—; lo que cambia es la plata, la
-- configuracion y la nomina.
--
-- `expenses`, `suppliers` y `sales` son de duenio, encargado y contador.
-- `settings` es de duenio y encargado. `staff` tiene `hourly_cost`, o sea
-- que es nomina. `audit_log` es solo del duenio: dice quien hizo que.

-- BARRIDO PRIMERO. Reemplazar policies por nombre asume como se llamaba la
-- vieja, y alcanza con que UNA sobreviva para que la restriccion no sirva:
-- las policies permisivas se combinan con OR. Paso de verdad al aplicar esto:
-- `audit_select` (nombre viejo) seguia viva junto a `audit_log_select` y
-- dejaba el log a la vista de cualquier miembro. Los DELETE de `staff` y
-- `cash_sessions` tambien habian quedado abiertos por la misma razon.
do $$
declare
  t text;
  p text;
begin
  foreach t in array array['expenses','suppliers','sales','settings','staff','audit_log','cash_sessions'] loop
    for p in select policyname from pg_policies
              where schemaname = 'public' and tablename = t loop
      execute format('drop policy if exists %I on public.%I', p, t);
    end loop;
  end loop;
end $$;

do $$
declare
  t text;
  roles_lectura text;
  roles_escritura text;
begin
  foreach t in array array['expenses', 'suppliers'] loop
    -- El contador lee y no escribe: su trabajo es cerrar, no operar.
    roles_lectura := $q$array['owner','manager','accountant']$q$;
    roles_escritura := $q$array['owner','manager']$q$;

    execute format('drop policy if exists %I_select on public.%I', t, t);
    execute format(
      'create policy %I_select on public.%I for select using ('
      '  tenant_id in (select private.current_user_tenants())'
      '  and private.tiene_rol(tenant_id, %s))', t, t, roles_lectura);

    execute format('drop policy if exists %I_insert on public.%I', t, t);
    execute format(
      'create policy %I_insert on public.%I for insert with check ('
      '  tenant_id in (select private.current_user_tenants())'
      '  and private.tiene_rol(tenant_id, %s))', t, t, roles_escritura);

    execute format('drop policy if exists %I_update on public.%I', t, t);
    execute format(
      'create policy %I_update on public.%I for update using ('
      '  tenant_id in (select private.current_user_tenants())'
      '  and private.tiene_rol(tenant_id, %s)) with check ('
      '  tenant_id in (select private.current_user_tenants())'
      '  and private.tiene_rol(tenant_id, %s))', t, t, roles_escritura, roles_escritura);

    execute format('drop policy if exists %I_delete on public.%I', t, t);
    execute format(
      'create policy %I_delete on public.%I for delete using ('
      '  tenant_id in (select private.current_user_tenants())'
      '  and private.tiene_rol(tenant_id, array[''owner'']))', t, t);
  end loop;
end $$;

-- `sales` va aparte del loop, y esta es LA distincion que ordena todo 6f:
-- VER el informe y GENERAR una venta no son el mismo permiso.
--
-- `complete_order` es SECURITY INVOKER, o sea que respeta RLS y corre con los
-- permisos de quien cierra el pedido: el cajero o el mozo. Si el insert de
-- `sales` exigiera ser duenio o encargado, cerrar una cuenta fallaria en el
-- unico momento en que no se puede fallar, que es con el cliente adelante.
--
-- Entonces: escribe quien opera, lee quien manda. El mozo genera las ventas
-- del dia y no puede ver cuanto factura el local.
drop policy if exists sales_select on public.sales;
create policy sales_select on public.sales for select using (
  tenant_id in (select private.current_user_tenants())
  and private.tiene_rol(tenant_id, array['owner','manager','accountant'])
);
-- Solo la carga MANUAL desde el panel. La venta que nace de cerrar un pedido
-- la asienta `complete_order`, que se hizo definer por lo que se explica al
-- final de este archivo.
drop policy if exists sales_insert on public.sales;
create policy sales_insert on public.sales for insert with check (
  tenant_id in (select private.current_user_tenants())
  and private.tiene_rol(tenant_id, array['owner','manager'])
);
drop policy if exists sales_update on public.sales;
create policy sales_update on public.sales for update using (
  tenant_id in (select private.current_user_tenants())
  and private.tiene_rol(tenant_id, array['owner','manager'])
) with check (
  tenant_id in (select private.current_user_tenants())
  and private.tiene_rol(tenant_id, array['owner','manager'])
);
drop policy if exists sales_delete on public.sales;
create policy sales_delete on public.sales for delete using (
  tenant_id in (select private.current_user_tenants())
  and private.tiene_rol(tenant_id, array['owner'])
);

-- Settings: la configuracion del negocio no la toca quien atiende.
drop policy if exists settings_select on public.settings;
create policy settings_select on public.settings for select using (
  tenant_id in (select private.current_user_tenants())
  and private.tiene_rol(tenant_id, array['owner','manager','marketer'])
);
drop policy if exists settings_insert on public.settings;
create policy settings_insert on public.settings for insert with check (
  tenant_id in (select private.current_user_tenants())
  and private.tiene_rol(tenant_id, array['owner','manager'])
);
drop policy if exists settings_update on public.settings;
create policy settings_update on public.settings for update using (
  tenant_id in (select private.current_user_tenants())
  and private.tiene_rol(tenant_id, array['owner','manager'])
) with check (
  tenant_id in (select private.current_user_tenants())
  and private.tiene_rol(tenant_id, array['owner','manager'])
);

-- Staff es nomina: `hourly_cost` es lo que cobra cada persona por hora.
-- El empleado se ve A SI MISMO —necesita su ficha y su disponibilidad— pero no
-- ve lo que cobran los demas.
drop policy if exists staff_select on public.staff;
create policy staff_select on public.staff for select using (
  tenant_id in (select private.current_user_tenants())
  and (
    private.tiene_rol(tenant_id, array['owner','manager','accountant'])
    or user_id = auth.uid()
  )
);
drop policy if exists staff_insert on public.staff;
create policy staff_insert on public.staff for insert with check (
  tenant_id in (select private.current_user_tenants())
  and private.tiene_rol(tenant_id, array['owner','manager'])
);
drop policy if exists staff_update on public.staff;
create policy staff_update on public.staff for update using (
  tenant_id in (select private.current_user_tenants())
  and private.tiene_rol(tenant_id, array['owner','manager'])
) with check (
  tenant_id in (select private.current_user_tenants())
  and private.tiene_rol(tenant_id, array['owner','manager'])
);

drop policy if exists staff_delete on public.staff;
create policy staff_delete on public.staff for delete using (
  tenant_id in (select private.current_user_tenants())
  and private.tiene_rol(tenant_id, array['owner'])
);

-- El audit log dice quien hizo que: es del duenio y de nadie mas.
drop policy if exists audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log for select using (
  tenant_id in (select private.current_user_tenants())
  and private.tiene_rol(tenant_id, array['owner'])
);

-- La caja: la abre y la arquea quien la atiende, no cualquiera con sesion.
drop policy if exists cash_sessions_select on public.cash_sessions;
create policy cash_sessions_select on public.cash_sessions for select using (
  tenant_id in (select private.current_user_tenants())
  and private.tiene_rol(tenant_id, array['owner','manager','cashier','accountant'])
  and private.alcanza_branch(tenant_id, branch_id)
);
drop policy if exists cash_sessions_insert on public.cash_sessions;
create policy cash_sessions_insert on public.cash_sessions for insert with check (
  tenant_id in (select private.current_user_tenants())
  and private.tiene_rol(tenant_id, array['owner','manager','cashier'])
  and private.alcanza_branch(tenant_id, branch_id)
);
drop policy if exists cash_sessions_update on public.cash_sessions;
create policy cash_sessions_update on public.cash_sessions for update using (
  tenant_id in (select private.current_user_tenants())
  and private.tiene_rol(tenant_id, array['owner','manager','cashier'])
  and private.alcanza_branch(tenant_id, branch_id)
) with check (
  tenant_id in (select private.current_user_tenants())
  and private.tiene_rol(tenant_id, array['owner','manager','cashier'])
  and private.alcanza_branch(tenant_id, branch_id)
);

/* ─────────────────── 4. Quien administra los miembros ────────────────── */

-- Sin esto cualquier miembro podria darse a si mismo el rol de duenio, y todo
-- lo de arriba seria decorativo.
drop policy if exists tenant_members_select on public.tenant_members;
create policy tenant_members_select on public.tenant_members for select using (
  tenant_id in (select private.current_user_tenants())
);
drop policy if exists tenant_members_insert on public.tenant_members;
create policy tenant_members_insert on public.tenant_members for insert with check (
  private.tiene_rol(tenant_id, array['owner'])
);
drop policy if exists tenant_members_update on public.tenant_members;
create policy tenant_members_update on public.tenant_members for update using (
  private.tiene_rol(tenant_id, array['owner'])
) with check (
  private.tiene_rol(tenant_id, array['owner'])
);
drop policy if exists tenant_members_delete on public.tenant_members;
create policy tenant_members_delete on public.tenant_members for delete using (
  private.tiene_rol(tenant_id, array['owner'])
);

alter table public.tenant_members enable row level security;

drop policy if exists cash_sessions_delete on public.cash_sessions;
create policy cash_sessions_delete on public.cash_sessions for delete using (
  tenant_id in (select private.current_user_tenants())
  and private.tiene_rol(tenant_id, array['owner'])
);

/* ────── 5. Cerrar un pedido lo asienta el sistema, no la persona ────── */

/**
 * `complete_order` pasa a SECURITY DEFINER.
 *
 * EL BUG QUE APARECIO PROBANDO ESTO
 * La funcion termina con `insert into sales ... returning *`, y el RETURNING
 * exige poder LEER la fila recien escrita. Con los roles de arriba, quien
 * cierra la cuenta —el mozo, el cajero— no lee `sales`: cerrar un pedido le
 * fallaba con "new row violates row-level security policy", que ademas es un
 * mensaje que apunta al lugar equivocado. Y PostgREST agrega RETURNING por
 * defecto, asi que el mismo problema llegaba por la API.
 *
 * NO se arregla dandole lectura de `sales` a quien atiende: eso le abriria el
 * facturado del local, que es justo lo que 6f viene a cerrar. Se arregla
 * asentando la venta como sistema, en una funcion auditada.
 *
 * Al ser definer ya no la protege la RLS, asi que el chequeo de negocio pasa a
 * ser explicito: sin el, cualquiera podria cerrar el pedido de otro local.
 */
create or replace function public.complete_order(p_order_id uuid)
returns setof public.sales
language plpgsql
security definer
set search_path to 'public', 'private', 'pg_temp'
as $function$
declare
  v_order public.orders;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'pedido_no_encontrado' using errcode = 'P0002';
  end if;

  -- Antes lo hacia la RLS. Ahora que la funcion es definer, se dice a mano.
  if v_order.tenant_id not in (select private.current_user_tenants()) then
    raise exception 'pedido_no_encontrado' using errcode = 'P0002';
  end if;
  if not private.tiene_rol(v_order.tenant_id,
                           array['owner','manager','cashier','attendant']) then
    raise exception 'sin_permiso';
  end if;

  if v_order.status = 'completed' then
    raise exception 'ya_completado';
  end if;
  if v_order.status = 'cancelled' then
    raise exception 'pedido_cancelado';
  end if;
  if exists (select 1 from public.sales s where s.order_id = v_order.id) then
    raise exception 'ya_tiene_ventas';
  end if;

  update public.orders set status = 'completed' where id = v_order.id;

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
$function$;
