-- 0059 El primer valor entra por TRES caminos, no por uno.
-- Aplicada via MCP el 24/ago/2026.
--
-- ── EL BUG ──
-- La 0058 puso un trigger sobre `orders.paid_at` y dio el tema por cerrado.
-- Pero `orders.paid_at` lo escribe UNICAMENTE `mp-webhook`: es el camino de
-- MercadoPago y nada mas.
--
-- Un bar que cobra en efectivo por mostrador no pasa por ahi. `complete_order`
-- marca el pedido y asienta las ventas en `sales`; `orders.paid_at` queda en
-- null. Para el caso mas comun de gastronomia —que es el rubro del primer
-- prospecto— el primer valor no se marcaba nunca.
--
-- El sintoma era silencioso y peor que un error: el panel decia "0 llegaron al
-- primer valor" con total seguridad, y uno habia llegado hacia seis dias.
--
-- ── LOS TRES CAMINOS ──
--   1. `orders.paid_at` / payment_status  → MercadoPago (mp-webhook)
--   2. `payments`                         → cobro en caja / mostrador
--   3. `sales`                            → complete_order y la venta manual
--
-- El tercero es el mas transitado y era el que faltaba. Los tres significan lo
-- mismo: entro plata. Cual de los tres lo detecte primero no importa; que
-- ninguno se escape, si.
--
-- ── COMO SE ENCONTRO ──
-- Trazando el camino critico antes de mostrarle el sistema a un prospecto, en
-- vez de asumir que el trigger nuevo andaba. Un trigger que no dispara no
-- falla: miente.

create or replace function public.marcar_primer_valor_de(p_tenant uuid, p_cuando timestamptz)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.tenants
     set first_value_at = coalesce(first_value_at, coalesce(p_cuando, now()))
   where id = p_tenant and first_value_at is null;
$$;

revoke execute on function public.marcar_primer_valor_de(uuid, timestamptz)
  from public, anon, authenticated;

-- 1. MercadoPago: el webhook marca el pedido.
create or replace function public.primer_valor_por_pedido()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.paid_at is not null or new.payment_status = 'approved' then
    perform public.marcar_primer_valor_de(new.tenant_id, coalesce(new.paid_at, now()));
  end if;
  return new;
end $$;

-- 2. Mostrador: una fila en `payments` es plata cobrada en caja.
create or replace function public.primer_valor_por_cobro()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.marcar_primer_valor_de(new.tenant_id, new.paid_at);
  return new;
end $$;

-- 3. El libro de ventas: `complete_order` asienta aca, y tambien la venta
--    manual. Es el camino mas transitado y el que faltaba.
create or replace function public.primer_valor_por_venta()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.marcar_primer_valor_de(new.tenant_id, new.created_at);
  return new;
end $$;

revoke execute on function public.primer_valor_por_pedido() from public, anon, authenticated;
revoke execute on function public.primer_valor_por_cobro() from public, anon, authenticated;
revoke execute on function public.primer_valor_por_venta() from public, anon, authenticated;

drop trigger if exists trg_primer_valor on public.orders;
create trigger trg_primer_valor
  after insert or update of paid_at, payment_status on public.orders
  for each row execute function public.primer_valor_por_pedido();

drop trigger if exists trg_primer_valor_cobro on public.payments;
create trigger trg_primer_valor_cobro
  after insert on public.payments
  for each row execute function public.primer_valor_por_cobro();

drop trigger if exists trg_primer_valor_venta on public.sales;
create trigger trg_primer_valor_venta
  after insert on public.sales
  for each row execute function public.primer_valor_por_venta();

drop function if exists public.marcar_primer_valor();

-- Backfill por los tres caminos. El de la 0058 solo miro `orders` y por eso
-- dejo en null a La Nona Pato, que tenia ventas asentadas desde el 18/ago.
with primeros as (
  select tenant_id, min(cuando) as cuando from (
    select tenant_id, coalesce(paid_at, created_at) as cuando
      from public.orders
     where paid_at is not null or payment_status = 'approved'
    union all
    select tenant_id, paid_at from public.payments
    union all
    select tenant_id, created_at from public.sales
  ) todo
  group by tenant_id
)
update public.tenants t
   set first_value_at = p.cuando
  from primeros p
 where p.tenant_id = t.id and t.first_value_at is null;
