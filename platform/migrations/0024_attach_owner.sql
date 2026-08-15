-- 0024_attach_owner.sql
-- Vincula un usuario que YA existe a un tenant que YA existe.
--
-- provision_owner (0008) no sirve para esto: crea el tenant. Los 5 tenants
-- portados/demo (cochi, mala-miga, la-nona-pato, barberia-demo, tienda-demo)
-- se cargaron por script sin dueno, asi que tienen productos pero NADIE puede
-- abrirles el panel — el gate del admin es tener fila en tenant_members.
--
-- Es una operacion de administracion, no de producto: dar acceso a un negocio
-- ajeno es escalar privilegios, asi que queda revocada para anon y
-- authenticated. Solo service_role, via platform/scripts/attach-owner.mjs.
-- El dia que exista "invitar a mi equipo" desde el panel, esa funcion va a ser
-- otra: va a tener que verificar que el que invita sea owner DE ESE tenant.
--
-- Idempotente: volver a correrla actualiza el rol en vez de fallar.

create or replace function public.attach_owner(
  p_user_id uuid, p_slug text, p_role text default 'owner'
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_tenant uuid;
begin
  if p_role not in ('owner', 'staff') then
    raise exception 'rol invalido: % (owner|staff)', p_role;
  end if;

  -- Sin este guard, un uuid mal tipeado crea una fila de miembro fantasma:
  -- ocupa la PK del tenant y no le da acceso a nadie.
  if not exists (select 1 from auth.users u where u.id = p_user_id) then
    raise exception 'no existe usuario con id %', p_user_id;
  end if;

  select t.id into v_tenant from public.tenants t where t.slug = p_slug;
  if v_tenant is null then
    raise exception 'no existe tenant con slug %', p_slug;
  end if;

  insert into public.tenant_members(tenant_id, user_id, role)
    values (v_tenant, p_user_id, p_role)
    on conflict (tenant_id, user_id) do update set role = excluded.role;

  -- profiles.tenant_id es informativo: el acceso real sale de tenant_members
  -- (ver private.current_user_tenants). Por eso se crea si falta pero NO se
  -- pisa — un usuario en varios tenants conserva el de origen.
  insert into public.profiles(id, tenant_id, full_name, email)
    select p_user_id, v_tenant, u.raw_user_meta_data->>'full_name', u.email
    from auth.users u where u.id = p_user_id
    on conflict (id) do nothing;

  return v_tenant;
end $$;

revoke all on function public.attach_owner(uuid, text, text) from public;
revoke all on function public.attach_owner(uuid, text, text) from anon;
revoke all on function public.attach_owner(uuid, text, text) from authenticated;
grant execute on function public.attach_owner(uuid, text, text) to service_role;
