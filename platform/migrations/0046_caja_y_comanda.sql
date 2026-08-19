-- 0046 — Turno de caja y comanda de salon (Etapa 6d, parte 1).
--
-- LO QUE YA ESTABA
-- `cash_sessions`, `payments` y `payment_methods` existen desde 0004 y nunca
-- se usaron: tienen apertura, cierre, esperado y diferencia. No hace falta
-- modelo nuevo, hacen falta las operaciones que los mueven y la garantia de
-- que no se pisen.
--
-- POR QUE NO HAY UN ESTADO "cuenta abierta"
-- `orders.status` ya tiene `active`. Una cuenta abierta en una mesa ES un
-- pedido activo con mesa asignada. Agregar un estado nuevo duplicaria la
-- semantica y obligaria a que cada consulta pregunte por los dos.
--
-- POR QUE NO HAY TABLA PARA DIVIDIR LA CUENTA
-- `payments` ya soporta varios pagos por pedido — nacio con split en mente.
-- Dividir la cuenta es cobrar el mismo pedido en dos pagos, no partirlo en dos
-- pedidos. Partirlo romperia el vinculo con la mesa y con las ventas ya
-- asentadas.

-- ─────────────────────── La comanda: mesa y mozo ───────────────────────

alter table public.orders
  add column if not exists resource_id     uuid references public.resources(id),
  -- Quien atiende. Es lo que despues permite la propina directa (0047) y la
  -- rentabilidad por mozo.
  add column if not exists staff_id        uuid references public.staff(id) on delete set null,
  add column if not exists cash_session_id uuid references public.cash_sessions(id) on delete set null;

create index if not exists idx_orders_resource on public.orders(resource_id)
  where resource_id is not null;
create index if not exists idx_orders_staff on public.orders(staff_id)
  where staff_id is not null;

comment on column public.orders.resource_id is
  '6d: la mesa. Un pedido active con mesa es una cuenta abierta.';

-- ────────────────────────── Turno de caja ──────────────────────────────

alter table public.cash_sessions
  add column if not exists closed_by  uuid,
  -- El dia operativo al que pertenece el turno. NO es la fecha de apertura:
  -- una caja abierta a las 20:00 que cierra a las 4:00 es UNA jornada, y con
  -- current_date quedaria partida en dos (ver 0041).
  add column if not exists business_day date;

-- UNA caja abierta por sucursal. Sin esto, dos cajeros abren dos turnos sobre
-- el mismo local y el arqueo de los dos da mal sin que nada avise.
create unique index if not exists cash_sessions_una_abierta_por_sucursal
  on public.cash_sessions (branch_id) where status = 'open';

/**
 * Abrir el turno. Devuelve la sesion abierta si ya hay una: reabrir no es un
 * error del cajero, es que alguien ya la abrio — probablemente el del turno
 * anterior que no cerro. Mostrarle un error lo dejaria sin poder trabajar.
 */
create or replace function public.open_cash_session(
  p_tenant_id uuid,
  p_branch_id uuid default null,
  p_opening_amount numeric default 0,
  p_notes text default null
)
returns public.cash_sessions
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $$
declare
  v_branch uuid;
  v_ses public.cash_sessions;
begin
  if p_tenant_id not in (select private.current_user_tenants()) then
    raise exception 'no_sos_miembro';
  end if;

  v_branch := coalesce(p_branch_id,
    (select b.id from public.branches b where b.tenant_id = p_tenant_id and b.is_default));
  if v_branch is null then
    raise exception 'sin_sucursal';
  end if;

  select * into v_ses from public.cash_sessions
   where branch_id = v_branch and status = 'open';
  if found then
    return v_ses;
  end if;

  insert into public.cash_sessions (
    tenant_id, branch_id, opened_by, opening_amount, notes, business_day, status
  )
  values (
    p_tenant_id, v_branch, auth.uid(), coalesce(p_opening_amount, 0), p_notes,
    public.business_date(v_branch), 'open'
  )
  returning * into v_ses;

  return v_ses;
end $$;

revoke all on function public.open_cash_session(uuid, uuid, numeric, text) from public, anon;
grant execute on function public.open_cash_session(uuid, uuid, numeric, text) to authenticated;

/**
 * Cuanto DEBERIA haber en la caja: lo que se puso al abrir mas lo cobrado en
 * efectivo durante el turno.
 *
 * Solo efectivo a proposito. Lo que entro por tarjeta o transferencia no esta
 * en el cajon, y sumarlo haria que el arqueo diera mal siempre — que es como
 * se pierde la confianza en la herramienta.
 */
create or replace function public.cash_session_expected(p_session_id uuid)
returns numeric
language sql
stable
set search_path = public, private, pg_temp
as $$
  select s.opening_amount + coalesce((
    select sum(p.amount)
      from public.payments p
      join public.payment_methods pm on pm.id = p.method_id
     where p.cash_session_id = s.id and pm.kind = 'cash'
  ), 0)
  from public.cash_sessions s
 where s.id = p_session_id
   and s.tenant_id in (select private.current_user_tenants());
$$;

grant execute on function public.cash_session_expected(uuid) to authenticated;

/**
 * Cerrar el turno. El cajero declara lo que CONTO; el sistema calcula lo que
 * esperaba y guarda la diferencia.
 *
 * La diferencia se guarda, no se corrige. Un faltante de $200 es informacion
 * —hay que verlo, no taparlo— y sobreescribir el esperado para que cierre en
 * cero convertiria el arqueo en un tramite.
 */
create or replace function public.close_cash_session(
  p_session_id uuid,
  p_closing_amount numeric,
  p_notes text default null
)
returns public.cash_sessions
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $$
declare
  v_ses public.cash_sessions;
  v_esperado numeric;
