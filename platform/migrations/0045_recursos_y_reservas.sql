-- 0045 — Recursos reservables, mapa del salon y lista de espera (Etapa 6c).
--
-- LA CORRECCION QUE ORDENA ESTA ETAPA
-- El plan v1 decia "mesa, silla y turno de empleado son el mismo motor". La
-- intuicion era correcta y la conclusion demasiado literal: comparten la
-- MATEMATICA (intervalos, solapamiento, capacidad en una ventana), no la
-- ENTIDAD. Una mesa no pide vacaciones y un empleado no se combina con otro
-- para sentar a seis.
--
-- Asi que aca va el resource booking. El workforce scheduling (turnos,
-- disponibilidad, ausencias) es 6e y va en tablas propias.
--
-- LO QUE YA ESTABA Y NO SE REHACE
-- `appointments` existe desde 0005 y —esto es lo importante— ya tiene un
-- EXCLUDE constraint que impide dos turnos solapados del mismo barbero. Esa
-- es la garantia correcta y en el lugar correcto: en la base, no en el codigo.
-- Se le agrega la equivalente por RECURSO y se reusa todo lo demas.
--
-- POR QUE staff_id PASA A SER NULLABLE
-- Era `not null` porque nacio para turnos de barberia. Una reserva de mesa no
-- tiene barbero. Como al menos uno de los dos tiene que existir —si no seria
-- una reserva de nada— entra un CHECK que lo exige.

-- ─────────────────────────── resources ─────────────────────────────────

create table if not exists public.resources (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  branch_id   uuid not null references public.branches(id) on delete cascade,

  -- El vocabulario lo pone el rubro (registry); el modelo solo distingue lo
  -- que cambia su comportamiento.
  kind        text not null check (kind in ('table', 'chair', 'station', 'room')),
  name        text not null,

  -- El salon se divide en zonas y el cliente las pide por nombre: "afuera",
  -- "en el patio". Sin esto, una reserva no puede respetar la preferencia.
  zone        text,

  capacity    int not null default 1 check (capacity > 0),
  -- Una mesa de 4 a la que sentas 1 persona es una mesa perdida un viernes a
  -- la noche. Estos dos limites son los que dejan que la asignacion sea
  -- automatica sin regalar capacidad.
  min_party   int check (min_party is null or min_party > 0),
  max_party   int check (max_party is null or max_party > 0),
  -- Dos mesas de 4 que se juntan para 8. Es lo que hace que un grupo grande
  -- entre en un salon que "no tiene mesa para 8".
  combinable  boolean not null default false,

  -- El mapa. Nulos mientras el negocio no lo dibuje: la agenda funciona igual
  -- sin plano, y obligar a dibujarlo para tomar una reserva seria absurdo.
  pos_x       numeric,
  pos_y       numeric,
  shape       text check (shape in ('round', 'square', 'rect')),
  width       numeric,
  height      numeric,

  active      boolean not null default true,
  created_at  timestamptz not null default now(),

  constraint resources_party_coherente check (
    min_party is null or max_party is null or max_party >= min_party
  )
);

create index if not exists idx_resources_tenant on public.resources(tenant_id);
create index if not exists idx_resources_branch on public.resources(branch_id, kind);

-- Dos mesas con el mismo nombre en el mismo local es un error de carga que
-- despues hace imposible saber cual es cual en una comanda.
create unique index if not exists resources_nombre_por_sucursal
  on public.resources (branch_id, lower(name)) where active;

alter table public.resources enable row level security;

drop policy if exists resources_select on public.resources;
create policy resources_select on public.resources
  for select using (tenant_id in (select private.current_user_tenants()));

drop policy if exists resources_write on public.resources;
create policy resources_write on public.resources
  for all using (tenant_id in (select private.current_user_tenants()))
       with check (tenant_id in (select private.current_user_tenants()));

comment on table public.resources is
  'Etapa 6c: lo que se ocupa un rato. Mesa (gastro), silla (barber), estacion. '
  'Con pos_x/pos_y es tambien el mapa del salon.';

-- ─────────────────── appointments: reservas de verdad ──────────────────

