-- 0017 Ciclo de vida del tenant + liberacion de slugs por inactividad.
--
-- PROBLEMA: con el signup abierto, una persona con varios emails puede
-- registrar varios tenants. Hay dos danios distintos y conviene no
-- confundirlos:
--
--   a) Cuentas fantasma: filas muertas. Ensucian metricas y consumen free
--      tier, pero no le sacan nada a nadie.
--   b) Ocupacion del namespace: ESTE es el caro. Los slugs son finitos y por
--      orden de llegada. Si alguien toma 'pizzeria' y no lo usa nunca, el
--      cliente real que llega en 6 meses se encuentra el nombre tomado por
--      una cuenta muerta, para siempre.
--
-- Se ataca (b), que es el caro, y SIN fricción en el alta: si el slug se
-- libera solo por inactividad, ocupar deja de rendir. El que se registra en
-- serio no se entera de que esto existe.
--
-- Regla: un tenant que a los 45 dias no cargo NI UN producto pasa a dormant
-- y su slug se libera (se renombra, no se borra: los datos quedan y el dueño
-- puede volver y elegir otro slug).
--
-- 45 y no 30 a proposito: un dueño real puede tardar semanas en sentarse a
-- cargar la carta. Sin mail de aviso previo (falta SMTP propio), conviene
-- pecar de generoso — sacarle el subdominio a un cliente legitimo es MUCHO
-- peor que dejar un squatter 2 semanas de mas.

-- ── 1. Ciclo de vida ───────────────────────────────────────────────
alter table public.tenants
  add column if not exists status text not null default 'trial',
  add column if not exists activated_at timestamptz,      -- primer producto
  add column if not exists first_order_at timestamptz,    -- primer pedido
  add column if not exists last_activity_at timestamptz not null default now();

alter table public.tenants drop constraint if exists tenants_status_check;
alter table public.tenants add constraint tenants_status_check
  check (status in ('trial', 'active', 'dormant'));

-- Indice para el barrido: solo mira trials sin activar.
create index if not exists idx_tenants_dormancy
  on public.tenants(created_at)
  where status = 'trial' and activated_at is null;

-- ── 2. Marcado automatico de actividad ─────────────────────────────
-- SECURITY DEFINER: los triggers tienen que poder tocar tenants sin importar
-- las policies del rol que hizo el insert.

create or replace function public.touch_tenant_on_product()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.tenants
     set activated_at     = coalesce(activated_at, now()),
         status           = case when status = 'trial' then 'active' else status end,
         last_activity_at = now()
   where id = new.tenant_id;
  return new;
end $$;

drop trigger if exists trg_tenant_activity_product on public.products;
create trigger trg_tenant_activity_product
  after insert on public.products
  for each row execute function public.touch_tenant_on_product();

create or replace function public.touch_tenant_on_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.tenants
     set first_order_at   = coalesce(first_order_at, now()),
         last_activity_at = now()
   where id = new.tenant_id;
  return new;
end $$;

drop trigger if exists trg_tenant_activity_order on public.orders;
create trigger trg_tenant_activity_order
  after insert on public.orders
  for each row execute function public.touch_tenant_on_order();

-- ── 3. Backfill de los tenants que ya existen ──────────────────────
-- Los 5 actuales tienen productos: son 'active' desde su primer producto.
update public.tenants t
   set activated_at = coalesce(t.activated_at, p.first_product),
       status       = 'active',
       last_activity_at = greatest(t.last_activity_at, p.first_product)
  from (
    select tenant_id, min(created_at) as first_product
    from public.products group by tenant_id
  ) p
 where p.tenant_id = t.id;

-- ── 4. Liberacion de slugs ─────────────────────────────────────────
-- Renombra en vez de borrar: los datos del dueño quedan intactos y puede
-- volver y elegir otro slug. Lo que se libera es el NOMBRE.
create or replace function public.release_dormant_tenants(p_days integer default 45)
returns table(released_slug text, tenant_id uuid)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- El slug viejo se captura ANTES del update: el RETURNING de un UPDATE
  -- devuelve los valores nuevos, asi que el nombre liberado hay que
  -- guardarlo en un CTE o se pierde.
  return query
  with candidatos as (
    select t.id, t.slug
      from public.tenants t
     where t.status = 'trial'
       and t.activated_at is null
       and t.created_at < now() - make_interval(days => p_days)
     for update
  ), liberados as (
    update public.tenants t
       set status = 'dormant',
           -- 'dormant-<8 hex>' cumple el CHECK de formato y no es reservado.
           slug   = 'dormant-' || left(replace(t.id::text, '-', ''), 8)
      from candidatos c
     where t.id = c.id
    returning t.id
  )
  select c.slug, c.id from candidatos c;
end $$;

revoke all on function public.release_dormant_tenants(integer) from public, anon, authenticated;
grant execute on function public.release_dormant_tenants(integer) to service_role;
