-- 0058 Primer valor, la capa de organizacion y el registro de la consola.
-- Aplicada via MCP el 24/ago/2026. Fase 0 + Fase 1 del plan v1.1.
--
-- ── QUE PROBLEMA RESUELVE ──
-- El edificio no podia contestar la unica pregunta que importa hoy: ¿alguien
-- esta usando esto de verdad? Habia `first_order_at` (primer pedido CREADO) y
-- `last_activity_at`, pero nada que distinguiera "probo" de "le sirvio".
--
-- La primera consulta despues de aplicarla lo dijo: 7 negocios, 3 con un pedido
-- creado, CERO con uno cobrado. Ese numero reordeno el plan entero.
--
-- ── LO QUE NO SE HIZO, Y POR QUE ──
-- No hay tabla de cobros de suscripcion. Con cero clientes seria una tabla
-- vacia por tiempo indefinido. Y ademas `payments` YA EXISTE con otro
-- significado —los pagos del COMPRADOR al negocio—, asi que reusar ese nombre
-- habria roto el checkout. Se hace cuando haya una venta concreta sobre la
-- mesa, y es cuestion de dias.

/* ═══════════ 1. PRIMER VALOR ═══════════ */

-- `first_order_at` marca el primer pedido CREADO: alguien probo. Esto marca el
-- primero COBRADO: alguien puso plata. Confundirlos hace que un negocio que
-- probo una vez y se fue figure como arrancado.
--
-- EL RUBRO NO CAMBIA COMO SE DETECTA, solo como se llama. Un turno de barberia
-- ya es un `order` con `resource_id`: la arquitectura unifico las operaciones y
-- esto se apoya en eso en vez de pelearlo. El nombre por rubro vive en
-- `src/modules/panelDeHoy.js`.
alter table public.tenants
  add column if not exists first_value_at timestamptz;

comment on column public.tenants.first_value_at is
  'Primer pedido COBRADO. Distinto de first_order_at (primer pedido creado). '
  'El rubro solo cambia como se lo nombra en pantalla.';

update public.tenants t
set first_value_at = sub.primero
from (
  select o.tenant_id, min(coalesce(o.paid_at, o.created_at)) as primero
  from public.orders o
  where o.paid_at is not null or o.payment_status = 'approved'
  group by o.tenant_id
) sub
where sub.tenant_id = t.id and t.first_value_at is null;

create or replace function public.marcar_primer_valor()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (new.paid_at is not null or new.payment_status = 'approved') then
    update public.tenants
       set first_value_at = coalesce(first_value_at, coalesce(new.paid_at, now()))
     where id = new.tenant_id and first_value_at is null;
  end if;
  return new;
end $$;

revoke execute on function public.marcar_primer_valor() from public, anon, authenticated;

drop trigger if exists trg_primer_valor on public.orders;
create trigger trg_primer_valor
  after insert or update of paid_at, payment_status on public.orders
  for each row execute function public.marcar_primer_valor();

/* ═══════════ 2. LA CAPA DE ARRIBA DEL NEGOCIO ═══════════ */

-- Un revendedor, un contador o un socio que administra varios negocios. Hoy no
-- existe ninguno y la tabla va a estar vacia. Se crea igual porque lo caro es
-- la FORMA: agregarla despues es una migracion con clientes adentro, y hoy son
-- diez lineas.
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  created_at timestamptz not null default now()
);

alter table public.organizations enable row level security;

drop policy if exists organizations_staff on public.organizations;
create policy organizations_staff on public.organizations
  for all to authenticated
  using (private.es_staff_divianco())
  with check (private.es_staff_divianco());

alter table public.tenants
  add column if not exists organization_id uuid
    references public.organizations(id) on delete set null;

comment on column public.tenants.organization_id is
  'Nulo en todos hoy. Existe para que sumar un revendedor o un contador que '
  'administra varios negocios no sea una migracion con clientes adentro.';

/* ═══════════ 3. EL REGISTRO DE LA CONSOLA ═══════════ */

-- NO es `audit_log` (0043). Aquel audita lo que pasa DENTRO de un negocio y lo
-- mira el negocio. Este audita lo que el equipo de Divianco le hace a un
-- negocio, y lo mira Divianco. Dos audiencias, dos tablas.
--
-- POR TRIGGER Y NO DESDE EL CLIENTE: un log que escribe la pantalla es un log
-- que el auditado puede no escribir.