alter table public.appointments
  add column if not exists branch_id   uuid references public.branches(id),
  add column if not exists resource_id uuid references public.resources(id),
  -- De donde vino: mostrador, telefono, reserva online, WhatsApp. Es lo que
  -- despues contesta "cuanto me trae cada canal".
  add column if not exists source      text,
  -- Cuantos son. Sin esto no se puede elegir mesa ni medir capacidad real.
  add column if not exists party_size  int check (party_size is null or party_size > 0),
  -- La seña se MODELA ahora aunque el cobro llegue con MercadoPago: son
  -- columnas, y dejarlas para despues obligaria a migrar reservas ya cargadas.
  add column if not exists deposit_amount numeric,
  add column if not exists deposit_status text
    check (deposit_status is null or deposit_status in ('pending','paid','refunded','forfeited')),
  add column if not exists cancellation_policy text,
  add column if not exists client_request_id uuid;

-- Un turno de barberia tiene barbero; una reserva de mesa, no.
alter table public.appointments alter column staff_id drop not null;

do $$
begin
  -- Al menos uno: una reserva sin barbero NI recurso no reserva nada.
  if not exists (select 1 from pg_constraint where conname = 'appt_algo_reservado') then
    alter table public.appointments
      add constraint appt_algo_reservado
      check (staff_id is not null or resource_id is not null);
  end if;

  -- El estado deja de ser una fila de calendario y pasa a ser un flujo real.
  -- 'arrived' e 'in_service' son los que permiten saber que esta pasando en el
  -- salon AHORA, que es la mitad del valor de tener mesas.
  alter table public.appointments drop constraint if exists appointments_status_check;
  alter table public.appointments
    add constraint appointments_status_check check (status in (
      'booked', 'confirmed', 'arrived', 'in_service', 'done',
      'no_show', 'cancelled'
    ));

  if not exists (select 1 from pg_constraint where conname = 'appt_no_overlap_resource') then
    -- La misma garantia que ya existia para el barbero, ahora para la mesa.
    -- Vive en la base y no en el codigo por la misma razon: dos reservas
    -- simultaneas desde dos dispositivos no las frena un `if` en el navegador.
    alter table public.appointments
      add constraint appt_no_overlap_resource exclude using gist (
        resource_id with =,
        tstzrange(starts_at, ends_at) with &&
      ) where (status not in ('cancelled', 'no_show'));
  end if;
end $$;

create unique index if not exists appointments_client_request_uniq
  on public.appointments (tenant_id, client_request_id)
  where client_request_id is not null;

create index if not exists idx_appointments_resource_time
  on public.appointments(resource_id, starts_at);
create index if not exists idx_appointments_branch_time
  on public.appointments(branch_id, starts_at);

-- Las reservas que ya existen son de la sucursal por defecto.
update public.appointments a
   set branch_id = b.id
  from public.branches b
 where b.tenant_id = a.tenant_id and b.is_default and a.branch_id is null;

-- Y las nuevas caen solas (mismo trigger de 0044).
drop trigger if exists trg_completar_sucursal on public.appointments;
create trigger trg_completar_sucursal before insert on public.appointments
  for each row execute function public.completar_sucursal();

-- ────────────────────────── lista de espera ────────────────────────────
--
-- "Quiero corte hoy a las 18" y "somos 4 esperando mesa" son el mismo
-- problema: demanda > capacidad AHORA. Una sola tabla para los dos.
--
-- Es ademas la fuente mas limpia de demanda perdida: la gente que se fue sin
-- que la atiendan es un dato que hoy no registra nadie.

create table if not exists public.waitlist_entries (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  branch_id      uuid not null references public.branches(id) on delete cascade,

  customer_name  text,
  customer_phone text,
  party_size     int check (party_size is null or party_size > 0),
  service_id     uuid references public.products(id),
  -- "Quiero con Martin". Preferencia, no requisito.
  staff_id       uuid references public.staff(id) on delete set null,
  zone           text,
  notes          text,

  status         text not null default 'waiting' check (status in (
    'waiting', 'notified', 'seated', 'left', 'expired'
  )),
  -- Lo que se le prometio al cliente cuando llego. Guardarlo permite comparar
  -- despues contra lo que realmente tardo, que es como se calibra la promesa.
  promised_wait_min int,

  created_at     timestamptz not null default now(),
  notified_at    timestamptz,
  resolved_at    timestamptz,
  -- En que termino: se sento, se fue, se vencio. 'left' es demanda perdida.
  resulting_appointment_id uuid references public.appointments(id) on delete set null,

  client_request_id uuid
);

create index if not exists idx_waitlist_branch
  on public.waitlist_entries(branch_id, status, created_at);
create unique index if not exists waitlist_client_request_uniq
  on public.waitlist_entries (tenant_id, client_request_id)
  where client_request_id is not null;

alter table public.waitlist_entries enable row level security;

