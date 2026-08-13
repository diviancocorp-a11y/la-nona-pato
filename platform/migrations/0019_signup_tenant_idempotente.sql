-- 0019 signup_tenant idempotente.
--
-- En 0016, volver a llamarla con un tenant ya creado tiraba excepcion. El
-- caso real donde eso pasa no es un abuso: es el dueño que recarga
-- /bienvenido o vuelve a tocar el link del mail. Tratarlo como error obligaba
-- al front a (a) matchear el TEXTO del error, que es fragil, y (b) consultar
-- profiles para averiguar a que local mandarlo.
--
-- Ahora devuelve el tenant existente con already_existed=true. El front se
-- simplifica a "llamar y redirigir", sin ramas por string ni queries extra.

create or replace function public.signup_tenant()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_meta      jsonb;
  v_email     text;
  v_confirmed timestamptz;
  v_name      text;
  v_vertical  text;
  v_slug      text;
  v_tenant    uuid;
  v_existente record;
begin
  if v_uid is null then
    raise exception 'No hay sesion activa' using errcode = '28000';
  end if;

  select u.raw_user_meta_data, u.email, u.email_confirmed_at
    into v_meta, v_email, v_confirmed
  from auth.users u where u.id = v_uid;

  if v_confirmed is null then
    raise exception 'Confirma tu email antes de crear el negocio' using errcode = '28000';
  end if;

  -- Ya tiene negocio: se devuelve el suyo en vez de fallar. Sigue habiendo
  -- UN tenant por cuenta — no se crea otro, se informa el que ya existe.
  select t.id, t.slug, t.vertical into v_existente
    from public.tenant_members m
    join public.tenants t on t.id = m.tenant_id
   where m.user_id = v_uid
   limit 1;

  if found then
    return jsonb_build_object(
      'tenant_id', v_existente.id,
      'slug',      v_existente.slug,
      'vertical',  v_existente.vertical,
      'already_existed', true
    );
  end if;

  v_name     := nullif(trim(v_meta->>'biz_name'), '');
  v_vertical := lower(nullif(trim(v_meta->>'vertical'), ''));
  v_slug     := lower(nullif(trim(v_meta->>'slug'), ''));

  if v_name is null or v_slug is null then
    raise exception 'Faltan datos del negocio' using errcode = '22023';
  end if;

  if v_vertical is null or v_vertical not in ('gastro','barber','retail') then
    raise exception 'Rubro invalido' using errcode = '22023';
  end if;

  if not public.slug_available(v_slug) then
    raise exception 'El slug % no esta disponible', v_slug using errcode = '23505';
  end if;

  insert into public.tenants(slug, name, vertical, settings)
    values (v_slug, v_name, v_vertical, jsonb_build_object(
      'logo_color', '#111111',
      'catalog_theme', 'ambar',
      'prep_time_min', 30
    ))
    returning id into v_tenant;

  insert into public.tenant_members(tenant_id, user_id, role)
    values (v_tenant, v_uid, 'owner');

  insert into public.profiles(id, tenant_id, full_name, email)
    values (v_uid, v_tenant, coalesce(nullif(trim(v_meta->>'full_name'),''), v_name), v_email)
  on conflict (id) do update
    set tenant_id = excluded.tenant_id, email = excluded.email;

  return jsonb_build_object(
    'tenant_id', v_tenant, 'slug', v_slug, 'vertical', v_vertical,
    'already_existed', false
  );
end $$;

revoke all on function public.signup_tenant() from public, anon;
grant execute on function public.signup_tenant() to authenticated;
