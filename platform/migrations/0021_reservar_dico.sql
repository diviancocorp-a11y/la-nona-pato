-- 0021 Reserva el nombre del producto: dico.
--
-- El producto de Divianco se llama Dico (decidido 13/ago/2026). Con el
-- wildcard *.divianco.app, `dico` era registrable como slug: el primer
-- cliente que se diera cuenta se quedaba con dico.divianco.app, o sea con el
-- nombre de la marca dentro de la propia plataforma. Y si ademas el dominio
-- de envio de mails pasa a ser dico.divianco.app, seria el mismo nombre.
--
-- 'divianco' y 'grupodivianco' ya estaban desde 0014/0020; faltaba el
-- nombre comercial del producto, que es el que la gente va a tipear.

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
    -- Correo: el dominio de envio vive en un subdominio, y con el wildcard
    -- cualquiera de estos seria registrable como tenant.
    'mail', 'email', 'smtp', 'imap', 'pop', 'send', 'mailer', 'correo',
    'noreply', 'no-reply', 'bounces', 'feedback', 'notificaciones',
    -- Producto y marca
    'blog', 'docs', 'help', 'support', 'status',
    'dico', 'hermes', 'divianco', 'grupodivianco',
    -- Rutas de la plataforma
    'panel', 'dashboard', 'login', 'signup', 'register', 'registro',
    'bienvenido', 'account', 'billing', 'pay', 'checkout'
  );
$$;
revoke all on function public.is_reserved_slug(text) from public;
grant execute on function public.is_reserved_slug(text) to anon, authenticated, service_role;
