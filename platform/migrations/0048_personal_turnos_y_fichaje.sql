-- 0048 — Personal: turnos, disponibilidad, ausencias y fichaje (Etapa 6e).
--
-- ESTE ES EL OTRO LADO DEL SCHEDULING
-- 6c hizo el resource booking (mesa, silla). Esto es el workforce scheduling.
-- Comparten la MATEMATICA de intervalos —y de hecho comparten el mismo patron
-- de EXCLUDE constraint— pero no la entidad: una mesa no pide vacaciones y un
-- empleado no se combina con otro para sentar a seis.
--
-- LA BIOMETRIA NO ENTRA ACA. NUNCA.
-- El fichaje va con WebAuthn: el telefono verifica al dueño del dispositivo
-- como quiera —huella, cara, PIN— y manda una FIRMA CRIPTOGRAFICA. Lo que se
-- guarda es una clave PUBLICA y un contador. La huella no sale del telefono y
-- este servidor no la ve nunca.
--
-- Eso no es un detalle tecnico: en Argentina el dato biometrico es dato
-- sensible (Ley 25.326), y ademas una PWA no puede leer una huella aunque
-- quisiera. WebAuthn da exactamente lo que se busca —que nadie fiche por
-- otro— sin guardar nada de eso.
--
-- La geocerca y la selfie quedan como SENAL, no como requisito: son columnas
-- que se llenan si el negocio las activa. Acumular ubicacion e imagen de cada
-- empleado todos los dias para resolver "que no fiche un companero" es
-- desproporcionado cuando la passkey ya lo resuelve.

-- ───────────────────────── Costo del personal ──────────────────────────

alter table public.staff
  -- Cuanto cuesta una hora de esta persona. Es lo que convierte "trabajo 8
  -- horas" en "el martes a la tarde me costo mas de lo que vendio".
  add column if not exists hourly_cost numeric,
  add column if not exists job text,          -- mozo, cocina, barbero, cajero
  add column if not exists hired_at date;

-- ──────────────────────── Turnos programados ───────────────────────────

