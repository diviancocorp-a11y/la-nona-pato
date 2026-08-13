-- 0007 Pack ropa (retail). Aplicada via MCP el 9/jul/2026.
-- Ancla = inventario por variante (matrix). Cada talle/color = 1 SKU con stock,
-- barcode y precio propio. Mas nota de credito (store_credits) y devoluciones.

alter table public.products add column if not exists stock integer; -- retail simple sin variantes

create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  size text,
  color text,
  sku text,
  barcode text,
  price numeric(12,2),        -- null = usa el precio del producto padre
  stock integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_variants_tenant on public.product_variants(tenant_id);
create index if not exists idx_variants_product on public.product_variants(product_id);
create unique index if not exists uq_variant_combo on public.product_variants(product_id, coalesce(size,''), coalesce(color,''));
create unique index if not exists uq_variant_sku on public.product_variants(tenant_id, sku) where sku is not null;
create unique index if not exists uq_variant_barcode on public.product_variants(tenant_id, barcode) where barcode is not null;

create table if not exists public.store_credits (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  code text,
  customer_name text,
  customer_phone text,
  origin_order_id uuid references public.orders(id) on delete set null,
  amount numeric(12,2) not null default 0,
  balance numeric(12,2) not null default 0,
  status text not null default 'issued' check (status in ('issued','partial','redeemed','void')),
  created_at timestamptz not null default now()
);
create index if not exists idx_store_credits_tenant on public.store_credits(tenant_id);
create unique index if not exists uq_store_credit_code on public.store_credits(tenant_id, code) where code is not null;

create table if not exists public.product_returns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  variant_id uuid references public.product_variants(id),
  product_id uuid references public.products(id),
  qty integer not null default 1,
  reason text,
  restocked boolean not null default true,
  credit_id uuid references public.store_credits(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_returns_tenant on public.product_returns(tenant_id);

alter table public.product_variants enable row level security;
alter table public.store_credits enable row level security;
alter table public.product_returns enable row level security;

do $$
declare tbl text;
begin
  foreach tbl in array array['product_variants','store_credits','product_returns'] loop
    execute format('drop policy if exists %I_select on public.%I', tbl, tbl);
    execute format('create policy %I_select on public.%I for select using (tenant_id in (select private.current_user_tenants()))', tbl, tbl);
    execute format('drop policy if exists %I_insert on public.%I', tbl, tbl);
    execute format('create policy %I_insert on public.%I for insert with check (tenant_id in (select private.current_user_tenants()))', tbl, tbl);
    execute format('drop policy if exists %I_update on public.%I', tbl, tbl);
    execute format('create policy %I_update on public.%I for update using (tenant_id in (select private.current_user_tenants())) with check (tenant_id in (select private.current_user_tenants()))', tbl, tbl);
    execute format('drop policy if exists %I_delete on public.%I', tbl, tbl);
    execute format('create policy %I_delete on public.%I for delete using (tenant_id in (select private.current_user_tenants()))', tbl, tbl);
  end loop;
end $$;

-- seed (via execute_sql): tienda-demo pasa a variant_parent + 3 variantes (S/M/L Negro con barcode).
