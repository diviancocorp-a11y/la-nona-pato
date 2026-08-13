-- 0014 Resolucion de tenant por hostname + slugs reservados.
--
-- Contexto: con *.divianco.app apuntando al proyecto (12/ago/2026), el front
-- tiene que saber QUE tenant servir a partir del hostname. Dos casos:
--
--   a) <slug>.divianco.app  -> se parsea en JS, sin round-trip a la DB.
--      Es el caso comun y no puede costar latencia antes del primer paint.
--   b) dominio propio del cliente (micomercio.com.ar) -> requiere DB.
--      Para eso esta get_tenant_by_host() y la columna tenants.domain.
--
-- Por que el slug necesita reglas: el slug ES el subdominio. Si alguien
-- registra "www", www.divianco.app pasa a ser su catalogo. Si registra "admin"
-- o "api", se apropia de rutas de la plataforma. Barato ahora, feo despues.

-- ── 1. Dominio propio por tenant ───────────────────────────────────
alter table public.tenants
  add column if not exists domain text;

-- Un dominio no puede apuntar a dos tenants. NULL no colisiona (varios
-- tenants sin dominio propio conviven sin problema).
create unique index if not exists idx_tenants_domain
  on public.tenants(lower(domain))
  where domain is not null;

-- ── 2. Reglas del slug ─────────────────────────────────────────────
-- Formato: minusculas, numeros y guiones. Ni empieza ni termina en guion.
-- Entre 2 y 40 caracteres (1 solo caracter da subdominios ambiguos).
alter table public.tenants drop constraint if exists tenants_slug_format;
alter table public.tenants add constraint tenants_slug_format
  check (slug ~ '^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])$');

-- Reservados: subdominios de infra, rutas de la plataforma y nombres que
-- un tercero podria usar para hacerse pasar por Hermes.
alter table public.tenants drop constraint if exists tenants_slug_reserved;
alter table public.tenants add constraint tenants_slug_reserved
  check (slug not in (
    'www', 'admin', 'api', 'app', 'mail', 'smtp', 'imap', 'pop', 'ftp',
    'blog', 'docs', 'help', 'support', 'status', 'cdn', 'static', 'assets',
    'dev', 'test', 'staging', 'demo', 'preview', 'localhost',
    'hermes', 'divianco', 'grupodivianco', 'panel', 'dashboard',
    'login', 'signup', 'register', 'account', 'billing', 'pay', 'checkout'
  ));

-- ── 3. Lookup por dominio propio ───────────────────────────────────
-- SECURITY DEFINER + anon: endpoint publico, igual que get_catalog. Devuelve
-- SOLO identidad publica del tenant (nunca settings crudo, que lleva las
-- cuentas de pago). Si el host no corresponde a ningun tenant, devuelve null
-- y el front cae a la landing.
create or replace function public.get_tenant_by_host(p_host text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with norm as (
    select regexp_replace(
             regexp_replace(lower(coalesce(p_host, '')), ':[0-9]+$', ''),
             '^www\.', ''
           ) as host
  )
  select jsonb_build_object(
    'slug',     t.slug,
    'name',     t.name,
    'vertical', t.vertical
  )
  from public.tenants t, norm n
  where lower(t.domain) = n.host
  limit 1;
$$;

revoke all on function public.get_tenant_by_host(text) from public;
grant execute on function public.get_tenant_by_host(text) to anon, authenticated;