create table if not exists public.consola_log (
  id          bigserial primary key,
  actor_id    uuid,
  actor_email text,
  accion      text not null check (accion in ('insert','update','delete')),
  entidad     text not null,
  entidad_id  text,
  tenant_id   uuid references public.tenants(id) on delete set null,
  cambios     jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists idx_consola_log_fecha on public.consola_log(created_at desc);
create index if not exists idx_consola_log_tenant on public.consola_log(tenant_id, created_at desc);

-- La retencion NO se fija en el esquema. Se define segun los requisitos legales
-- y contractuales que apliquen, y esos cambian; por eso `purgar_consola_log`
-- recibe el plazo como parametro en vez de tenerlo escrito adentro. Un numero
-- copiado de un articulo no puede convertirse en requisito de arquitectura.
comment on table public.consola_log is
  'Lo que el equipo de Dico hace desde la consola. La politica de retencion se '
  'define segun los requisitos legales y contractuales que apliquen: se purga '
  'con purgar_consola_log(dias).';

alter table public.consola_log enable row level security;

-- Solo el duenio lo lee. Nadie lo escribe desde la UI: lo escribe el trigger.
drop policy if exists consola_log_select on public.consola_log;
create policy consola_log_select on public.consola_log
  for select to authenticated
  using (private.es_owner_divianco());

create or replace function public.auditar_consola()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cambios jsonb;
  v_tenant uuid;
  v_id text;
  v_email text;
  v_antes jsonb;
  v_despues jsonb;
begin
  -- Sin sesion no hay a quien atribuirlo: es el trigger corriendo por una edge
  -- function con service role, y eso ya se audita del lado que llama.
  if auth.uid() is null then
    return coalesce(new, old);
  end if;

  if tg_op = 'UPDATE' then
    v_antes := to_jsonb(old);
    v_despues := to_jsonb(new);
    -- Solo lo que cambio: guardar la fila entera hace el log ilegible justo
    -- cuando hay que leerlo (mismo criterio que 0043).
    select jsonb_object_agg(k, jsonb_build_object('antes', v_antes -> k, 'despues', v_despues -> k))
      into v_cambios
      from jsonb_object_keys(v_despues) k
     where v_antes -> k is distinct from v_despues -> k;
    if v_cambios is null then return new; end if;
  elsif tg_op = 'INSERT' then
    v_cambios := to_jsonb(new);
  else
    v_cambios := to_jsonb(old);
  end if;

  v_id := coalesce((to_jsonb(coalesce(new, old)) ->> 'id'),
                   (to_jsonb(coalesce(new, old)) ->> 'user_id'));

  if tg_table_name = 'tenants' then
    v_tenant := (coalesce(new, old)).id;
  else
    v_tenant := null;
  end if;

  select email into v_email from public.platform_admins where user_id = auth.uid();

  insert into public.consola_log
    (actor_id, actor_email, accion, entidad, entidad_id, tenant_id, cambios)
  values (auth.uid(), v_email, lower(tg_op), tg_table_name, v_id, v_tenant, v_cambios);

  return coalesce(new, old);
end $$;

revoke execute on function public.auditar_consola() from public, anon, authenticated;

-- Lo que mueve plata o permisos, y nada mas. Auditar todo multiplica la base
-- sin agregar una sola respuesta util.
drop trigger if exists trg_consola_tenants on public.tenants;
create trigger trg_consola_tenants
  after update on public.tenants
  for each row execute function public.auditar_consola();

drop trigger if exists trg_consola_plans on public.plans;
create trigger trg_consola_plans
  after insert or update or delete on public.plans
  for each row execute function public.auditar_consola();

drop trigger if exists trg_consola_admins on public.platform_admins;
create trigger trg_consola_admins
  after insert or update or delete on public.platform_admins
  for each row execute function public.auditar_consola();

create or replace function public.purgar_consola_log(p_dias int)
returns int
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare v_borradas int;
begin
  if not private.es_owner_divianco() then
    raise exception 'solo_el_duenio';
  end if;
  delete from public.consola_log where created_at < now() - make_interval(days => p_dias);
  get diagnostics v_borradas = row_count;
  return v_borradas;
end $$;

revoke all on function public.purgar_consola_log(int) from public, anon;
grant execute on function public.purgar_consola_log(int) to authenticated;
