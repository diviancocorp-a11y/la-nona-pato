-- 0060 El alta vuelve a guardar el NOMBRE del negocio, no su slug.
-- NO APLICADA TODAVIA. Ver "COMO APLICARLA" al final.
--
-- ══════════════════ QUE PASO ══════════════════
--
-- Auditando el 29/ago se comparo la funcion DESPLEGADA contra las migraciones
-- del repo y no coinciden. La que corre en produccion hoy es MAS NUEVA que la
-- ultima migracion que la define (0041): tiene el corte de `platform_admins`
-- (0052), `roles` array (0050), `branches` (0041) y `channels` (0039).
--
-- O sea: alguien la aplico por MCP y no escribio el archivo. Este archivo es
-- ese archivo, con un bug corregido.
--
-- ══════════════════ EL BUG ══════════════════
--
-- La version desplegada lee el nombre del negocio de `business_name`:
--
--     v_name := coalesce(nullif(trim(v_meta->>'business_name'), ''), v_slug);
--
-- Pero NADIE escribe ese campo. Lo que manda el cliente es `biz_name`:
--
--     src/services/signup.js:41         biz_name: bizName
--     0016_signup_self_service.sql:82   v_meta->>'biz_name'
--     0019_signup_tenant_idempotente:58 v_meta->>'biz_name'
--     0039_ejes_del_alta.sql:162        v_meta->>'biz_name'
--     0041_sucursales_y_dia_operativo:228 v_meta->>'biz_name'
--
-- `grep -rn business_name` sobre el repo entero: CERO resultados.
--
-- Entonces el coalesce cae SIEMPRE al fallback y el negocio queda registrado
-- con su slug como nombre: "Panaderia del Sur" se guarda como
-- "panaderia-del-sur". Eso es lo que el cliente ve en su catalogo, en el
-- titulo de la pestania y en el preview al compartir por WhatsApp. Y no hay
-- ninguna pantalla donde pueda corregirlo.
--
-- ══════════════════ POR QUE NADIE LO VIO ══════════════════
--
-- Porque todavia no se disparo. Los 7 tenants tienen `name <> slug`, y los dos
-- ultimos (prueba-disco, tienda-nueva) son del 15/ago — anteriores a la 0052
-- del 20/ago, o sea que los creo la version vieja, la que leia bien.
--
-- NINGUNA alta paso todavia por la funcion drifteada. El primer cliente real
-- que se registre es el que lo estrena. Es un bug latente, no uno observado:
-- por eso hay tiempo de arreglarlo bien en vez de a las corridas.
--
-- ══════════════════ EL ARREGLO ══════════════════
--
-- Se leen los DOS campos, `biz_name` primero. No es indecision: si alguna
-- cuenta quedo con metadata en `business_name` (por una prueba manual, por un
-- alta desde otro cliente), sigue funcionando. Un coalesce de mas cuesta nada;
-- perder el nombre de un negocio cuesta un cliente.
--
-- El resto del cuerpo es IDENTICO a lo que ya corre en produccion. Se
-- reproduce entero a proposito: `create or replace` pisa la funcion completa,
-- asi que omitir una linea la borraria. Aplicar esto sin el fix seria un
-- no-op exacto — esa es la propiedad que la hace segura de revisar.

create or replace function public.signup_tenant()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'private', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_meta jsonb;
  v_email text;
  v_slug text;
  v_name text;
  v_vertical text;
  v_modo text;
  v_country text;
  v_currency text;
  v_tz text;
  v_channels text[];
  v_tenant uuid;
  v_existente record;
