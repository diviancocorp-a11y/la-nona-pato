-- 0033_waste_log.sql — Merma (Etapa 6 del PLAN-ERP, la pieza que completa
-- el P&L de la Etapa 4).
--
-- La merma cargada a mano (vencimiento, rotura, derrame) es perdida REAL de
-- stock que no pasa por ningun pedido: sin ella el resultado del mes da mas
-- lindo de lo que fue. MonthSummary ya la resta (mermaCost) — hasta ahora
-- recibia una lista vacia.
--
-- Mismas columnas que el legacy + tenant_id, como siempre. Y la operacion va
-- por RPC por el criterio de la Etapa 3: registrar una merma toca dos filas
-- y es plata (el asiento + el descuento de stock). En el legacy son dos
-- llamadas sueltas desde el navegador (registerWaste en inventory.js): si la
-- segunda no llega, queda merma asentada con el stock intacto.

create table if not exists public.waste_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,

  -- set null y no cascade: la perdida ya paso aunque el insumo se borre.
  ingredient_id uuid references public.ingredients(id) on delete set null,

  qty numeric not null check (qty > 0),
  reason text not null default 'otro',
  note text,
  date date not null default current_date,

  created_at timestamptz not null default now()
);

create index if not exists waste_log_tenant_date_idx
  on public.waste_log (tenant_id, date desc);

alter table public.waste_log enable row level security;

drop policy if exists waste_log_select on public.waste_log;
create policy waste_log_select on public.waste_log
  for select using (tenant_id in (select private.current_user_tenants()));

drop policy if exists waste_log_insert on public.waste_log;
create policy waste_log_insert on public.waste_log
  for insert with check (tenant_id in (select private.current_user_tenants()));

-- Sin UPDATE ni DELETE: una merma no se edita ni se borra (mismo criterio
-- que expenses y sales). Un error de carga se corrige con un ajuste de
-- stock y, cuando haga falta, con un asiento de reversion.

/* ═════════════════════ REGISTRAR UNA MERMA ═════════════════════ */
--
-- Asienta la perdida Y descuenta el stock en una transaccion. El stock no
-- baja de 0 (mismo clamp que el legacy): tirar mas de lo que el sistema
-- creia que habia es un error de inventario previo, no stock negativo.

create or replace function public.register_waste(
  p_tenant_id uuid,
  p_ingredient_id uuid,
  p_qty numeric,
  p_reason text default 'otro',
  p_note text default null
)
returns setof public.waste_log
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $$
declare
  v_ing public.ingredients;
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
  insert into public.waste_log (tenant_id, ingredient_id, qty, reason, note)
  values (
    p_tenant_id, v_ing.id, p_qty,
    coalesce(nullif(btrim(coalesce(p_reason, '')), ''), 'otro'),
    nullif(btrim(coalesce(p_note, '')), '')
  )
  returning *;
end;
$$;

comment on table public.waste_log is
  'Merma cargada a mano. Perdida real de stock que no pasa por pedidos; la resta el P&L.';
comment on function public.register_waste is
  'Etapa 6: asienta la merma y descuenta el stock en una sola transaccion.';
