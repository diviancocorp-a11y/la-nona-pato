-- 0039 — Los ejes del alta (Etapa 6a).
--
-- Hasta hoy un tenant declaraba UNA sola cosa sobre si mismo: `vertical`.
-- Con eso alcanzaba mientras todos los negocios eran dark kitchens argentinas.
-- No alcanza para un salon con mesas, ni para un local en otro pais.
--
-- Se agregan tres dimensiones mas, y la navegacion del panel pasa a salir de
-- la combinacion:
--
--     visible = modulos(vertical, operation_mode, channels) ∩ permisos(rol)
--
-- POR QUE MODO Y CANALES SON DOS COSAS
-- `operation_mode` dice si hay salon. `channels` dice por donde entra la
-- demanda, y son varios a la vez: una barberia es fisica y recibe turnos,
-- gente sin turno y reservas online. Meter las dos ideas en un solo campo
-- obligaria a inventar valores como 'fisico_con_delivery_y_reservas'.
--
-- `orders.channel` ya existia: el edificio ya etiqueta por donde entro cada
-- pedido. Esto declara a nivel de negocio cuales estan habilitados.
--
-- POR QUE LA MONEDA NO SE DERIVA DEL PAIS
-- El pais la propone, no la determina. Hay rubros (indumentaria importada)
-- que costean en dolares y venden en pesos.
--
-- POR QUE HAY TIMEZONE ACA Y NO EN branches
-- `branches` llega en 6b. Hasta entonces el negocio necesita una zona para
-- calcular su dia operativo; cuando existan sucursales, la de la sucursal
-- manda y esta queda como valor por defecto del negocio.
--
-- FACTURACION: el pais es libre, el adaptador fiscal no. Se puede elegir
-- cualquier pais de la lista, pero solo AR tiene integracion (ARCA). El resto
-- queda sin modulo fiscal hasta que exista su adapter. Prometer multi-pais
-- sin eso es vender un sistema que no factura en ningun lado.

-- ─────────────────────────── Columnas nuevas ───────────────────────────

alter table public.tenants
  add column if not exists operation_mode text not null default 'fisico',
  add column if not exists country        text not null default 'AR',
  add column if not exists currency       text not null default 'ARS',
  add column if not exists timezone       text not null default 'America/Argentina/Buenos_Aires',
  add column if not exists channels       text[] not null default '{}';

-- ─────────────────────────── Constraints ───────────────────────────────

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tenants_operation_mode_check') then
    alter table public.tenants
      add constraint tenants_operation_mode_check
      check (operation_mode in ('fisico', 'virtual', 'hibrido'));
  end if;

  -- La lista de paises se valida aca y ademas en el registry del front. Es
  -- la misma decision que se tomo con `vertical`: el CHECK es la ultima
  -- palabra, porque el front se puede saltear.
  if not exists (select 1 from pg_constraint where conname = 'tenants_country_check') then
    alter table public.tenants
      add constraint tenants_country_check
      check (country in ('AR', 'UY', 'CL', 'PY', 'BO', 'PE', 'CO', 'MX', 'ES'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'tenants_currency_check') then
    alter table public.tenants
      add constraint tenants_currency_check
      check (currency ~ '^[A-Z]{3}$');
  end if;

  -- `<@` es "contenido en": cada elemento de channels tiene que estar en la
  -- lista. Un array vacio pasa, y es correcto: un negocio recien creado
  -- todavia no eligio por donde vende.
  if not exists (select 1 from pg_constraint where conname = 'tenants_channels_check') then
    alter table public.tenants
      add constraint tenants_channels_check
      check (channels <@ array[
        'walk_in', 'counter', 'table_service', 'appointment',
        'online_booking', 'delivery', 'pickup', 'ecommerce',
        'whatsapp', 'marketplace'
      ]::text[]);
  end if;
end $$;

-- ─────────────────────── Backfill de los que ya estan ───────────────────
--
-- El default es 'fisico' porque es lo que va a elegir la mayoria de las altas
-- nuevas. Los tenants que ya existen NO son eso, asi que se corrigen a mano en
-- vez de heredar un default que les queda mal.

-- Las 3 gastro portadas son dark kitchens: no tienen salon.
update public.tenants
   set operation_mode = 'virtual',
       channels = array['delivery', 'pickup', 'whatsapp']::text[]
 where slug in ('cochi', 'mala-miga', 'la-nona-pato')
   and channels = '{}';

update public.tenants
   set channels = array['appointment', 'walk_in']::text[]
 where vertical = 'barber' and channels = '{}';

update public.tenants
   set channels = array['counter', 'ecommerce']::text[]
 where vertical = 'retail' and channels = '{}';

-- ─────────────────────────── signup_tenant ─────────────────────────────
--
-- Sigue siendo idempotente (0019): si la cuenta ya tiene negocio devuelve el
-- suyo con already_existed=true en vez de fallar. Lo unico que cambia es que
-- ahora lee los tres ejes nuevos del user_metadata.
--
-- Los datos viajan en user_metadata y no en localStorage porque el mail de
-- confirmacion se puede abrir en otro dispositivo.

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
  v_modo      text;
  v_country   text;
  v_currency  text;
  v_tz        text;
  v_channels  text[];
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

  -- Los ejes nuevos caen en un default usable si el metadata no los trae: una
  -- cuenta creada antes de este deploy, o un alta que no completo el paso.
  -- Un negocio sin modo es peor que un negocio con el modo mas comun.
  v_modo := lower(nullif(trim(v_meta->>'operation_mode'), ''));
  if v_modo is null or v_modo not in ('fisico','virtual','hibrido') then
    v_modo := 'fisico';
  end if;

  v_country := upper(nullif(trim(v_meta->>'country'), ''));
  if v_country is null or v_country not in
     ('AR','UY','CL','PY','BO','PE','CO','MX','ES') then
    v_country := 'AR';
  end if;

  v_currency := upper(nullif(trim(v_meta->>'currency'), ''));
  if v_currency is null or v_currency !~ '^[A-Z]{3}$' then
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

  -- Los canales que no esten en la lista blanca se descartan en silencio en
  -- vez de tirar el alta: el CHECK de la tabla no perdona, y perder un canal
  -- mal escrito es mejor que perder el negocio entero.
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
    channels, settings
  )
  values (
    v_slug, v_name, v_vertical, v_modo, v_country, v_currency, v_tz,
    v_channels,
    jsonb_build_object(
      'logo_color', '#111111',
      'catalog_theme', 'ambar',
      'prep_time_min', 30
    )
  )
  returning id into v_tenant;

  insert into public.tenant_members(tenant_id, user_id, role)
    values (v_tenant, v_uid, 'owner');

  insert into public.profiles(id, tenant_id, full_name, email)
    values (v_uid, v_tenant, coalesce(nullif(trim(v_meta->>'full_name'),''), v_name), v_email)
  on conflict (id) do update
    set tenant_id = excluded.tenant_id, email = excluded.email;

  return jsonb_build_object(
    'tenant_id', v_tenant, 'slug', v_slug, 'vertical', v_vertical,
    'operation_mode', v_modo, 'country', v_country,
    'already_existed', false
  );
end $$;

revoke all on function public.signup_tenant() from public, anon;
grant execute on function public.signup_tenant() to authenticated;

comment on column public.tenants.operation_mode is
  '6a: fisico | virtual | hibrido. Decide si existen salon, mesas y caja con turno.';
comment on column public.tenants.channels is
  '6a: por donde entra la demanda. Varios a la vez. Ver orders.channel.';
comment on column public.tenants.timezone is
  '6a: zona por defecto del negocio. En 6b la de la sucursal tiene prioridad.';
