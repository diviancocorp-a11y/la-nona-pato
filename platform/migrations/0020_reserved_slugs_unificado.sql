-- 0020 Slugs reservados: una sola fuente en SQL + los de correo.
--
-- PROBLEMA 1 (mantenimiento): la lista estaba duplicada en el CHECK de 0014 y
-- adentro de slug_available (0016). Dos copias que hay que acordarse de tocar
-- juntas; si divergen, el form dice "disponible" y el INSERT explota contra
-- el constraint. Ahora las dos llaman a is_reserved_slug().
--
-- PROBLEMA 2 (correo): al configurar Resend, el dominio de envio va a ser un
-- subdominio de divianco.app (send.divianco.app). Con el wildcard *, ese
-- nombre es registrable como slug: alguien podia quedarse con el subdominio
-- por el que salen los mails de la plataforma. Se reservan los de correo.
--
-- IMMUTABLE con la lista hardcodeada a proposito: un CHECK constraint no
-- puede consultar una tabla, asi que una tabla reserved_slugs no serviria
-- para el constraint. La contrapartida es que agregar un reservado es una
-- migracion — aceptable, pasa poco y es un cambio que conviene versionar.

create or replace function public.is_reserved_slug(p_slug text)
returns boolean
language sql
immutable
parallel safe
set search_path = public
as $$
  select lower(coalesce(p_slug, '')) in (
    -- Infra y protocolos
    'www', 'admin', 'api', 'app', 'cdn', 'static', 'assets', 'ftp',
    'localhost', 'dev', 'test', 'staging', 'preview', 'demo',
    -- Correo: el dominio de envio (Resend) vive en un subdominio, y con el
    -- wildcard cualquiera de estos seria registrable como tenant.
    'mail', 'email', 'smtp', 'imap', 'pop', 'send', 'mailer', 'correo',
    'noreply', 'no-reply', 'bounces', 'feedback', 'notificaciones',
    -- Producto y marca
    'blog', 'docs', 'help', 'support', 'status',
    'hermes', 'divianco', 'grupodivianco',
    -- Rutas de la plataforma
    'panel', 'dashboard', 'login', 'signup', 'register', 'registro',
    'bienvenido', 'account', 'billing', 'pay', 'checkout'
  );
$$;
revoke all on function public.is_reserved_slug(text) from public;
grant execute on function public.is_reserved_slug(text) to anon, authenticated, service_role;

-- El CHECK pasa a delegar en la funcion: una sola lista en toda la DB.
alter table public.tenants drop constraint if exists tenants_slug_reserved;
alter table public.tenants add constraint tenants_slug_reserved
  check (not public.is_reserved_slug(slug));

create or replace function public.slug_available(p_slug text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    lower(coalesce(p_slug,'')) ~ '^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])$'
    and not public.is_reserved_slug(p_slug)
    and not exists (select 1 from public.tenants t where t.slug = lower(p_slug));
$$;
revoke all on function public.slug_available(text) from public;
grant execute on function public.slug_available(text) to anon, authenticated;
