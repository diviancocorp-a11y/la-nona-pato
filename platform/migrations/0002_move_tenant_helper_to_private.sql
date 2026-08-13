-- 0002 Mover el helper de tenants a esquema privado (no expuesto en la API REST)
-- Aplicada via MCP el 9/jul/2026. Cierra 2 warnings del linter de Supabase:
-- "SECURITY DEFINER function ejecutable por anon/authenticated via /rest/v1/rpc".
-- No era fuga real (solo devuelve los tenants del caller), pero es buena practica
-- sacarla del schema publico. PostgREST no expone funciones de schemas no listados.

create schema if not exists private;

create or replace function private.current_user_tenants()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id from public.tenant_members where user_id = auth.uid()
$$;
revoke all on function private.current_user_tenants() from public;
grant usage on schema private to authenticated, anon;
grant execute on function private.current_user_tenants() to authenticated, anon;

-- repuntar todas las policies al helper privado
drop policy if exists tenants_select on public.tenants;
create policy tenants_select on public.tenants
  for select using (id in (select private.current_user_tenants()));

drop policy if exists products_select on public.products;
create policy products_select on public.products
  for select using (tenant_id in (select private.current_user_tenants()));
drop policy if exists products_insert on public.products;
create policy products_insert on public.products
  for insert with check (tenant_id in (select private.current_user_tenants()));
drop policy if exists products_update on public.products;
create policy products_update on public.products
  for update using (tenant_id in (select private.current_user_tenants()))
  with check (tenant_id in (select private.current_user_tenants()));
drop policy if exists products_delete on public.products;
create policy products_delete on public.products
  for delete using (tenant_id in (select private.current_user_tenants()));

-- sacar el helper del esquema publico
drop function if exists public.current_user_tenants();