drop policy if exists waitlist_select on public.waitlist_entries;
create policy waitlist_select on public.waitlist_entries
  for select using (tenant_id in (select private.current_user_tenants()));

drop policy if exists waitlist_write on public.waitlist_entries;
create policy waitlist_write on public.waitlist_entries
  for all using (tenant_id in (select private.current_user_tenants()))
       with check (tenant_id in (select private.current_user_tenants()));

comment on table public.waitlist_entries is
  'Etapa 6c: demanda que no entra ahora. status=left es demanda perdida.';

-- ─────────────────── El algebra: que esta libre ────────────────────────

create or replace function public.resource_available(
  p_resource_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_ignore_appointment_id uuid default null
)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select not exists (
    select 1 from public.appointments a
     where a.resource_id = p_resource_id
       and a.status not in ('cancelled', 'no_show')
       and (p_ignore_appointment_id is null or a.id <> p_ignore_appointment_id)
       and tstzrange(a.starts_at, a.ends_at) && tstzrange(p_starts_at, p_ends_at)
  );
$$;

comment on function public.resource_available is
  'Etapa 6c: si un recurso esta libre en esa ventana. El EXCLUDE de la tabla '
  'es la garantia; esto es para no OFRECER lo que va a rebotar.';

grant execute on function public.resource_available(uuid, timestamptz, timestamptz, uuid)
  to authenticated, anon;

/**
 * Recursos libres para una ventana, ordenados por el que menos capacidad
 * desperdicia. Sentar a 2 personas en la mesa de 8 un viernes es perder la
 * mesa de 8: por eso ordena por capacidad ascendente y no por nombre.
 */
create or replace function public.available_resources(
  p_branch_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_kind text default null,
  p_party_size int default null,
  p_zone text default null
)
returns setof public.resources
language sql
stable
set search_path = public, private, pg_temp
as $$
  select r.* from public.resources r
   where r.branch_id = p_branch_id
     and r.active
     and r.tenant_id in (select private.current_user_tenants())
     and (p_kind is null or r.kind = p_kind)
     and (p_zone is null or r.zone = p_zone)
     and (p_party_size is null or (
           r.capacity >= p_party_size
           and (r.min_party is null or p_party_size >= r.min_party)
           and (r.max_party is null or p_party_size <= r.max_party)))
     and public.resource_available(r.id, p_starts_at, p_ends_at)
   order by r.capacity, r.name;
$$;

grant execute on function public.available_resources(uuid, timestamptz, timestamptz, text, int, text)
  to authenticated;

/**
 * Utilizacion de un dia: horas-recurso disponibles vs vendidas.
 *
 * Es la cuenta que convierte el POS en herramienta de gestion. El dueño no
 * necesita que le digan "vendiste $850.000": necesita saber que le quedaron 12
 * horas productivas sin vender y en que franja.
 *
 * `p_open_hours` es la jornada del local. Cuando exista el horario por
 * sucursal (6e) sale de ahi; hasta entonces se pasa.
 */
create or replace function public.resource_utilization(
  p_branch_id uuid,
  p_day date,
  p_open_hours numeric default 10,
  p_kind text default null
)
returns table (
  recursos int,
  horas_disponibles numeric,
  horas_vendidas numeric,
  utilizacion_pct numeric
)
language sql
stable
set search_path = public, private, pg_temp
as $$
  with rs as (
    select r.id from public.resources r
     where r.branch_id = p_branch_id and r.active
       and (p_kind is null or r.kind = p_kind)
       and r.tenant_id in (select private.current_user_tenants())
  ),
  vendidas as (
    select coalesce(sum(extract(epoch from (a.ends_at - a.starts_at)) / 3600.0), 0) as h
      from public.appointments a
      join rs on rs.id = a.resource_id
     where a.status not in ('cancelled', 'no_show')
       and public.business_date(p_branch_id, a.starts_at) = p_day
  )
  select (select count(*)::int from rs),
         (select count(*) from rs) * p_open_hours,
         (select h from vendidas),
         case when (select count(*) from rs) = 0 or p_open_hours = 0 then 0
              else round(((select h from vendidas)
                          / ((select count(*) from rs) * p_open_hours)) * 100, 1)
         end;
$$;

grant execute on function public.resource_utilization(uuid, date, numeric, text) to authenticated;

comment on function public.resource_utilization is
  'Etapa 6c: horas-recurso disponibles vs vendidas. La cuenta que muestra la '
  'capacidad perdida, que ninguna pantalla de ventas contesta.';
