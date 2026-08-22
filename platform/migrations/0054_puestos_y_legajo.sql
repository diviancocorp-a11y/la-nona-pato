-- 0054 Puestos en la consola y legajo del empleado de Dico.
--
-- ── DOS EJES QUE NO SON EL MISMO ──
-- `rol` (owner | staff) ya existia y contesta UNA sola pregunta: quien reparte
-- el acceso a la consola. Sigue habiendo un solo owner (0053).
--
-- `puesto` es lo nuevo y contesta otra: que hace esa persona adentro. Cuatro:
-- administrador, ventas, soporte, marketing.
--
-- Mezclarlos habria sido tentador y caro. Si el puesto decidiera tambien quien
-- reparte accesos, cada administrador podria sumar administradores y el acceso
-- volveria a ser transitivo — que es exactamente lo que 0053 vino a cerrar.
--
-- ── QUE PUEDE CADA PUESTO VIVE EN EL CODIGO ──
-- `src/modules/rolesDeConsola.js`. Misma division que 6f hizo con los roles del
-- negocio y 0052 con los planes: el DATO (quien tiene que puesto) va a la base,
-- la POLITICA (que puede un puesto) va al codigo, se versiona y se revisa en un
-- diff. Un update mal hecho no puede darle los precios a marketing.
--
-- Lo que si baja a RLS es lo que mueve plata: precios y suscripciones. Esconder
-- una pestania no protege una tabla.
--
-- ── EL LEGAJO ──
-- Datos personales de verdad: documento con foto, domicilio, CBU. Es lo mas
-- sensible que guarda el edificio, y por eso NO lo ve ni siquiera un
-- administrador: solo la persona y el duenio. Un administrador administra la
-- plataforma, no el legajo de sus companieros.
--
-- Las fotos van a un bucket PRIVADO, con la misma convencion de carpeta que
-- 0034 (<user_id>/<archivo>) — esa primera carpeta la leen las policies, no es
-- decorativa.

/* ═══════════════════════ 1. PUESTOS ═══════════════════════ */

alter table public.platform_admins
  add column if not exists puesto text not null default 'soporte'
    check (puesto in ('administrador', 'ventas', 'soporte', 'marketing'));

comment on column public.platform_admins.puesto is
  'Que hace en la consola. Distinto de `rol`, que dice quien reparte accesos. '
  'Lo que habilita cada puesto vive en src/modules/rolesDeConsola.js.';

-- El duenio administra: es el unico que ya estaba y el default de la columna
-- ('soporte') lo dejaria sin poder tocar precios en su propia plataforma.
update public.platform_admins set puesto = 'administrador' where rol = 'owner';

create or replace function private.puesto_en_consola()
returns text
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select puesto from public.platform_admins where user_id = auth.uid()
$$;

revoke all on function private.puesto_en_consola() from public, anon;
grant execute on function private.puesto_en_consola() to authenticated;

/* ═══════════════ 2. LO QUE MUEVE PLATA, EN RLS ═══════════════ */

-- Barrer antes de crear: una policy vieja con otro nombre SOBREVIVE, y las
-- permisivas se combinan con OR — la vieja anularia la restriccion nueva. Ya
-- paso con audit_log el 20/ago.
drop policy if exists plans_write on public.plans;
drop policy if exists plans_update on public.plans;
drop policy if exists tenants_update_staff on public.tenants;

-- Los precios los toca el administrador. Marketing los lee (`plans_select` es
-- publica) y no los cambia: la pagina de precios es suya, la lista de precios no.
create policy plans_write on public.plans
  for all to authenticated
  using (private.es_staff_divianco() and private.puesto_en_consola() = 'administrador')
  with check (private.es_staff_divianco() and private.puesto_en_consola() = 'administrador');

