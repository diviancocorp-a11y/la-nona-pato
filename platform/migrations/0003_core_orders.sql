-- 0003 Core Pedidos (kernel, sirve a los 3 rubros). Aplicada via MCP el 9/jul/2026.
-- Mismo patron: tenant_id not null + RLS con private.current_user_tenants().
-- order_items lleva tenant_id propio (denormalizado) para que la policy sea directa
-- y no dependa de un join a orders en cada chequeo.

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  status text not null default 'pending',
  channel text,
  customer_name text,
  customer_phone text,
  total numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_orders_tenant on public.orders(tenant_id);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id),
  name_snapshot text not null,
  unit_price numeric(12,2) not null default 0,
  unit_cost numeric(12,2) not null default 0,
  qty integer not null default 1,
  created_at timestamptz not null default now()
);
create index if not exists idx_order_items_order on public.order_items(order_id);
create index if not exists idx_order_items_tenant on public.order_items(tenant_id);

alter table public.orders enable row level security;
alter table public.order_items enable row level security;

drop policy if exists orders_select on public.orders;
create policy orders_select on public.orders
  for select using (tenant_id in (select private.current_user_tenants()));
drop policy if exists orders_insert on public.orders;
create policy orders_insert on public.orders
  for insert with check (tenant_id in (select private.current_user_tenants()));
drop policy if exists orders_update on public.orders;
create policy orders_update on public.orders
  for update using (tenant_id in (select private.current_user_tenants()))
  with check (tenant_id in (select private.current_user_tenants()));
drop policy if exists orders_delete on public.orders;
create policy orders_delete on public.orders
  for delete using (tenant_id in (select private.current_user_tenants()));

drop policy if exists order_items_select on public.order_items;
create policy order_items_select on public.order_items
  for select using (tenant_id in (select private.current_user_tenants()));
drop policy if exists order_items_insert on public.order_items;
create policy order_items_insert on public.order_items
  for insert with check (tenant_id in (select private.current_user_tenants()));
drop policy if exists order_items_update on public.order_items;
create policy order_items_update on public.order_items
  for update using (tenant_id in (select private.current_user_tenants()))
  with check (tenant_id in (select private.current_user_tenants()));
drop policy if exists order_items_delete on public.order_items;
create policy order_items_delete on public.order_items
  for delete using (tenant_id in (select private.current_user_tenants()));