begin
  select * into v_ses from public.cash_sessions
   where id = p_session_id
     and tenant_id in (select private.current_user_tenants())
   for update;
  if not found then
    raise exception 'turno_no_encontrado';
  end if;
  if v_ses.status = 'closed' then
    -- Idempotente como el resto: volver a cerrar devuelve el cierre que ya se
    -- hizo en vez de pisarlo con otro conteo.
    return v_ses;
  end if;

  v_esperado := public.cash_session_expected(p_session_id);

  update public.cash_sessions
     set status = 'closed',
         closed_at = now(),
         closed_by = auth.uid(),
         closing_amount = coalesce(p_closing_amount, 0),
         expected_amount = v_esperado,
         difference = coalesce(p_closing_amount, 0) - v_esperado,
         notes = coalesce(nullif(btrim(coalesce(p_notes, '')), ''), notes)
   where id = p_session_id
  returning * into v_ses;

  return v_ses;
end $$;

revoke all on function public.close_cash_session(uuid, numeric, text) from public, anon;
grant execute on function public.close_cash_session(uuid, numeric, text) to authenticated;

-- ─────────────────────── Cobrar contra el turno ────────────────────────

/**
 * Registrar un pago. Va por RPC y no por insert directo porque tiene que
 * atarse al turno abierto: un pago sin `cash_session_id` no entra en ningun
 * arqueo y aparece como faltante al cerrar.
 *
 * Idempotente: el boton de cobrar es el que mas se toca dos veces.
 */
create or replace function public.register_payment(
  p_tenant_id uuid,
  p_order_id uuid,
  p_method_id uuid,
  p_amount numeric,
  p_client_request_id uuid default null
)
returns public.payments
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $$
declare
  v_pago public.payments;
  v_branch uuid;
  v_ses uuid;
begin
  if p_tenant_id not in (select private.current_user_tenants()) then
    raise exception 'no_sos_miembro';
  end if;
  if coalesce(p_amount, 0) <= 0 then
    raise exception 'monto_invalido';
  end if;

  if p_client_request_id is not null then
    select * into v_pago from public.payments p
     where p.tenant_id = p_tenant_id and p.client_request_id = p_client_request_id;
    if found then
      return v_pago;
    end if;
  end if;

  select o.branch_id into v_branch from public.orders o
   where o.id = p_order_id and o.tenant_id = p_tenant_id;
  if v_branch is null then
    select b.id into v_branch from public.branches b
     where b.tenant_id = p_tenant_id and b.is_default;
  end if;

  select s.id into v_ses from public.cash_sessions s
   where s.branch_id = v_branch and s.status = 'open';

  insert into public.payments (
    tenant_id, branch_id, order_id, cash_session_id, method_id, amount,
    client_request_id
  )
  values (p_tenant_id, v_branch, p_order_id, v_ses, p_method_id, p_amount,
          p_client_request_id)
  returning * into v_pago;

  return v_pago;
end $$;

alter table public.payments
  add column if not exists client_request_id uuid;

create unique index if not exists payments_client_request_uniq
  on public.payments (tenant_id, client_request_id)
  where client_request_id is not null;

revoke all on function public.register_payment(uuid, uuid, uuid, numeric, uuid) from public, anon;
grant execute on function public.register_payment(uuid, uuid, uuid, numeric, uuid) to authenticated;

/**
 * Lo que falta cobrar de un pedido. Es la cuenta que decide si el pedido se
 * puede cerrar: total menos lo ya pagado.
 */
create or replace function public.order_balance(p_order_id uuid)
returns numeric
language sql
stable
set search_path = public, private, pg_temp
as $$
  select o.total - coalesce((
    select sum(p.amount) from public.payments p where p.order_id = o.id
  ), 0)
  from public.orders o
 where o.id = p_order_id
   and o.tenant_id in (select private.current_user_tenants());
$$;

grant execute on function public.order_balance(uuid) to authenticated;

-- ─────────────────────── Mover una cuenta de mesa ──────────────────────

/**
 * Pasar la cuenta a otra mesa. Es una operacion de todos los dias en un salon
 * —"pasate a la de la ventana"— y sin esto habria que cancelar y recargar el
 * pedido entero, perdiendo la hora de apertura y lo ya cobrado.
 *
 * Queda en el audit log (0043) porque cambia una fila de `orders`.
 */
create or replace function public.move_order_to_resource(
  p_tenant_id uuid,
  p_order_id uuid,
  p_resource_id uuid
)
returns public.orders
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $$
declare v_o public.orders;
begin
  if p_tenant_id not in (select private.current_user_tenants()) then
    raise exception 'no_sos_miembro';
  end if;

  if p_resource_id is not null and not exists (
    select 1 from public.resources r
     where r.id = p_resource_id and r.tenant_id = p_tenant_id and r.active) then
    raise exception 'mesa_de_otro_negocio';
  end if;

  -- Una mesa con cuenta abierta no recibe otra: dos cuentas en la misma mesa
  -- terminan en un cobro cruzado.
  if p_resource_id is not null and exists (
    select 1 from public.orders o
     where o.resource_id = p_resource_id
       and o.tenant_id = p_tenant_id
       and o.id <> p_order_id
       and o.status in ('new', 'preparing', 'active')) then
    raise exception 'mesa_ocupada';
  end if;

  update public.orders set resource_id = p_resource_id
   where id = p_order_id and tenant_id = p_tenant_id
  returning * into v_o;
  if not found then
    raise exception 'pedido_no_encontrado';
  end if;

  return v_o;
end $$;

revoke all on function public.move_order_to_resource(uuid, uuid, uuid) from public, anon;
grant execute on function public.move_order_to_resource(uuid, uuid, uuid) to authenticated;
