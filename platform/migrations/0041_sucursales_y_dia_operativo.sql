-- 0041 — Sucursales y dia operativo (Etapa 6b, parte 1).
--
-- POR QUE AHORA Y NO CUANDO HAGA FALTA
-- Hoy ningun tenant tiene dos locales. Pero `branch_id` cambia la FORMA del
-- dato: agregarlo hoy es un alter table sobre tablas casi vacias; agregarlo
-- con dos anios de pedidos, ventas y cierres de caja cargados es reescribir
-- la operacion entera y decidir a mano a que sucursal pertenece cada fila
-- historica. Es el caso de manual del criterio del plan: barato ahora, caro
-- despues.
--
-- LA UI NO CAMBIA
-- Todo tenant nace con UNA sucursal y el panel no muestra selector hasta que
-- exista la segunda. El dueño de un solo local no se entera de que esto
-- existe, que es exactamente lo que tiene que pasar.
--
-- QUE LLEVA branch_id Y QUE NO
--   Lleva:    lo que ocurre EN un lugar — pedidos, ventas, caja, turnos,
--             gastos, pagos.
--   No lleva: lo que es del NEGOCIO — clientes, productos, servicios,
--             empleados. Se relacionan con sucursal, no viven en una. Un
--             cliente que compra en dos locales es un cliente, no dos.
--
-- EL DIA OPERATIVO NO ES EL DIA UTC
-- Hoy `sales.date` es `current_date` (UTC) y el P&L se corta a medianoche UTC.
-- Con un solo pais y horario de comercio nadie lo nota. Se rompe en dos casos
-- que van a pasar:
--   1. Un tenant en Mexico: su dia no es el dia UTC.
--   2. Un bar que cierra a las 5am: lo que vendio a las 3am pertenece a la
--      jornada de ayer, no a la de hoy. Preguntarle al dueño cuanto vendio
--      "el sabado" y contestarle cortando a medianoche es contestarle mal.
-- Por eso el dia operativo se calcula en la zona de la SUCURSAL y con una
-- hora de corte configurable.

-- ─────────────────────────── branches ──────────────────────────────────

