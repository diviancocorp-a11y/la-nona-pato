-- 0008 Auth: profiles + provision_owner. Aplicada via MCP el 9/jul/2026.
-- profiles = datos del usuario (1 por auth.users.id). El rol owner vive en tenant_members.
-- provision_owner(user, email, name, vertical, slug) hace tenant + owner + profile de
-- forma ATOMICA: si un insert falla, la funcion revierte los 3. La llama
-- scripts/create-owner.mjs justo despues de crear el auth user; si tira error, el
-- script borra el user (rollback del unico paso no transaccional).

create table if not exists public.profiles (
  id uuid primary key,                 -- = auth.users.id
  tenant_id uuid references public.tenants(id) on delete set null,
  full_name text,
  email text,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (id = auth.uid() or tenant_id in (select private.current_user_tenants()));
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());
-- sin policy de INSERT: se crean solo via provision_owner (definer) o service_role

create or replace function public.provision_owner(
  p_user_id uuid, p_email text, p_name text, p_vertical text, p_slug text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_tenant uuid;
begin
  insert into public.tenants(slug, name, vertical)
    values (p_slug, coalesce(p_name, p_slug), p_vertical)
    returning id into v_tenant;
  insert into public.tenant_members(tenant_id, user_id, role)
    values (v_tenant, p_user_id, 'owner');
  insert into public.profiles(id, tenant_id, full_name, email)
    values (p_user_id, v_tenant, p_name, p_email);
  return v_tenant;
end $$;
revoke all on function public.provision_owner(uuid,text,text,text,text) from public, anon, authenticated;
grant execute on function public.provision_owner(uuid,text,text,text,text) to service_role;