-- La suscripcion de un cliente la mueve quien vende y quien administra.
-- Soporte la VE (por `tenants_select`, que no cambia) para poder atender, y no
-- la edita: "me lo dejaste sin cobrar" no puede salir de una pantalla de ayuda.
create policy tenants_update_staff on public.tenants
  for update to authenticated
  using (
    private.es_staff_divianco()
    and private.puesto_en_consola() in ('administrador', 'ventas')
  )
  with check (
    private.es_staff_divianco()
    and private.puesto_en_consola() in ('administrador', 'ventas')
  );

/* ═══════════════════════ 3. EL LEGAJO ═══════════════════════ */

create table if not exists public.staff_legajo (
  user_id uuid primary key references auth.users(id) on delete cascade,

  -- Identidad
  nombre_completo text,
  fecha_nacimiento date,
  tipo_documento text check (tipo_documento in ('dni', 'le', 'lc', 'pasaporte')),
  numero_documento text,
  cuil text,
  -- Paths dentro del bucket privado, NO urls: una url firmada vence, y guardar
  -- una vencida es guardar basura que parece un dato.
  doc_frente_path text,
  doc_dorso_path text,

  -- Domicilio
  calle text,
  altura text,
  piso_depto text,
  localidad text,
  provincia text,
  codigo_postal text,

  -- Contacto
  telefono text,
  emergencia_nombre text,
  emergencia_telefono text,

  -- Cobro. El CBU es un dato de pago: quien lo puede cambiar puede desviar un
  -- sueldo, y por eso el legajo no lo edita nadie mas que su duenio.
  banco text,
  cbu text,
  alias_bancario text,
  titular_cuenta text,

  fecha_ingreso date,

  -- Cuando quedo completo. Es el flag que la consola mira para dejar de pedirlo;
  -- se calcula del lado del servidor con `legajo_completo()` y no con la
  -- palabra del cliente.
  completado_at timestamptz,
  creado_at timestamptz not null default now(),
  actualizado_at timestamptz not null default now()
);

comment on table public.staff_legajo is
  'Legajo del empleado de Dico. Datos personales sensibles: lo ve la persona y '
  'el dueño de la plataforma, nadie mas — un administrador administra la '
  'plataforma, no el legajo de sus compañeros.';

alter table public.staff_legajo enable row level security;

drop policy if exists staff_legajo_propio on public.staff_legajo;
create policy staff_legajo_propio on public.staff_legajo
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists staff_legajo_duenio on public.staff_legajo;
create policy staff_legajo_duenio on public.staff_legajo
  for select to authenticated
  using (private.es_owner_divianco());

/* Que se considera completo. Vive en SQL ademas de en el codigo porque es lo
   que decide `completado_at`, y ese flag es el que abre la consola. */
create or replace function public.legajo_completo(l public.staff_legajo)
returns boolean
language sql
immutable
as $$
  select
    coalesce(nullif(trim(l.nombre_completo), ''), null) is not null
    and l.fecha_nacimiento is not null
    and coalesce(nullif(trim(l.tipo_documento), ''), null) is not null
    and coalesce(nullif(trim(l.numero_documento), ''), null) is not null
    and coalesce(nullif(trim(l.cuil), ''), null) is not null
    and coalesce(nullif(trim(l.doc_frente_path), ''), null) is not null
    and coalesce(nullif(trim(l.doc_dorso_path), ''), null) is not null
    and coalesce(nullif(trim(l.calle), ''), null) is not null
    and coalesce(nullif(trim(l.altura), ''), null) is not null
    and coalesce(nullif(trim(l.localidad), ''), null) is not null
    and coalesce(nullif(trim(l.provincia), ''), null) is not null
    and coalesce(nullif(trim(l.codigo_postal), ''), null) is not null
    and coalesce(nullif(trim(l.telefono), ''), null) is not null
    and coalesce(nullif(trim(l.emergencia_nombre), ''), null) is not null
    and coalesce(nullif(trim(l.emergencia_telefono), ''), null) is not null
    and coalesce(nullif(trim(l.cbu), ''), null) is not null
    and coalesce(nullif(trim(l.titular_cuenta), ''), null) is not null
$$;

