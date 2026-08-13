-- 0004 POS / Caja / Pagos (kernel, sirve a los 3 rubros). Aplicada via MCP 9/jul/2026.
-- payment_methods (medios por tenant), cash_sessions (arqueo), payments (soporta split).
-- Las 12 policies se generan con un loop para no repetir el patron a mano.

create table if not exists public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  kind text not null default 'other' check (kind in ('cash','card','mp','transfer','account','other')),
  surcharge_pct numeric(5,2) not null default 0,
  discount_pct numeric(5,2) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_payment_methods_tenant on public.payment_methods(tenant_id);

create table if not exists public.cash_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  opened_by uuid,
  opened_at timestamptz not null default now(),
  opening_amount numeric(12,2) not null default 0,
  closed_at timestamptz,
  closing_amount numeric(12,2),
  expected_amount numeric(12,2),
  difference numeric(12,2),
  status text not null default 'open' check (status in ('open','closed')),
  notes text
);
create index if not exists idx_cash_sessions_tenant on public.cash_sessions(tenant_id);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  cash_session_id uuid references public.cash_sessions(id) on delete set null,
  method_id uuid references public.payment_methods(id),
  amount numeric(12,2) not null default 0,
  paid_at timestamptz not null default now()
);
create index if not exists idx_payments_tenant on public.payments(tenant_id);
create index if not exists idx_payments_order on public.payments(order_id);

alter table public.payment_methods enable row level security;
alter table public.cash_sessions enable row level security;
alter table public.payments enable row level security;

do $$
declare tbl text;
begin
  foreach tbl in array array['payment_methods','cash_sessions','payments'] loop
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

-- seed de medios por defecto (via execute_sql, no migracion):
-- insert into public.payment_methods(tenant_id,name,kind)
--   select t.id, m.name, m.kind from public.tenants t
--   cross join (values ('Efectivo','cash'),('Tarjeta','card'),('MercadoPago','mp')) m(name,kind)
--   where not exists (select 1 from public.payment_methods pm where pm.tenant_id=t.id);
