-- 0026_ingredients.sql — ETAPA 1 del plan de ERP (platform/PLAN-ERP.md)
--
-- Insumos: lo que se compra y se consume. Es la etapa mas chica y la unica
-- que no depende de ninguna otra — saber que falta comprar sirve sin recetas
-- ni P&L.
--
-- Mismas columnas que el legacy (id, name, unit, cost, stock, min_stock,
-- category, food_category, is_archived) para que Stock.jsx se reuse sin
-- adaptarle la logica. La regla del plan: si la pantalla necesita cambios de
-- fondo, la tabla se porto con un shape distinto — se corrige la tabla.
--
-- Cambio contra el legacy: id uuid en vez de serial, como todo el edificio.
-- Stock.jsx no asume el tipo del id en ningun lado (lo usa como clave opaca).
--
-- Sin puente al jsonb como en 0025: nadie en produccion lee insumos todavia.
-- Esta tabla nace sin lectores previos, asi que es la fuente y punto.

create table if not exists public.ingredients (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,

  name text not null,
  unit text,                        -- kg, l, unidad...
  cost numeric not null default 0,  -- costo por unidad
  stock numeric not null default 0,
  min_stock numeric not null default 0,
  category text,                    -- agrupador propio del negocio (ing_cats)
  food_category text,               -- clasificacion USAR, para menu engineering
  is_archived boolean not null default false,

  created_at timestamptz not null default now()
);

-- El listado siempre filtra por tenant y casi siempre esconde archivados.
create index if not exists ingredients_tenant_idx
  on public.ingredients (tenant_id, is_archived);

-- Dos insumos con el mismo nombre en el mismo negocio es siempre un error de
-- carga, y ademas rompe el costeo de recetas (Etapa 2) cuando haya que
-- resolver por nombre. Parcial sobre los no archivados: archivar y volver a
-- crear con el mismo nombre es legitimo.
create unique index if not exists ingredients_tenant_name_uniq
  on public.ingredients (tenant_id, lower(name))
  where is_archived = false;

alter table public.ingredients enable row level security;

drop policy if exists ingredients_select on public.ingredients;
create policy ingredients_select on public.ingredients
  for select using (tenant_id in (select private.current_user_tenants()));

drop policy if exists ingredients_insert on public.ingredients;
create policy ingredients_insert on public.ingredients
  for insert with check (tenant_id in (select private.current_user_tenants()));

drop policy if exists ingredients_update on public.ingredients;
create policy ingredients_update on public.ingredients
  for update using (tenant_id in (select private.current_user_tenants()))
  with check (tenant_id in (select private.current_user_tenants()));

drop policy if exists ingredients_delete on public.ingredients;
create policy ingredients_delete on public.ingredients
  for delete using (tenant_id in (select private.current_user_tenants()));
