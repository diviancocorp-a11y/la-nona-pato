-- 0052 Planes, precios y suscripcion. Aplicada via MCP 20/ago/2026.
--
-- EL AGUJERO: `tenants.plan` existia desde el principio y NO HACIA NADA. Los 7
-- negocios decian 'free' y tenian el producto entero. Sin esto no hay como
-- cobrar, y sin cobrar no hay producto: hay software regalado.
--
-- ── QUE VA EN LA BASE Y QUE VA EN EL CODIGO ──
-- Es la misma division que 6f hizo con los roles, por la misma razon:
--
--   PRECIOS y PROMOS -> esta tabla. Cambian con la inflacion, los cambia Ricky
--   desde la consola, y no son logica: son numeros.
--
--   QUE INCLUYE cada plan -> `src/modules/planes.js`. Es una decision de
--   producto, se versiona con el codigo, se revisa en un diff y se prueba con
--   tests. Si viviera en la base, un UPDATE mal hecho le abre el ERP entero al
--   plan mas barato y no queda rastro de quien lo hizo.
--
-- ── POR QUE LOS PRECIOS SON PUBLICOS ──
-- `plans` se lee sin sesion: la pagina de precios los muestra. Lo que esta
-- cerrado es la ESCRITURA, y no a los duenios de negocio sino a todos salvo el
-- staff de Divianco.

/* ─────────────── 1. Quien es staff de Divianco ─────────────── */