create or replace function public.marcar_legajo_completo()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.actualizado_at := now();
  -- Se sella una sola vez y no se borra: "cuando lo completo" es un hecho, y
  -- si alguien despues vacia un campo no deja de haberlo completado aquel dia.
  if new.completado_at is null and public.legajo_completo(new) then
    new.completado_at := now();
  end if;
  return new;
end $$;

drop trigger if exists tg_marcar_legajo_completo on public.staff_legajo;
create trigger tg_marcar_legajo_completo
  before insert or update on public.staff_legajo
  for each row execute function public.marcar_legajo_completo();

-- Es un trigger: nadie deberia poder invocarlo como RPC. Mismo cierre que
-- pidio el linter de seguridad el 20/ago.
revoke execute on function public.marcar_legajo_completo() from public, anon, authenticated;

/* ═══════════════ 4. LAS FOTOS DEL DOCUMENTO ═══════════════ */

-- PRIVADO, al reves que `tenant-images`. Aquel es publico porque lo mira un
-- comprador sin sesion; una foto de un DNI no la mira nadie sin sesion.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'staff-legajo',
  'staff-legajo',
  false,
  5242880,  -- 5 MB
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists staff_legajo_lee_lo_suyo on storage.objects;
create policy staff_legajo_lee_lo_suyo on storage.objects
  for select to authenticated
  using (
    bucket_id = 'staff-legajo'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or private.es_owner_divianco()
    )
  );

drop policy if exists staff_legajo_sube_lo_suyo on storage.objects;
create policy staff_legajo_sube_lo_suyo on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'staff-legajo'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists staff_legajo_pisa_lo_suyo on storage.objects;
create policy staff_legajo_pisa_lo_suyo on storage.objects
  for update to authenticated
  using (
    bucket_id = 'staff-legajo'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists staff_legajo_borra_lo_suyo on storage.objects;
create policy staff_legajo_borra_lo_suyo on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'staff-legajo'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

/* ═══════════════ 5. EL ALTA GUARDA EL PUESTO ═══════════════ */

create or replace function public.sumar_staff(p_email text, p_puesto text default 'soporte')
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_uid uuid;
  v_email text := lower(trim(p_email));
  v_dominio text;
  v_puesto text := lower(trim(coalesce(p_puesto, 'soporte')));
begin
  if not private.es_owner_divianco() then
    raise exception 'solo_el_duenio';
  end if;

  if v_puesto not in ('administrador', 'ventas', 'soporte', 'marketing') then
    return jsonb_build_object('ok', false, 'error', 'puesto_invalido');
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

  -- El puesto SI se pisa al reinvitar (es un cambio de puesto legitimo), pero
  -- el `rol` no: eso convertiria al duenio en staff y dejaria la plataforma sin
  -- nadie que reparta accesos.
  insert into public.platform_admins (user_id, email, rol, puesto)
  values (v_uid, v_email, 'staff', v_puesto)
  on conflict (user_id) do update
    set email = excluded.email, puesto = excluded.puesto;

  return jsonb_build_object('ok', true, 'user_id', v_uid, 'email', v_email,
    'puesto', v_puesto);
end $$;

revoke all on function public.sumar_staff(text, text) from public, anon;
grant execute on function public.sumar_staff(text, text) to authenticated;

/* Cambiar el puesto de alguien que ya esta, sin reinvitarlo. */
create or replace function public.cambiar_puesto(p_user_id uuid, p_puesto text)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare v_puesto text := lower(trim(coalesce(p_puesto, '')));
begin
  if not private.es_owner_divianco() then
    raise exception 'solo_el_duenio';
  end if;
  if v_puesto not in ('administrador', 'ventas', 'soporte', 'marketing') then
    return jsonb_build_object('ok', false, 'error', 'puesto_invalido');
  end if;

  update public.platform_admins set puesto = v_puesto where user_id = p_user_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_esta');
  end if;
  return jsonb_build_object('ok', true, 'puesto', v_puesto);
end $$;

revoke all on function public.cambiar_puesto(uuid, text) from public, anon;
grant execute on function public.cambiar_puesto(uuid, text) to authenticated;
