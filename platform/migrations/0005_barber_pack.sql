-- 0005 Pack barberia (agenda). Aplicada via MCP el 9/jul/2026.
-- staff (comisiones), products.duration_min para servicios, appointments con
-- exclusion constraint: el mismo barbero NO puede tener 2 turnos superpuestos
-- (la agenda no es un CRUD). Adyacentes (10:00-10:30 y 10:30-11:00) SI se permiten
-- porque tstzrange es half-open [).

create extension if not exists btree_gist;  -- movida a schema extensions en 0006

alter table public.products add column if not exists duration_min integer;

create table if not exists public.staff (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  user_id uuid,
  commission_pct numeric(5,2) not null default 0,
  color text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_staff_tenant on public.staff(tenant_id);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  staff_id uuid not null references public.staff(id) on delete cascade,
  service_id uuid references public.products(id),
  customer_name text,
  customer_phone text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'booked' check (status in ('booked','confirmed','done','no_show','cancelled')),
  notes text,
  created_at timestamptz not null default now(),
  constraint appt_time_valid check (ends_at > starts_at),
  constraint appt_no_overlap exclude using gist (
    staff_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (status <> 'cancelled')
);
create index if not exists idx_appointments_tenant on public.appointments(tenant_id);
create index if not exists idx_appointments_staff_time on public.appointments(staff_id, starts_at);

alter table public.staff enable row level security;
alter table public.appointments enable row level security;

do $$
declare tbl text;
begin
  foreach tbl in array array['staff','appointments'] loop
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

-- seed (via execute_sql): 2 barberos + duration=30 al servicio demo + 2 turnos demo.
