-- 0053 Un solo duenio de la plataforma. Aplicada via MCP 20/ago/2026.
--
-- EL PROBLEMA: cualquier staff podia sumar y quitar staff. Alguien a quien le
-- diste acceso para mirar cobros podia darle acceso a un tercero, o sacarte a
-- vos. El acceso a la consola deja de ser transitivo: lo reparte UNA persona.
--
-- ENTRAR y REPARTIR pasan a ser dos permisos distintos:
--   staff  entra a la consola, mira y edita precios y suscripciones.
--   owner  ademas decide quien entra.

alter table public.platform_admins
  add column if not exists rol text not null default 'staff'
    check (rol in ('owner', 'staff'));

-- Uno solo. No es capricho: con dos duenios cada uno puede sacar al otro y el
-- desempate no existe en ninguna pantalla.
create unique index if not exists platform_admins_un_solo_owner
  on public.platform_admins ((rol)) where rol = 'owner';

create or replace function private.es_owner_divianco()
returns boolean
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select exists (
    select 1 from public.platform_admins
     where user_id = auth.uid() and rol = 'owner'
  )
$$;

revoke all on function private.es_owner_divianco() from public, anon;
grant execute on function private.es_owner_divianco() to authenticated;

create or replace function public.sumar_staff(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_uid uuid;
  v_email text := lower(trim(p_email));
  v_dominio text;
begin
  if not private.es_owner_divianco() then
    raise exception 'solo_el_duenio';
  end if;

  -- El dominio sale de la ULTIMA arroba: por la primera pasaria
  -- 'grupodivianco.com@gmail.com', que es gmail disfrazado de corporativo.
  v_dominio := lower(split_part(v_email, '@', array_length(string_to_array(v_email, '@'), 1)));
  if v_dominio = '' or v_dominio not in (select dominio from public.staff_dominios) then
    return jsonb_build_object('ok', false, 'error', 'dominio_no_permitido');
  end if;

  select public.find_user_id_by_email(v_email) into v_uid;
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'sin_cuenta');
  end if;

  insert into public.platform_admins (user_id, email, rol)
  values (v_uid, v_email, 'staff')
  on conflict (user_id) do update set email = excluded.email;

  return jsonb_build_object('ok', true, 'user_id', v_uid, 'email', v_email);
end $$;

create or replace function public.quitar_staff(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare v_rol text;
begin
  if not private.es_owner_divianco() then
    raise exception 'solo_el_duenio';
  end if;

  select rol into v_rol from public.platform_admins where user_id = p_user_id;
  if v_rol is null then
    return jsonb_build_object('ok', false, 'error', 'no_esta');
  end if;

  -- Al duenio no se lo saca ni el mismo: quedaria una consola que nadie puede
  -- administrar, y eso no se arregla desde ninguna pantalla.
  if v_rol = 'owner' then
    return jsonb_build_object('ok', false, 'error', 'es_el_duenio');
  end if;

  delete from public.platform_admins where user_id = p_user_id;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.sumar_staff(text) from public, anon;
revoke all on function public.quitar_staff(uuid) from public, anon;
grant execute on function public.sumar_staff(text) to authenticated;
grant execute on function public.quitar_staff(uuid) to authenticated;

-- El duenio actual. Se hace por dato y no en el codigo: quien manda en la
-- plataforma es una decision de negocio, no una constante de la aplicacion.
--   update public.platform_admins set rol = 'owner' where email = '...';
