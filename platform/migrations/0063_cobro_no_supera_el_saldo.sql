-- 0063 Un cobro no puede superar lo que falta del pedido.
--
-- ══════════════════ QUE PASABA ══════════════════
--
-- Medido en el smoke del 4/9/2026 (P0-2): pedido de $29.000, `register_payment`
-- por $29.000 —correcto— y un segundo `register_payment` por $29.000 con OTRA
-- `client_request_id`. Aceptado. `payments` quedo con $58.000 sobre un pedido
-- de $29.000 y el arqueo del turno lo dio por bueno.
--
-- La idempotencia por reintento SI funciona: dos llamadas con la misma clave
-- devuelven el mismo pago. Esto es otra cosa: un importe mal tipeado que nada
-- rechaza. Ninguna capa lo frenaba —el servidor no comparaba contra el saldo y
-- el cliente solo exigia `monto > 0`—, y el negocio se entera cuando cierra la
-- caja y le sobra plata que no es suya.
--
-- ══════════════════ POR QUE ACA Y NO SOLO EN LA UI ══════════════════
--
-- El tope tiene que estar en la funcion porque la funcion es la que cualquiera
-- con sesion puede llamar por API. El cliente ademas lo limita, pero eso es
-- comodidad, no control.
--
-- ══════════════════ EL LOCK ══════════════════
--
-- El saldo se lee DESPUES de tomar la fila del pedido con `for update`. Sin
-- eso, dos cajas cobrando la misma cuenta al mismo tiempo leen el mismo saldo
-- y las dos pasan el guard: el sobrecobro vuelve por la ventana. El lock es
-- por pedido, o sea que no serializa la caja entera.
--
-- Tolerancia de un centavo: `payments.amount` es numeric(12,2) y el total del
-- pedido puede venir de una suma con redondeo. Rechazar por $0,004 seria
-- rechazar un cobro correcto.
--
-- El pago SIN pedido (`p_order_id is null`) no tiene saldo contra que medir y
-- queda como estaba.

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
  v_total numeric;
  v_pagado numeric;
  v_saldo numeric;
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

  -- El `for update` es el que hace que el guard de abajo signifique algo con
  -- dos cajas cobrando a la vez.
  select o.branch_id, o.total into v_branch, v_total
    from public.orders o
   where o.id = p_order_id and o.tenant_id = p_tenant_id
     for update;

  if p_order_id is not null then
    if not found then
      raise exception 'pedido_no_encontrado';
    end if;
    select coalesce(sum(p.amount), 0) into v_pagado
      from public.payments p where p.order_id = p_order_id;
    v_saldo := v_total - v_pagado;
    if v_saldo <= 0 then
      raise exception 'pedido_ya_saldado';
    end if;
    if p_amount > v_saldo + 0.01 then
      raise exception 'monto_supera_el_saldo'
        using detail = format('saldo %s, intento %s', v_saldo, p_amount);
    end if;
  end if;

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

revoke all on function public.register_payment(uuid, uuid, uuid, numeric, uuid) from public, anon;
grant execute on function public.register_payment(uuid, uuid, uuid, numeric, uuid) to authenticated;

comment on function public.register_payment(uuid, uuid, uuid, numeric, uuid) is
  'Asienta un cobro. Idempotente por client_request_id y con tope: nunca '
  'registra mas que el saldo del pedido (0063).';
