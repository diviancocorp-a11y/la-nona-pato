-- 0037_info_pages_y_qrs.sql — Paginas de info y QRs dinamicos (Etapa 6)
--
-- Las dos ultimas capacidades que quedaban apagadas en la configuracion del
-- edificio (`CAPACIDADES_EDIFICIO` en PlatformAdmin). Van juntas porque son
-- la misma forma: contenido del tenant que un visitante SIN SESION tiene que
-- poder leer.
--
-- ── Dos caminos de lectura, a proposito ──
-- El panel (miembro logueado) lee las tablas directo, con RLS por tenant. El
-- visitante del catalogo entra por RPC con el SLUG del negocio, igual que
-- `get_catalog`: es el patron publico del edificio y evita que el front tenga
-- que traducir slug -> uuid para leer una pagina.

/* ═══════════════════ PAGINAS DE INFO ═══════════════════════ */

create table if not exists public.info_pages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,

  slug text not null,
  title text not null,
  -- Bloques ya parseados por el editor (hero, reglas, listas...). jsonb y no
  -- markdown crudo: la pantalla publica los renderiza sin volver a parsear.
  blocks jsonb not null default '[]'::jsonb,

  requires_age_gate boolean not null default false,
  visible boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Por tenant y no global: dos negocios distintos pueden tener su pagina
-- "como-llegar" sin pisarse.
create unique index if not exists info_pages_tenant_slug_uniq
  on public.info_pages (tenant_id, slug);

alter table public.info_pages enable row level security;

-- El editor del legacy detecta el guardado silencioso mirando si volvieron 0
-- filas: sin policies de escritura "guardaba" nada y no avisaba (paso el
-- 12/jun en produccion). Por eso las cuatro estan explicitas.
drop policy if exists info_pages_select on public.info_pages;
create policy info_pages_select on public.info_pages
  for select using (tenant_id in (select private.current_user_tenants()));

drop policy if exists info_pages_insert on public.info_pages;
create policy info_pages_insert on public.info_pages
  for insert with check (tenant_id in (select private.current_user_tenants()));

drop policy if exists info_pages_update on public.info_pages;
create policy info_pages_update on public.info_pages
  for update using (tenant_id in (select private.current_user_tenants()))
  with check (tenant_id in (select private.current_user_tenants()));

drop policy if exists info_pages_delete on public.info_pages;
create policy info_pages_delete on public.info_pages
  for delete using (tenant_id in (select private.current_user_tenants()));

-- Lectura publica: solo lo visible, y solo de ESE negocio. Sin esto el
-- visitante del catalogo no ve nada (no es miembro de nada).
create or replace function public.get_info_page(p_tenant_slug text, p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select to_jsonb(x) from (
    select p.slug, p.title, p.blocks, p.requires_age_gate
      from public.info_pages p
      join public.tenants t on t.id = p.tenant_id
     where t.slug = lower(btrim(coalesce(p_tenant_slug, '')))
       and p.slug = lower(btrim(coalesce(p_slug, '')))
       and p.visible
     limit 1
  ) x;
$$;

/* ═══════════════════ QRs DINAMICOS ════════════════════════ */
--
-- Un QR impreso no se puede cambiar: lo que cambia es a donde apunta. El
-- slug queda fijo para siempre y `target_url` se edita cuando haga falta.

create table if not exists public.dynamic_qrs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,

  slug text not null,
  name text not null,
  target_url text not null,
  description text,

  visits integer not null default 0,
  last_visited_at timestamptz,
  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists dynamic_qrs_tenant_slug_uniq
  on public.dynamic_qrs (tenant_id, slug);

alter table public.dynamic_qrs enable row level security;

drop policy if exists dynamic_qrs_select on public.dynamic_qrs;
create policy dynamic_qrs_select on public.dynamic_qrs
  for select using (tenant_id in (select private.current_user_tenants()));

drop policy if exists dynamic_qrs_insert on public.dynamic_qrs;
create policy dynamic_qrs_insert on public.dynamic_qrs
  for insert with check (tenant_id in (select private.current_user_tenants()));

drop policy if exists dynamic_qrs_update on public.dynamic_qrs;
create policy dynamic_qrs_update on public.dynamic_qrs
  for update using (tenant_id in (select private.current_user_tenants()))
  with check (tenant_id in (select private.current_user_tenants()));

drop policy if exists dynamic_qrs_delete on public.dynamic_qrs;
create policy dynamic_qrs_delete on public.dynamic_qrs
  for delete using (tenant_id in (select private.current_user_tenants()));

-- Resolver y contar en UNA llamada. En el legacy son dos (leer el target y
-- despues un RPC para sumar la visita): desde un telefono recien escaneando,
-- la segunda a veces no llega porque el browser ya navego. Aca la visita se
-- cuenta en el mismo viaje en que se entrega el destino.
create or replace function public.resolve_qr(p_tenant_slug text, p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_qr public.dynamic_qrs;
begin
  select q.* into v_qr
    from public.dynamic_qrs q
    join public.tenants t on t.id = q.tenant_id
   where t.slug = lower(btrim(coalesce(p_tenant_slug, '')))
     and q.slug = lower(btrim(coalesce(p_slug, '')))
     and q.is_active
   limit 1;

  if not found then return null; end if;

  update public.dynamic_qrs
     set visits = visits + 1, last_visited_at = now()
   where id = v_qr.id;

  return jsonb_build_object('slug', v_qr.slug, 'name', v_qr.name, 'target_url', v_qr.target_url);
end;
$$;

grant execute on function public.get_info_page(text, text) to anon, authenticated;
grant execute on function public.resolve_qr(text, text) to anon, authenticated;

comment on function public.get_info_page is
  'Lectura publica de una pagina de info por slug de negocio. Solo las visibles.';
comment on function public.resolve_qr is
  'Resuelve un QR y cuenta la visita en la misma llamada.';