begin
  if v_uid is null then
    raise exception 'sin_sesion';
  end if;

  -- El staff de Divianco no tiene negocio: se lo dice al front para que lo
  -- mande a /consola en vez de armar `https://undefined.divianco.app`.
  if exists (select 1 from public.platform_admins where user_id = v_uid) then
    return jsonb_build_object('es_staff', true, 'tenant_id', null);
  end if;

  select t.id, t.slug, t.vertical, t.operation_mode, t.country
    into v_existente
    from public.tenants t
    join public.tenant_members m on m.tenant_id = t.id
   where m.user_id = v_uid
   limit 1;

  -- Idempotente (0019): si ya tiene negocio se devuelve el suyo en vez de
  -- fallar. Es lo que hace que recargar /bienvenido o volver a tocar el link
  -- del mail termine bien.
  if found then
    return jsonb_build_object(
      'tenant_id', v_existente.id, 'slug', v_existente.slug,
      'vertical', v_existente.vertical, 'operation_mode', v_existente.operation_mode,
      'country', v_existente.country, 'already_existed', true);
  end if;

  select u.raw_user_meta_data, u.email into v_meta, v_email
    from auth.users u where u.id = v_uid;
  v_meta := coalesce(v_meta, '{}'::jsonb);

  v_slug := lower(trim(v_meta->>'slug'));

  -- ── EL UNICO CAMBIO DE ESTA MIGRACION ──
  -- Antes: coalesce(nullif(trim(v_meta->>'business_name'), ''), v_slug)
  -- `biz_name` es lo que manda signup.js y lo que dicen las 4 migraciones
  -- anteriores. `business_name` se deja como segunda opcion por si alguna
  -- cuenta quedo con el metadata escrito asi.
  v_name := coalesce(
    nullif(trim(v_meta->>'biz_name'), ''),
    nullif(trim(v_meta->>'business_name'), ''),
    v_slug);

  if v_slug is null or v_slug = '' then
    raise exception 'sin_slug';
  end if;

  v_vertical := coalesce(nullif(trim(v_meta->>'vertical'), ''), 'gastro');
  v_modo := coalesce(nullif(trim(v_meta->>'operation_mode'), ''), 'fisico');
  v_country := upper(coalesce(nullif(trim(v_meta->>'country'), ''), 'AR'));

  v_currency := nullif(trim(v_meta->>'currency'), '');
  if v_currency is null then
    v_currency := case v_country
      when 'AR' then 'ARS' when 'UY' then 'UYU' when 'CL' then 'CLP'
      when 'PY' then 'PYG' when 'BO' then 'BOB' when 'PE' then 'PEN'
      when 'CO' then 'COP' when 'MX' then 'MXN' when 'ES' then 'EUR'
      else 'ARS' end;
  end if;

  v_tz := nullif(trim(v_meta->>'timezone'), '');
  if v_tz is null then
    v_tz := case v_country
      when 'AR' then 'America/Argentina/Buenos_Aires'
      when 'UY' then 'America/Montevideo'
      when 'CL' then 'America/Santiago'
      when 'PY' then 'America/Asuncion'
      when 'BO' then 'America/La_Paz'
      when 'PE' then 'America/Lima'
      when 'CO' then 'America/Bogota'
      when 'MX' then 'America/Mexico_City'
      when 'ES' then 'Europe/Madrid'
      else 'America/Argentina/Buenos_Aires' end;
  end if;

  select coalesce(array_agg(c), '{}')::text[] into v_channels
    from jsonb_array_elements_text(
           case when jsonb_typeof(v_meta->'channels') = 'array'
                then v_meta->'channels' else '[]'::jsonb end
         ) as c
   where c in ('walk_in','counter','table_service','appointment',
               'online_booking','delivery','pickup','ecommerce',
               'whatsapp','marketplace');

  if not public.slug_available(v_slug) then
    raise exception 'El slug % no esta disponible', v_slug using errcode = '23505';
  end if;

  insert into public.tenants(
    slug, name, vertical, operation_mode, country, currency, timezone,
    channels, settings)
  values (
    v_slug, v_name, v_vertical, v_modo, v_country, v_currency, v_tz, v_channels,
    jsonb_build_object('logo_color', '#111111', 'catalog_theme', 'ambar', 'prep_time_min', 30))
  returning id into v_tenant;

  insert into public.branches(tenant_id, name, timezone, is_default)
    values (v_tenant, 'Principal', v_tz, true);

  insert into public.tenant_members(tenant_id, user_id, roles)
    values (v_tenant, v_uid, array['owner']);

  insert into public.profiles(id, tenant_id, full_name, email)
    values (v_uid, v_tenant, coalesce(nullif(trim(v_meta->>'full_name'),''), v_name), v_email)
  on conflict (id) do update
    set tenant_id = excluded.tenant_id, email = excluded.email;

  return jsonb_build_object(
    'tenant_id', v_tenant, 'slug', v_slug, 'vertical', v_vertical,
    'operation_mode', v_modo, 'country', v_country, 'already_existed', false);
end $function$;

revoke all on function public.signup_tenant() from public, anon;
grant execute on function public.signup_tenant() to authenticated;

comment on function public.signup_tenant is
  'Alta self-service. Lee el metadata del usuario (biz_name, slug, vertical, '
  'operation_mode, country, currency, timezone, channels) y crea tenant + '
  'branch + member + profile. Idempotente: si la cuenta ya tiene negocio lo '
  'devuelve con already_existed=true. NO asigna plan_id todavia (ver ROADMAP).';

-- ══════════════════ LO QUE ESTA MIGRACION NO HACE ══════════════════
--
-- 1. NO asigna `plan_id` ni `paga_hasta`. Es cierto que el alta deberia
--    hacerlo y que sin eso el proximo tenant nace con plan_id NULL. Pero
--    mezclar el arreglo de un bug con el arranque de la monetizacion hace que
--    un rollback tenga que elegir entre dejar el bug o desarmar el cobro.
--    Van separados, y el orden esta en el ROADMAP del HANDOFF.
--
-- 2. NO arregla el callejon sin salida del slug ocupado. Cuando el slug se
--    ocupa entre el registro y la confirmacion del mail, esto sigue tirando
--    23505 y `Bienvenido.jsx` sigue mostrando una pantalla terminal sin
--    salida. El arreglo es una RPC aparte —`retry_signup_tenant(p_slug)`— y
--    NO un parametro nuevo en esta funcion: agregarle firma crearia un
--    overload (`signup_tenant()` + `signup_tenant(text)`) y PostgREST resuelve
--    overloads por argumentos, lo que suma una superficie de fallo a cambio de
--    nada. Se hace en la 0061.
--
-- ══════════════════ COMO APLICARLA ══════════════════
--
-- Es reversible: `create or replace` de una funcion no toca datos ni schema.
-- Para volver atras, se re-aplica el cuerpo anterior (el unico cambio es el
-- coalesce del nombre).
--
--   1. Aplicar por MCP sobre `wwwzdgprsooyjgkuyoav` (proyecto hermes-platform).
--   2. Verificar que quedo:
--        select pg_get_functiondef('public.signup_tenant'::regproc)
--               like '%biz_name%' as ok;
--   3. Probar el alta de punta a punta en /registro con un mail descartable y
--      confirmar que `tenants.name` guarda el nombre escrito y no el slug.
--   4. Recien ahi actualizar el marcador `_migrations_through` del snapshot
--      (scripts/platform-schema.json) a 0060.