create table if not exists public.branches (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  name        text not null,
  address     text,
  phone       text,
  lat         numeric,
  lng         numeric,
  -- Hereda la del tenant al crearse (0039). Cuando difieren, manda esta: el
  -- dia operativo se calcula donde esta el local, no donde esta la empresa.
  timezone    text not null default 'America/Argentina/Buenos_Aires',
  -- Hora local en la que empieza la jornada. 0 = el dia operativo es el dia
  -- calendario. 6 = lo de antes de las 6am pertenece al dia anterior.
  day_cutoff_hour int not null default 0
    check (day_cutoff_hour >= 0 and day_cutoff_hour < 12),
  -- La sucursal a la que va lo que no dice sucursal. Hay exactamente una por
  -- tenant (indice unico abajo): sin eso, un pedido sin branch_id no tendria
  -- donde caer y habria que resolverlo en cada consulta.
  is_default  boolean not null default false,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create index if not exists idx_branches_tenant on public.branches(tenant_id);

-- Una sola sucursal por defecto por negocio.
create unique index if not exists branches_una_default_por_tenant
  on public.branches (tenant_id) where is_default;

alter table public.branches enable row level security;

drop policy if exists branches_select on public.branches;
create policy branches_select on public.branches
  for select using (tenant_id in (select private.current_user_tenants()));

drop policy if exists branches_write on public.branches;
create policy branches_write on public.branches
  for all using (tenant_id in (select private.current_user_tenants()))
       with check (tenant_id in (select private.current_user_tenants()));

comment on table public.branches is
  'Etapa 6b: los locales de un negocio. Todo tenant tiene al menos uno.';

-- ──────────────── Una sucursal para cada negocio que ya existe ─────────

insert into public.branches (tenant_id, name, timezone, is_default)
select t.id,
       -- Sin inventarle nombre: hasta que tenga dos locales, "Principal" es
       -- mas honesto que repetir el nombre del negocio.
       'Principal',
       t.timezone,
       true
  from public.tenants t
 where not exists (
   select 1 from public.branches b where b.tenant_id = t.id and b.is_default
 );

-- ─────────────────────── branch_id donde ocurre ────────────────────────
--
-- Nullable a proposito: las filas historicas no tienen sucursal y no se les
-- puede inventar una con certeza. El backfill de abajo las manda a la default,
-- que para un negocio de un solo local ES la respuesta correcta.

alter table public.orders        add column if not exists branch_id uuid references public.branches(id);
alter table public.sales         add column if not exists branch_id uuid references public.branches(id);
alter table public.cash_sessions add column if not exists branch_id uuid references public.branches(id);
alter table public.appointments  add column if not exists branch_id uuid references public.branches(id);
alter table public.expenses      add column if not exists branch_id uuid references public.branches(id);
alter table public.payments      add column if not exists branch_id uuid references public.branches(id);
alter table public.staff         add column if not exists branch_id uuid references public.branches(id);

create index if not exists idx_orders_branch        on public.orders(branch_id);
create index if not exists idx_sales_branch         on public.sales(branch_id);
create index if not exists idx_cash_sessions_branch on public.cash_sessions(branch_id);
create index if not exists idx_appointments_branch  on public.appointments(branch_id);
create index if not exists idx_expenses_branch      on public.expenses(branch_id);

-- Backfill: todo lo que existe es de la unica sucursal que hay.
do $$
declare t text;
begin
  foreach t in array array['orders','sales','cash_sessions','appointments','expenses','payments','staff']
  loop
    execute format(
      'update public.%I x set branch_id = b.id
         from public.branches b
        where b.tenant_id = x.tenant_id and b.is_default and x.branch_id is null', t);
  end loop;
end $$;

-- ───────────────────────── dia operativo ───────────────────────────────

create or replace function public.business_date(
  p_branch_id uuid,
  p_ts timestamptz default now()
)
returns date
language sql
stable
set search_path = public, pg_temp
as $$
  -- El instante se lleva a la hora local del local, se le restan las horas de
  -- corte y recien ahi se toma la fecha. Un bar con corte 6: las 03:00 del
  -- domingo dan sabado, que es la jornada a la que pertenece esa venta.
  select ((p_ts at time zone b.timezone) - make_interval(hours => b.day_cutoff_hour))::date
    from public.branches b
   where b.id = p_branch_id;
$$;

comment on function public.business_date is
  'Etapa 6b: la fecha de la JORNADA de un local, en su zona y con su hora de '
  'corte. No es current_date: una venta de las 3am puede pertenecer a ayer.';

grant execute on function public.business_date(uuid, timestamptz) to authenticated, anon;

-- Version por tenant, para lo que todavia no tiene sucursal a mano. Usa la
-- default; si el negocio tiene varias, la respuesta correcta exige saber en
-- cual paso, y para eso esta la funcion de arriba.
create or replace function public.business_date_tenant(
  p_tenant_id uuid,
  p_ts timestamptz default now()
)
returns date
language sql
stable
set search_path = public, pg_temp
as $$
  select public.business_date(b.id, p_ts)
    from public.branches b
   where b.tenant_id = p_tenant_id and b.is_default;
$$;

grant execute on function public.business_date_tenant(uuid, timestamptz) to authenticated, anon;

-- ──────────────── La sucursal implicita en el alta ─────────────────────
--
-- signup_tenant crea el negocio; desde ahora tambien su primer local. Sin
-- esto, un tenant nuevo nace sin sucursal y todo lo que escriba queda con
-- branch_id null — el unico estado que este modelo no deberia permitir.
--
-- Se mantiene TODO lo demas de 0039 y 0019: los ejes del alta y la
-- idempotencia (devuelve el tenant existente en vez de fallar).

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

  -- El primer local, con la zona del negocio.
  insert into public.branches(tenant_id, name, timezone, is_default)
    values (v_tenant, 'Principal', v_tz, true);

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