create table if not exists public.staff_shifts (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  branch_id   uuid not null references public.branches(id) on delete cascade,
  staff_id    uuid not null references public.staff(id) on delete cascade,

  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  job         text,
  notes       text,

  status      text not null default 'scheduled' check (status in (
    'scheduled', 'published', 'swap_requested', 'cancelled'
  )),
  -- Un turno no publicado NO lo ve el empleado. Sin esto, el encargado
  -- armando la semana genera una notificacion por cada arrastre y nadie
  -- confia en lo que ve hasta que le confirman a mano.
  published_at timestamptz,

  -- Quien pidio el cambio y quien lo tomo. El cambio de turno entre companeros
  -- es la operacion mas comun de un equipo y la que peor se resuelve por
  -- WhatsApp: sin registro, nadie sabe quien tenia que venir.
  swap_requested_by uuid references public.staff(id) on delete set null,
  swap_taken_by     uuid references public.staff(id) on delete set null,

  created_at  timestamptz not null default now(),

  constraint shift_time_valid check (ends_at > starts_at),
  -- Mismo patron que appointments (0005): una persona no puede estar en dos
  -- turnos a la vez, y eso lo garantiza la BASE. Dos encargados armando la
  -- semana en paralelo no los frena un `if` en el navegador.
  constraint shift_no_overlap exclude using gist (
    staff_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (status <> 'cancelled')
);

create index if not exists idx_shifts_branch_time on public.staff_shifts(branch_id, starts_at);
create index if not exists idx_shifts_staff_time on public.staff_shifts(staff_id, starts_at);

alter table public.staff_shifts enable row level security;

drop policy if exists shifts_select on public.staff_shifts;
create policy shifts_select on public.staff_shifts
  for select using (tenant_id in (select private.current_user_tenants()));

drop policy if exists shifts_write on public.staff_shifts;
create policy shifts_write on public.staff_shifts
  for all using (tenant_id in (select private.current_user_tenants()))
       with check (tenant_id in (select private.current_user_tenants()));

comment on table public.staff_shifts is
  '6e: turnos programados. Sin published_at el empleado no lo ve.';

-- ─────────────────── Disponibilidad que declara la persona ─────────────
--
-- La declara el EMPLEADO, no el encargado. Es la diferencia entre armar la
-- semana adivinando y armarla sabiendo quien puede: sin esto, el encargado
-- programa y despues recibe seis mensajes de "ese dia no puedo".

create table if not exists public.staff_availability (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  staff_id    uuid not null references public.staff(id) on delete cascade,

  -- 0 = domingo, igual que EXTRACT(dow) de Postgres, para no traducir.
  weekday     int not null check (weekday between 0 and 6),
  starts_time time not null,
  ends_time   time not null,
  -- `preferred` no es lo mismo que `available`: sirve para repartir los turnos
  -- buenos con algun criterio en vez de por orden de reclamo.
  kind        text not null default 'available'
    check (kind in ('available', 'preferred', 'unavailable')),

  created_at  timestamptz not null default now(),
  constraint availability_time_valid check (ends_time > starts_time)
);

create index if not exists idx_availability_staff on public.staff_availability(staff_id, weekday);

alter table public.staff_availability enable row level security;

drop policy if exists availability_select on public.staff_availability;
create policy availability_select on public.staff_availability
  for select using (tenant_id in (select private.current_user_tenants()));

drop policy if exists availability_write on public.staff_availability;
create policy availability_write on public.staff_availability
  for all using (tenant_id in (select private.current_user_tenants()))
       with check (tenant_id in (select private.current_user_tenants()));

-- ────────────────────────────── Ausencias ──────────────────────────────

create table if not exists public.staff_absences (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  staff_id    uuid not null references public.staff(id) on delete cascade,

  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  kind        text not null default 'other' check (kind in (
    'vacation', 'sick', 'study', 'unpaid', 'other'
  )),
  status      text not null default 'requested' check (status in (
    'requested', 'approved', 'rejected'
  )),
  reason      text,
  decided_by  uuid,
  decided_at  timestamptz,
  created_at  timestamptz not null default now(),

  constraint absence_time_valid check (ends_at > starts_at)
);

create index if not exists idx_absences_staff on public.staff_absences(staff_id, starts_at);

alter table public.staff_absences enable row level security;

drop policy if exists absences_select on public.staff_absences;
create policy absences_select on public.staff_absences
  for select using (tenant_id in (select private.current_user_tenants()));

drop policy if exists absences_write on public.staff_absences;
create policy absences_write on public.staff_absences
  for all using (tenant_id in (select private.current_user_tenants()))
       with check (tenant_id in (select private.current_user_tenants()));

-- ─────────────── Passkeys: como se verifica quien ficha ────────────────
--
-- ACA NO HAY BIOMETRIA. `public_key` es una clave publica; el telefono se
-- queda con la privada y con la huella. `sign_count` es el contador anti-replay
-- del estandar: si llega una firma con un contador menor o igual al ultimo, la
-- credencial fue clonada.

create table if not exists public.staff_credentials (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  staff_id      uuid not null references public.staff(id) on delete cascade,

  credential_id text not null unique,
  public_key    text not null,
  sign_count    bigint not null default 0,
  device_label  text,

  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);

create index if not exists idx_credentials_staff on public.staff_credentials(staff_id);

alter table public.staff_credentials enable row level security;

-- Se ve para saber QUIEN tiene passkey registrada y en que dispositivo. La
-- clave publica no es secreta —por eso se llama publica— pero igual no la
-- escribe nadie desde la UI: el alta va por la funcion de registro.
drop policy if exists credentials_select on public.staff_credentials;
create policy credentials_select on public.staff_credentials
  for select using (tenant_id in (select private.current_user_tenants()));

comment on table public.staff_credentials is
  '6e: passkeys del fichaje. NO guarda biometria: la huella no sale del telefono.';

-- ──────────────────────────── El fichaje ───────────────────────────────

create table if not exists public.time_entries (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  branch_id   uuid not null references public.branches(id) on delete cascade,
  staff_id    uuid not null references public.staff(id) on delete cascade,
  shift_id    uuid references public.staff_shifts(id) on delete set null,

  clock_in_at  timestamptz not null default now(),
  clock_out_at timestamptz,
  -- El dia operativo del fichaje. Un turno que arranca 20:00 y termina 4:00 es
  -- UNA jornada; con la fecha de entrada partida por medianoche daria dos.
  business_day date,

  -- Como se verifico. `manual` es el encargado cargandolo a mano y por eso
  -- queda marcado distinto: es el unico que no prueba nada.
  method      text not null default 'manual' check (method in (
    'webauthn', 'pin', 'manual'
  )),
  verified    boolean not null default false,

  -- Senales opcionales. Se llenan solo si el negocio las activa.
  in_lat numeric, in_lng numeric,
  out_lat numeric, out_lng numeric,

  -- Toda correccion queda a la vista. Un fichaje editado sin rastro convierte
  -- el registro de horas en la palabra del encargado.
  adjusted_by     uuid,
  adjusted_at     timestamptz,
  adjusted_reason text,

  client_request_id uuid,
  created_at  timestamptz not null default now(),

  -- `>=` y no `>`. Se detecto probando: con el estricto, una salida que cae en
  -- el mismo instante que la entrada falla y el empleado queda con el fichaje
  -- ABIERTO para siempre, sin forma de cerrarlo desde la app. Y una jornada
  -- abierta sigue sumando horas hasta que alguien la corrija, o sea que infla
  -- el costo laboral en silencio. Registrar 0 minutos es mucho menos malo.
  constraint entry_time_valid check (clock_out_at is null or clock_out_at >= clock_in_at)
);

create index if not exists idx_entries_staff on public.time_entries(staff_id, clock_in_at desc);
create index if not exists idx_entries_branch_day on public.time_entries(branch_id, business_day);

-- UN fichaje abierto por persona. Sin esto, tocar "entrar" dos veces deja dos
-- entradas abiertas y las horas del dia se cuentan doble.
create unique index if not exists time_entries_uno_abierto_por_persona
  on public.time_entries (staff_id) where clock_out_at is null;

create unique index if not exists time_entries_client_request_uniq
  on public.time_entries (tenant_id, client_request_id)
  where client_request_id is not null;

alter table public.time_entries enable row level security;

drop policy if exists entries_select on public.time_entries;
create policy entries_select on public.time_entries
  for select using (tenant_id in (select private.current_user_tenants()));

drop policy if exists entries_write on public.time_entries;
create policy entries_write on public.time_entries
  for all using (tenant_id in (select private.current_user_tenants()))
       with check (tenant_id in (select private.current_user_tenants()));

comment on table public.time_entries is
  '6e: horas trabajadas. Un solo fichaje abierto por persona; las correcciones quedan marcadas.';

-- Trigger de sucursal por defecto, igual que el resto de lo operativo (0044).
drop trigger if exists trg_completar_sucursal on public.time_entries;
create trigger trg_completar_sucursal before insert on public.time_entries
  for each row execute function public.completar_sucursal();

drop trigger if exists trg_completar_sucursal on public.staff_shifts;
create trigger trg_completar_sucursal before insert on public.staff_shifts
  for each row execute function public.completar_sucursal();

-- Auditoria de lo que toca plata y horas.
do $$
declare t text;
begin
  foreach t in array array['staff_shifts', 'time_entries', 'staff_absences'] loop
    execute format('drop trigger if exists trg_auditar on public.%I', t);
    execute format(
      'create trigger trg_auditar after insert or update or delete on public.%I
         for each row execute function public.auditar()', t);
  end loop;
end $$;

-- ──────────────────────── Entrar y salir ───────────────────────────────

/**
 * Fichar la entrada.
 *
 * Devuelve el fichaje abierto si ya hay uno: tocar "entrar" de nuevo no es un
 * error del empleado, es que ya entro. Mostrarle un error lo empujaria a
 * pedirle al encargado que lo cargue a mano, que es el camino sin verificar.
 */
create or replace function public.clock_in(
  p_tenant_id uuid,
  p_staff_id uuid,
  p_branch_id uuid default null,
  p_method text default 'manual',
  p_verified boolean default false,
  p_lat numeric default null,
  p_lng numeric default null,
  p_client_request_id uuid default null
)
returns public.time_entries
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $$
declare
  v_e public.time_entries;
  v_branch uuid;
  v_shift uuid;
begin
  if p_tenant_id not in (select private.current_user_tenants()) then
    raise exception 'no_sos_miembro';
  end if;

  select * into v_e from public.time_entries
   where staff_id = p_staff_id and clock_out_at is null;
  if found then
    return v_e;
  end if;

  v_branch := coalesce(p_branch_id,
    (select b.id from public.branches b where b.tenant_id = p_tenant_id and b.is_default));

  -- El turno que le tocaba, si hay alguno cerca. Sirve para comparar despues
  -- lo programado contra lo trabajado: llegadas tarde y horas de mas.
  select s.id into v_shift from public.staff_shifts s
   where s.staff_id = p_staff_id
     and s.status <> 'cancelled'
     and now() between s.starts_at - interval '2 hours' and s.ends_at
   order by s.starts_at limit 1;

  insert into public.time_entries (
    tenant_id, branch_id, staff_id, shift_id, method, verified,
    in_lat, in_lng, business_day, client_request_id
  )
  values (
    p_tenant_id, v_branch, p_staff_id, v_shift, p_method, coalesce(p_verified, false),
    p_lat, p_lng, public.business_date(v_branch), p_client_request_id
  )
  returning * into v_e;

  return v_e;
end $$;

revoke all on function public.clock_in(uuid, uuid, uuid, text, boolean, numeric, numeric, uuid)
  from public, anon;
grant execute on function public.clock_in(uuid, uuid, uuid, text, boolean, numeric, numeric, uuid)
  to authenticated;

/** Fichar la salida. Cierra el fichaje abierto de esa persona. */
create or replace function public.clock_out(
  p_tenant_id uuid,
  p_staff_id uuid,
  p_lat numeric default null,
  p_lng numeric default null
)
returns public.time_entries
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $$
declare v_e public.time_entries;
begin
  if p_tenant_id not in (select private.current_user_tenants()) then
    raise exception 'no_sos_miembro';
  end if;

  update public.time_entries
     set clock_out_at = now(), out_lat = p_lat, out_lng = p_lng
   where staff_id = p_staff_id and clock_out_at is null
     and tenant_id = p_tenant_id
  returning * into v_e;

  if not found then
    raise exception 'no_hay_fichaje_abierto';
  end if;
  return v_e;
end $$;

revoke all on function public.clock_out(uuid, uuid, numeric, numeric) from public, anon;
grant execute on function public.clock_out(uuid, uuid, numeric, numeric) to authenticated;

-- ─────────────── Costo laboral contra lo que se vendio ─────────────────

/**
 * La cuenta que 6e existe para poder hacer.
 *
 * "Trabajaron 8 horas" no es informacion. "El martes de 14 a 17 el personal
 * costo mas de lo que vendio" si lo es, y es la unica forma de decidir un
 * horario sin corazonadas.
 *
 * Las horas salen de lo FICHADO, no de lo programado: lo programado es una
 * intencion y lo fichado es lo que paso.
 */
create or replace function public.labor_cost_vs_sales(
  p_branch_id uuid,
  p_day date
)
returns table (
  horas_trabajadas numeric,
  costo_laboral numeric,
  ventas numeric,
  costo_sobre_ventas_pct numeric
)
language sql
stable
set search_path = public, private, pg_temp
as $$
  with horas as (
    select coalesce(sum(
             extract(epoch from (coalesce(e.clock_out_at, now()) - e.clock_in_at)) / 3600.0
           ), 0) as h,
           coalesce(sum(
             extract(epoch from (coalesce(e.clock_out_at, now()) - e.clock_in_at)) / 3600.0
             * coalesce(s.hourly_cost, 0)
           ), 0) as costo
      from public.time_entries e
      join public.staff s on s.id = e.staff_id
     where e.branch_id = p_branch_id
       and e.business_day = p_day
       and e.tenant_id in (select private.current_user_tenants())
  ),
  vend as (
    select coalesce(sum(sa.total), 0) as v
      from public.sales sa
     where sa.branch_id = p_branch_id
       and public.business_date(p_branch_id, sa.created_at) = p_day
       and sa.tenant_id in (select private.current_user_tenants())
  )
  select round((select h from horas)::numeric, 2),
         round((select costo from horas)::numeric, 2),
         (select v from vend),
         case when (select v from vend) = 0 then null
              else round(((select costo from horas) / (select v from vend)) * 100, 1)
         end;
$$;

grant execute on function public.labor_cost_vs_sales(uuid, date) to authenticated;

comment on function public.labor_cost_vs_sales is
  '6e: costo del personal sobre venta, por dia operativo. Las horas salen de lo '
  'fichado, no de lo programado: lo programado es una intencion.';
