-- 0043 — Audit log (Etapa 0).
--
-- No es una feature: es lo que hace defendible tener un contador externo,
-- varias sucursales y siete roles. Sin esto, "quien anulo esta venta" no tiene
-- respuesta, y el dia que un dueño pregunte por que su caja no cierra la unica
-- salida es adivinar.
--
-- QUE SE AUDITA Y QUE NO
-- Solo lo que mueve plata, stock o permisos. Auditar todo multiplicaria la
-- base por cada visita al catalogo sin agregar una sola respuesta util.
--
-- POR QUE UN TRIGGER GENERICO Y NO UNO POR TABLA
-- Uno por tabla se desincroniza: alguien agrega una tabla sensible y se olvida
-- del suyo. Este es uno solo y sumar una tabla es una linea en el array.
--
-- POR QUE SE GUARDA EL DIFF Y NO LA FILA
-- Una fila de settings tiene 50 columnas. Guardarla entera en cada toque hace
-- el log ilegible justo cuando hay que leerlo. Se guarda
-- {columna: {antes, despues}} y solo de lo que cambio.

create table if not exists public.audit_log (
  id          bigserial primary key,
  tenant_id   uuid references public.tenants(id) on delete cascade,
  actor_id    uuid,
  action      text not null check (action in ('insert','update','delete')),
  entity      text not null,
  entity_id   uuid,
  cambios     jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists idx_audit_tenant on public.audit_log(tenant_id, created_at desc);
create index if not exists idx_audit_entity on public.audit_log(entity, entity_id);

alter table public.audit_log enable row level security;

-- Lo ve el negocio; no lo escribe nadie desde la UI (lo escribe el trigger,
-- que es definer). Un log que el auditado puede editar no sirve de nada.
drop policy if exists audit_select on public.audit_log;
create policy audit_select on public.audit_log
  for select using (tenant_id in (select private.current_user_tenants()));

create or replace function public.auditar()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid;
  v_id     uuid;
  v_cambios jsonb;
  v_antes  jsonb;
  v_despues jsonb;
  k text;
begin
  if tg_op = 'DELETE' then
    v_antes := to_jsonb(old); v_despues := null;
  elsif tg_op = 'INSERT' then
    v_antes := null; v_despues := to_jsonb(new);
  else
    v_antes := to_jsonb(old); v_despues := to_jsonb(new);
  end if;

  v_tenant := coalesce((v_despues->>'tenant_id')::uuid, (v_antes->>'tenant_id')::uuid);
  begin
    v_id := coalesce((v_despues->>'id')::uuid, (v_antes->>'id')::uuid);
  exception when others then
    v_id := null;   -- tablas con PK compuesta o no-uuid (settings, tenant_members)
  end;

  if tg_op = 'UPDATE' then
    v_cambios := '{}'::jsonb;
    for k in select jsonb_object_keys(v_despues) loop
      if v_antes->k is distinct from v_despues->k then
        v_cambios := v_cambios || jsonb_build_object(
          k, jsonb_build_object('antes', v_antes->k, 'despues', v_despues->k));
      end if;
    end loop;
    -- Un update que no cambio nada no es un evento.
    if v_cambios = '{}'::jsonb then
      return null;
    end if;
  else
    v_cambios := coalesce(v_despues, v_antes);
  end if;

  insert into public.audit_log(tenant_id, actor_id, action, entity, entity_id, cambios)
    values (v_tenant, auth.uid(), lower(tg_op), tg_table_name, v_id, v_cambios);

  return null;   -- after trigger
end $$;

do $$
declare t text;
begin
  -- Plata, stock y permisos. Nada mas.
  foreach t in array array[
    'expenses', 'ingredients', 'staff', 'tenant_members', 'settings',
    'cash_sessions', 'payments', 'branches', 'product_variants'
  ]
  loop
    execute format('drop trigger if exists trg_auditar on public.%I', t);
    execute format(
      'create trigger trg_auditar after insert or update or delete on public.%I
         for each row execute function public.auditar()', t);
  end loop;

  -- orders solo en UPDATE: el alta ya se ve en el panel, lo que interesa es
  -- quien le cambio el estado o el total despues.
  drop trigger if exists trg_auditar on public.orders;
  create trigger trg_auditar after update on public.orders
    for each row execute function public.auditar();
end $$;

comment on table public.audit_log is
  'Etapa 0: quien cambio que y cuando, en lo que mueve plata, stock o permisos.';
