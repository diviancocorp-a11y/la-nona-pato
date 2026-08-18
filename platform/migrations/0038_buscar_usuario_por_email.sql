-- 0038_buscar_usuario_por_email.sql — Equipo del negocio (Etapa 6, ultimo item)
--
-- Un helper chico para la edge function `tenant-users`: encontrar si un email
-- ya tiene cuenta en la plataforma.
--
-- POR QUE NO listUsers(): la funcion legacy resuelve esto trayendo las
-- primeras 200 cuentas y buscando en memoria. En una app de UN negocio eso
-- alcanza; en una plataforma con miles de usuarios, el que quede afuera de
-- las primeras 200 aparece como "no existe" y se le crea una cuenta
-- duplicada. Con el indice de auth.users esto es O(1) y no miente.
--
-- Solo service_role: es la edge function la que llama, y ya valido que quien
-- pide sea OWNER del negocio. Expuesto a authenticated seria un oraculo para
-- averiguar que direcciones estan registradas en la plataforma.

create or replace function public.find_user_id_by_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = auth, pg_temp
as $$
  select id from auth.users
   where lower(email) = lower(btrim(coalesce(p_email, '')))
   limit 1;
$$;

revoke all on function public.find_user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.find_user_id_by_email(text) to service_role;

comment on function public.find_user_id_by_email is
  'Solo para edge functions con service role. Nunca exponer a authenticated: seria un oraculo de emails registrados.';