-- No alcanza con `owner`: un duenio manda en SU negocio, no en la plataforma.
-- Sin esta separacion, cualquiera que se registre podria editar los precios de
-- todos.
create table if not exists public.platform_admins (
  user_id uuid primary key,
  email text,
  created_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;
-- Sin policies: se administra con service role. Quien puede darse a si mismo
-- el permiso de editar precios no puede salir de una pantalla.

create or replace function private.es_staff_divianco()
returns boolean
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select exists (
    select 1 from public.platform_admins where user_id = auth.uid()
  )
$$;

revoke all on function private.es_staff_divianco() from public, anon;
grant execute on function private.es_staff_divianco() to authenticated;

/* ─────────────────── 2. Los planes y sus precios ─────────────────── */

create table if not exists public.plans (
  id text primary key,

  nombre text not null,
  descripcion text,

  -- En centavos NO: los importes en ARS son enteros grandes y los centavos no
  -- existen en la practica. numeric evita el redondeo del float.
  precio_mensual numeric(12,2) not null default 0,
  -- Lo que paga por mes quien contrata el anual. Es un precio y no un
  -- porcentaje porque asi se muestra en la pagina, y calcularlo cada vez
  -- invita a que la pagina y el cobro digan cosas distintas.
  precio_anual_por_mes numeric(12,2),

  -- La promo de alta, por plan. Digital lleva solo el mes gratis; Local suma
  -- 3 meses al 50%.
  meses_gratis int not null default 0 check (meses_gratis >= 0),
  meses_descuento int not null default 0 check (meses_descuento >= 0),
  descuento_pct numeric(5,2) not null default 0
    check (descuento_pct >= 0 and descuento_pct <= 100),

  -- Un plan puede existir y todavia no venderse. Es como se deja preparado el
  -- plan Total sin ofrecerlo antes de tener la facturacion electronica.
  disponible boolean not null default true,
  -- Orden en la pagina de precios. Sin esto el orden lo decide el azar.
  orden int not null default 0,

  actualizado_at timestamptz not null default now()
);

alter table public.plans enable row level security;

drop policy if exists plans_select on public.plans;
create policy plans_select on public.plans
  for select to anon, authenticated using (true);

drop policy if exists plans_write on public.plans;
create policy plans_write on public.plans
  for all to authenticated
  using (private.es_staff_divianco())
  with check (private.es_staff_divianco());

comment on table public.plans is
  'Precios y promos, editables desde la consola de Divianco. QUE INCLUYE cada '
  'plan NO esta aca: vive en src/modules/planes.js, versionado con el codigo.';

/* ── Los cuatro planes. Los precios salen del analisis de mercado del
      20/ago (Fudo con modulos $65.900, Maxirest $86.000, Ganapan $25.000). ── */

insert into public.plans
  (id, nombre, descripcion, precio_mensual, precio_anual_por_mes,
   meses_gratis, meses_descuento, descuento_pct, disponible, orden)
values
  ('digital', 'Digital',
   'Para vender a distancia: catálogo, pedidos y clientes.',
   29000, 23200, 1, 0, 0, true, 1),

  ('local', 'Local',
   'Todo lo de Digital más el salón: mesas, caja, comandas y equipo.',
   59000, 47200, 1, 3, 50, true, 2),

  ('cadena', 'Cadena',
   'Varias sucursales, roles por local y comparativas entre ellos.',
   99000, 79200, 1, 0, 0, true, 3),

  -- Se deja MODELADO y NO disponible: prometer facturación electrónica antes
  -- de tenerla es la forma mas rapida de perder al primer cliente en blanco.
  ('total', 'Total',
   'Todo lo de Cadena más facturación electrónica y soporte 24 h con IA.',
   0, 0, 1, 0, 0, false, 4)
on conflict (id) do nothing;

/* ─────────────── 3. La suscripcion de cada negocio ─────────────── */

alter table public.tenants
  add column if not exists plan_id text references public.plans(id),
  add column if not exists ciclo text not null default 'mensual'
    check (ciclo in ('mensual', 'anual')),
  -- Hasta cuando esta paga. Es la fecha que decide si se suspende.
  add column if not exists paga_hasta timestamptz,
  add column if not exists suspendido_at timestamptz,
  -- Como paga: define si se factura y si lleva descuento.
  add column if not exists medio_de_cobro text
    check (medio_de_cobro is null or medio_de_cobro in
      ('mercadopago', 'transferencia', 'efectivo'));

-- El estado de impago. `dormant` ya existia y es OTRA cosa: el slug que se
-- libera porque nunca cargaron nada. Un negocio suspendido cargo, trabajo y
-- debe: no se le toca el slug ni los datos.
alter table public.tenants drop constraint if exists tenants_status_check;
alter table public.tenants add constraint tenants_status_check
  check (status in ('trial', 'active', 'dormant', 'suspendido'));

-- Los 7 negocios de hoy quedan en el plan que corresponde a como operan.
update public.tenants
   set plan_id = case
     when operation_mode = 'virtual' then 'digital'
     else 'local'
   end
 where plan_id is null;

create index if not exists idx_tenants_por_cobrar
  on public.tenants(paga_hasta)
  where status in ('active', 'trial');

comment on column public.tenants.paga_hasta is
  'Hasta cuando esta paga la suscripcion. Pasados 15 dias de esta fecha el '
  'negocio pasa a `suspendido`: puede LEER y EXPORTAR, no operar.';

comment on column public.tenants.suspendido_at is
  'Cuando se suspendio por falta de pago. Se limpia al regularizar.';

/* ─────────── 4. La suspension: leer si, operar no ─────────── */

/**
 * Si este negocio puede OPERAR (cargar, cobrar, mover stock).
 *
 * Los 15 dias de gracia no son generosidad: un negocio que se atrasa una
 * semana no dejo de ser cliente, y cortarle la operacion por eso es perderlo
 * para siempre por una demora que iba a resolverse sola.
 */
create or replace function public.tenant_puede_operar(p_tenant uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select coalesce(
    (select t.status <> 'suspendido'
       from public.tenants t where t.id = p_tenant),
    false)
$$;

grant execute on function public.tenant_puede_operar(uuid) to authenticated, anon;

/**
 * Marca como suspendidos a los que pasaron los 15 dias. Lo corre pg_cron, con
 * el mismo criterio que el barrido de slugs dormidos (0017).
 *
 * NO toca `plan_id` ni borra nada: suspender es apagar el interruptor, no
 * desalojar. Al pagar, `paga_hasta` se corre y vuelve a estar activo.
 */
create or replace function public.suspender_impagos()
returns int
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare v_n int;
begin
  update public.tenants
     set status = 'suspendido',
         suspendido_at = now()
   where status = 'active'
     and paga_hasta is not null
     and paga_hasta < now() - interval '15 days'
     and suspendido_at is null;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke all on function public.suspender_impagos() from public, anon, authenticated;

/* ─────── 5. El staff ve y cobra; el duenio no se cambia el plan solo ─────── */

-- `tenants` solo tenia SELECT para miembros, y ningun UPDATE: nadie podia
-- tocar un negocio desde el cliente. Eso hay que abrirlo lo justo.
--
-- El staff VE todos los negocios (es la lista de clientes de Dico) y puede
-- moverles la suscripcion. El duenio NO puede: si pudiera, se pondria el plan
-- Cadena solo y no habria nada que cobrar. Cambiar de plan pasa por el cobro,
-- no por un update.
drop policy if exists tenants_select on public.tenants;
create policy tenants_select on public.tenants
  for select using (
    id in (select private.current_user_tenants())
    or private.es_staff_divianco()
  );

drop policy if exists tenants_update_staff on public.tenants;
create policy tenants_update_staff on public.tenants
  for update to authenticated
  using (private.es_staff_divianco())
  with check (private.es_staff_divianco());

/* ─────────── 6. El equipo de Divianco se gestiona desde la consola ─────────── */

-- El staff se ve entre si: la consola muestra quien tiene acceso.
drop policy if exists platform_admins_select on public.platform_admins;
create policy platform_admins_select on public.platform_admins
  for select to authenticated using (private.es_staff_divianco());

-- La ESCRITURA no va por policy sino por estas dos funciones: hace falta
-- resolver el email contra auth.users (que el cliente no ve) y sobre todo
-- impedir que la plataforma se quede sin nadie que pueda administrarla.

create or replace function public.sumar_staff(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_uid uuid;
  v_email text := lower(trim(p_email));
begin
  if not private.es_staff_divianco() then
    raise exception 'no_sos_staff';
  end if;

  select public.find_user_id_by_email(v_email) into v_uid;
  if v_uid is null then
    -- No se crea la cuenta: que se registre en divianco.app y despues se lo
    -- suma. Crear cuentas desde aca seria poder fabricar accesos a la consola.
    return jsonb_build_object('ok', false, 'error', 'sin_cuenta');
  end if;

  insert into public.platform_admins (user_id, email)
  values (v_uid, v_email)
  on conflict (user_id) do update set email = excluded.email;

  return jsonb_build_object('ok', true, 'user_id', v_uid, 'email', v_email);
end $$;

create or replace function public.quitar_staff(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare v_quedan int;
begin
  if not private.es_staff_divianco() then
    raise exception 'no_sos_staff';
  end if;

  -- Nadie se saca a si mismo: es la forma mas facil de quedarse afuera de la
  -- consola sin nadie que te vuelva a dar acceso.
  if p_user_id = auth.uid() then
    return jsonb_build_object('ok', false, 'error', 'no_te_saques_a_vos');
  end if;

  select count(*) into v_quedan from public.platform_admins where user_id <> p_user_id;
  if v_quedan = 0 then
    return jsonb_build_object('ok', false, 'error', 'ultimo_staff');
  end if;

  delete from public.platform_admins where user_id = p_user_id;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.sumar_staff(text) from public, anon;
revoke all on function public.quitar_staff(uuid) from public, anon;
grant execute on function public.sumar_staff(text) to authenticated;
grant execute on function public.quitar_staff(uuid) to authenticated;

/* ────── 7. A la consola solo entra el correo de la empresa ────── */

-- POR QUE UNA TABLA Y NO UNA CONSTANTE: el dia que Divianco sume un dominio (o
-- cambie de proveedor de correo) no puede depender de un deploy, y menos si lo
-- que esta en juego es que alguien no pueda entrar a cobrar.
--
-- POR QUE NO SE VALIDA EN EL LOGIN: las cuentas fundadoras son anteriores al
-- dominio de la empresa. Validar al entrar dejaria afuera al duenio, que es
-- justamente quien tendria que arreglarlo. La regla gobierna QUIEN PUEDE SER
-- SUMADO desde la consola; quien ya figura en `platform_admins` entra.
create table if not exists public.staff_dominios (
  dominio text primary key,
  creado_at timestamptz not null default now()
);

alter table public.staff_dominios enable row level security;

drop policy if exists staff_dominios_select on public.staff_dominios;
create policy staff_dominios_select on public.staff_dominios
  for select to authenticated using (private.es_staff_divianco());

insert into public.staff_dominios (dominio) values ('grupodivianco.com')
on conflict (dominio) do nothing;

comment on table public.staff_dominios is
  'Dominios de correo habilitados para sumar staff desde la consola. No se '
  'valida en el login: las cuentas fundadoras son anteriores al dominio.';

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
  if not private.es_staff_divianco() then
    raise exception 'no_sos_staff';
  end if;

  -- El dominio se saca de lo que hay DESPUES de la ULTIMA arroba: partir por
  -- la primera dejaria pasar 'grupodivianco.com@gmail.com', que es un correo
  -- de gmail disfrazado de corporativo.
  v_dominio := lower(split_part(v_email, '@', array_length(string_to_array(v_email, '@'), 1)));
  if v_dominio = '' or v_dominio not in (select dominio from public.staff_dominios) then
    return jsonb_build_object('ok', false, 'error', 'dominio_no_permitido');
  end if;

  select public.find_user_id_by_email(v_email) into v_uid;
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'sin_cuenta');
  end if;

  insert into public.platform_admins (user_id, email)
  values (v_uid, v_email)
  on conflict (user_id) do update set email = excluded.email;

  return jsonb_build_object('ok', true, 'user_id', v_uid, 'email', v_email);
end $$;

revoke all on function public.sumar_staff(text) from public, anon;
grant execute on function public.sumar_staff(text) to authenticated;
