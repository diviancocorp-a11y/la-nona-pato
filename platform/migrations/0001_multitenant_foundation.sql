-- 0001 Fundacion multi-tenant del edificio Hermes (hermes-platform)
-- Aplicada via MCP el 9/jul/2026. Proyecto: wwwzdgprsooyjgkuyoav (sa-east-1).
-- tenants + membresias + helper current_user_tenants() + products (tabla-patron) + RLS.
-- NOTA: el helper se movio a esquema privado en 0002 (ver ese archivo).

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  vertical text not null check (vertical in ('gastro','barber','retail')),
  plan text not null default 'free',
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- user_id = auth.uid(); sin FK dura a auth.users (a proposito: self-contained + testeable)
create table if not exists public.tenant_members (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null,
  role text not null default 'staff' check (role in ('owner','staff')),
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);
create index if not exists idx_tenant_members_user on public.tenant_members(user_id);

-- helper SECURITY DEFINER: evita recursion de RLS (lee membresias del caller por auth.uid())
create or replace function public.current_user_tenants()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id from public.tenant_members where user_id = auth.uid()
$$;
revoke all on function public.current_user_tenants() from public;
grant execute on function public.current_user_tenants() to authenticated, anon;

-- products: tabla-patron. type = composite(gastro) | simple(retail) | variant_parent(ropa) | service(barberia)
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  type text not null default 'simple' check (type in ('composite','simple','variant_parent','service')),
  name text not null,
  price numeric(12,2) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_products_tenant on public.products(tenant_id);

-- RLS
alter table public.tenants enable row level security;
alter table public.tenant_members enable row level security;
alter table public.products enable row level security;

drop policy if exists tenants_select on public.tenants;
create policy tenants_select on public.tenants
  for select using (id in (select public.current_user_tenants()));

drop policy if exists tenant_members_select on public.tenant_members;
create policy tenant_members_select on public.tenant_members
  for select using (user_id = auth.uid());

drop policy if exists products_select on public.products;
create policy products_select on public.products
  for select using (tenant_id in (select public.current_user_tenants()));

drop policy if exists products_insert on public.products;
create policy products_insert on public.products
  for insert with check (tenant_id in (select public.current_user_tenants()));

drop policy if exists products_update on public.products;
create policy products_update on public.products
  for update using (tenant_id in (select public.current_user_tenants()))
  with check (tenant_id in (select public.current_user_tenants()));

drop policy if exists products_delete on public.products;
create policy products_delete on public.products
  for delete using (tenant_id in (select public.current_user_tenants()));
