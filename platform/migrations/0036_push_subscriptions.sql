-- 0036_push_subscriptions.sql — Notificaciones push (Etapa 6)
--
-- POR QUE: hoy un negocio del edificio no se entera de que entro un pedido.
-- `submit-order` ya invoca `send-push` y falla en silencio porque la funcion
-- no existe. Una cocina que no mira la pantalla pierde el pedido — de todas
-- las piezas de periferia, es la unica que cuesta plata cada dia.
--
-- ── UNA sola VAPID para toda la plataforma ──
-- En el legacy cada negocio tenia su par de claves porque cada uno era una
-- app aparte. Aca no: VAPID identifica al SERVIDOR que manda, no al negocio,
-- y todos los tenants se sirven desde el mismo origen. Un par por tenant
-- obligaria ademas a generar claves en cada alta self-service.
-- Lo que separa a un negocio de otro es `tenant_id` en la suscripcion.
--
-- ── La tabla NO se toca directo ──
-- Igual que en el legacy (Sprint 1): el que se suscribe puede ser un invitado
-- sin sesion, asi que no hay `auth.uid()` con el que escribir una policy
-- razonable. Se entra por RPCs SECURITY DEFINER que operan sobre UN endpoint
-- —el del browser que llama— y nada mas. Sin esto, con la anon key (que es
-- publica, viaja en el bundle) cualquiera borraba las suscripciones de todos.
--
-- ── Mejora sobre el legacy: no cualquiera se suscribe como admin ──
-- El RPC viejo aceptaba `role` sin validar. Suscribirse como 'admin' es
-- pedir que te lleguen los avisos de pedido nuevo, que traen nombre del
-- cliente y monto. Aca, para registrarse como admin hay que SER miembro de
-- ese tenant; si no, la suscripcion se degrada a 'customer' en vez de
-- fallar (el que se suscribe no eligio el rol: lo eligio la pantalla).

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,

  -- El endpoint identifica al browser. Unico global y no por tenant: es una
  -- URL que emite el navegador y no se repite entre negocios.
  endpoint text not null unique,
  keys_p256dh text not null,
  keys_auth text not null,

  role text not null default 'customer' check (role in ('customer', 'admin')),
  user_id uuid references auth.users(id) on delete cascade,
  phone text,
  user_agent text,

  created_at timestamptz not null default now()
);

create index if not exists push_subs_tenant_role_idx
  on public.push_subscriptions (tenant_id, role);

alter table public.push_subscriptions enable row level security;
-- Sin policies: RLS niega por defecto y TODO pasa por los RPCs de abajo.
-- El service role (send-push) las saltea, que es su trabajo.
revoke all on public.push_subscriptions from anon, authenticated;

/* ═════════════════════ ALTA / BAJA ═══════════════════════════ */

create or replace function public.upsert_push_subscription(
  p_tenant_slug text,
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default null,
  p_user_id uuid default null,
  p_phone text default null,
  p_role text default 'customer'
)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_role text := case when p_role = 'admin' then 'admin' else 'customer' end;
  v_tenant uuid;
begin
  if nullif(btrim(coalesce(p_endpoint, '')), '') is null then
    raise exception 'faltan_datos';
  end if;
  -- Por slug y no por uuid: el front ya sabe el slug (esta en el host), asi
  -- que resolverlo aca ahorra un RPC publico nuevo solo para traducir.
  select id into v_tenant from public.tenants
   where slug = lower(btrim(coalesce(p_tenant_slug, '')));
  if v_tenant is null then
    raise exception 'negocio_inexistente';
  end if;

  -- Pedir avisos de admin sin ser del negocio degrada a customer: esos push
  -- llevan nombre del cliente y monto del pedido.
  if v_role = 'admin' and not exists (
    select 1 from public.tenant_members m
     where m.tenant_id = v_tenant and m.user_id = auth.uid()
  ) then
    v_role := 'customer';
  end if;

  insert into public.push_subscriptions as s
    (tenant_id, endpoint, keys_p256dh, keys_auth, user_agent, user_id, phone, role)
  values
    (v_tenant, p_endpoint, coalesce(p_p256dh, ''), coalesce(p_auth, ''),
     p_user_agent, p_user_id, nullif(btrim(coalesce(p_phone, '')), ''), v_role)
  on conflict (endpoint) do update
    set tenant_id   = excluded.tenant_id,
        keys_p256dh = excluded.keys_p256dh,
        keys_auth   = excluded.keys_auth,
        user_agent  = excluded.user_agent,
        user_id     = excluded.user_id,
        phone       = excluded.phone,
        role        = excluded.role;
end;
$$;

-- Borra SOLO el endpoint que manda quien llama: es su propio browser el que
-- se desuscribe. No hace falta saber quien es.
create or replace function public.delete_push_subscription(p_endpoint text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.push_subscriptions where endpoint = p_endpoint;
end;
$$;

-- Cuantos suscriptores tiene ESTE negocio. Solo para sus miembros: saber
-- cuanta gente sigue a un local es informacion del local.
create or replace function public.count_push_subscriptions(
  p_tenant_slug text,
  p_role text default 'customer'
)
returns integer
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare v_n integer; v_tenant uuid;
begin
  select id into v_tenant from public.tenants
   where slug = lower(btrim(coalesce(p_tenant_slug, '')));
  if v_tenant is null or v_tenant not in (select private.current_user_tenants()) then
    raise exception 'no_sos_miembro';
  end if;
  select count(*) into v_n from public.push_subscriptions
   where tenant_id = v_tenant and role = coalesce(p_role, 'customer');
  return v_n;
end;
$$;

grant execute on function public.upsert_push_subscription(text,text,text,text,text,uuid,text,text) to anon, authenticated;
grant execute on function public.delete_push_subscription(text) to anon, authenticated;
grant execute on function public.count_push_subscriptions(text,text) to authenticated;

comment on table public.push_subscriptions is
  'Suscripciones web push por tenant. Solo se toca via RPCs: el que se suscribe puede no tener sesion.';
