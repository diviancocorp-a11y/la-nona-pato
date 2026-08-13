-- 0012 Checkout core del edificio.
--
-- Contexto: submit-order legacy escribe en una tabla `orders` de 42 columnas y
-- lee config de una `settings` de 47. El edificio tenia `orders` con 8 columnas
-- (0003) y ninguna settings. Esta migracion porta SOLO lo que el checkout y la
-- vista de Pedidos del admin usan de verdad — no las 42 columnas del legacy,
-- muchas de las cuales son de modulos (facturacion AFIP, exports) que todavia
-- no viven en el edificio.
--
-- La config por tenant (payment_accounts, delivery_pricing, daily_deals,
-- deal_pct, cat_groups, prep_time_min) NO lleva tabla nueva: va en
-- tenants.settings jsonb, que ya existe desde 0001.
--
-- Mismo patron de siempre: tenant_id not null + RLS + policies con
-- private.current_user_tenants().

-- ── 1. orders: campos de checkout ──────────────────────────────────
alter table public.orders
  add column if not exists customer_email text,
  add column if not exists delivery text not null default 'retiro',
  add column if not exists delivery_address text,
  add column if not exists delivery_cost numeric(12,2) not null default 0,
  add column if not exists delivery_date date,
  add column if not exists payment text not null default 'efectivo',
  add column if not exists payment_account_id text,
  add column if not exists payment_account_snapshot jsonb,
  add column if not exists note text,
  add column if not exists is_gift boolean not null default false,
  add column if not exists gift_note text,
  add column if not exists subtotal numeric(12,2) not null default 0,
  add column if not exists discount numeric(12,2) not null default 0,
  add column if not exists tip_pct numeric(5,2) not null default 0,
  add column if not exists tip_amount numeric(12,2) not null default 0,
  add column if not exists user_id uuid references auth.users(id) on delete set null;

-- delivery y payment son buckets cerrados: el detalle fino del medio de pago
-- vive en payment_account_snapshot (anti-spoof, lo arma el server).
alter table public.orders drop constraint if exists orders_delivery_check;
alter table public.orders add constraint orders_delivery_check
  check (delivery in ('retiro', 'envio'));

alter table public.orders drop constraint if exists orders_payment_check;
alter table public.orders add constraint orders_payment_check
  check (payment in ('efectivo', 'transferencia', 'mercadopago', 'tarjeta'));

-- El panel filtra por estado y ordena por fecha: indice compuesto por tenant.
create index if not exists idx_orders_tenant_status on public.orders(tenant_id, status, created_at desc);

-- ── 2. order_items: subtotal ───────────────────────────────────────
-- Derivable de qty*unit_price, pero el legacy lo persiste y la vista de
-- Pedidos lo lee directo. Se guarda para no romper esa lectura al migrar.
alter table public.order_items
  add column if not exists subtotal numeric(12,2) not null default 0;

-- ── 3. coupons ─────────────────────────────────────────────────────
create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  code text not null,
  discount_pct numeric(5,2) not null default 0,
  email text,
  used boolean not null default false,
  used_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
-- El codigo es unico POR TENANT: dos locales distintos pueden tener "BIENVENIDO".
create unique index if not exists idx_coupons_tenant_code on public.coupons(tenant_id, upper(code));

alter table public.orders
  add column if not exists coupon_id uuid references public.coupons(id) on delete set null;

alter table public.coupons enable row level security;

drop policy if exists coupons_select on public.coupons;
create policy coupons_select on public.coupons
  for select using (tenant_id in (select private.current_user_tenants()));
drop policy if exists coupons_insert on public.coupons;
create policy coupons_insert on public.coupons
  for insert with check (tenant_id in (select private.current_user_tenants()));
drop policy if exists coupons_update on public.coupons;
create policy coupons_update on public.coupons
  for update using (tenant_id in (select private.current_user_tenants()))
  with check (tenant_id in (select private.current_user_tenants()));
drop policy if exists coupons_delete on public.coupons;
create policy coupons_delete on public.coupons
  for delete using (tenant_id in (select private.current_user_tenants()));

-- ── 4. rate limit ──────────────────────────────────────────────────
-- submit-order legacy llama check_rate_limit(p_key, p_max_requests,
-- p_window_seconds). La tabla NO lleva tenant_id: la clave es la IP del
-- cliente, y el abuso se corta antes de saber a que tenant apunta.
create table if not exists public.rate_limits (
  key text primary key,
  hits integer not null default 0,
  window_start timestamptz not null default now()
);

-- Sin policies: RLS prendida y nadie mas que service_role (que la saltea)
-- puede tocarla. anon/authenticated quedan sin acceso por defecto.
alter table public.rate_limits enable row level security;

create or replace function public.check_rate_limit(
  p_key text,
  p_max_requests integer default 10,
  p_window_seconds integer default 60
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_hits integer;
begin
  insert into public.rate_limits (key, hits, window_start)
    values (p_key, 1, now())
  on conflict (key) do update
    set hits = case
          when public.rate_limits.window_start < now() - make_interval(secs => p_window_seconds)
            then 1
          else public.rate_limits.hits + 1
        end,
        window_start = case
          when public.rate_limits.window_start < now() - make_interval(secs => p_window_seconds)
            then now()
          else public.rate_limits.window_start
        end
  returning hits into v_hits;

  return v_hits <= p_max_requests;
end;
$$;

-- Solo el service role la llama (desde la edge function). Nunca anon.
revoke all on function public.check_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, integer, integer) to service_role;
