-- 0057 El staff de Dico entra con su correo personal.
-- Aplicada via MCP el 21/ago/2026.
--
-- ── POR QUE SE DA MARCHA ATRAS ──
-- El alias corporativo (nombre@grupodivianco.com) necesitaba dos cosas de
-- Cloudflare: un DESTINO —que se pudo crear siempre— y una ROUTING RULE, que
-- es la que hace que el alias entregue. Ese permiso (Zone → Email Routing
-- Rules: Edit) no esta disponible en el token y no se pudo conseguir.
--
-- Sin la regla el alias existe y no entrega nada. Una invitacion mandada ahi se
-- pierde en silencio y vence a las 24 horas. Se probo cuatro veces y ninguna
-- cerro el ciclo.
--
-- Se elige lo que funciona: el correo PERSONAL. La persona recibe la
-- invitacion, elige su contraseña y entra. Eso ya andaba antes de que existiera
-- toda la maquinaria de Cloudflare.
--
-- El alias corporativo no se descarta como idea: se descarta como REQUISITO
-- para dar de alta a alguien. Si algun dia el permiso aparece, se crea el alias
-- en Cloudflare a mano y no cambia nada de esto — la cuenta de la consola es
-- una cosa y el correo de trabajo es otra.
--
-- ── LO QUE SE VA CON ESTO ──
-- `staff_dominios` existia para exigir que el correo fuera del dominio de la
-- empresa. Sin esa exigencia, la tabla no tiene ningun lector — y una tabla que
-- nadie consulta es una que dentro de seis meses alguien lee creyendo que
-- decide algo. Se dropea.
--
-- La proteccion real no era esa lista: es que SOLO EL DUENIO da de alta
-- (`private.es_owner_divianco()`), y eso no cambia.

create or replace function public.sumar_staff(p_email text, p_puesto text default 'soporte')
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_uid uuid;
  v_email text := lower(trim(p_email));
  v_puesto text := lower(trim(coalesce(p_puesto, 'soporte')));
begin
  if not private.es_owner_divianco() then
    raise exception 'solo_el_duenio';
  end if;

  if v_puesto not in ('administrador', 'ventas', 'soporte', 'marketing') then
    return jsonb_build_object('ok', false, 'error', 'puesto_invalido');
  end if;

  -- Clases POSIX y no `\s`: en una migracion el patron pasa por el archivo, por
  -- el cliente y por el parser de Postgres, y una barra invertida perdida en el
  -- camino cambia lo que el patron significa sin dar ningun error. Ya paso hoy
  -- del lado de la edge function: `[^@\s]` quedo como `[^@s]` y rechazaba todo
  -- correo con una letra s.
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return jsonb_build_object('ok', false, 'error', 'email_invalido');
  end if;

  select public.find_user_id_by_email(v_email) into v_uid;
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'sin_cuenta');
  end if;

  insert into public.platform_admins (user_id, email, rol, puesto)
  values (v_uid, v_email, 'staff', v_puesto)
  on conflict (user_id) do update
    set email = excluded.email, puesto = excluded.puesto;

  return jsonb_build_object('ok', true, 'user_id', v_uid, 'email', v_email,
    'puesto', v_puesto);
end $$;

revoke all on function public.sumar_staff(text, text) from public, anon;
grant execute on function public.sumar_staff(text, text) to authenticated;

drop table if exists public.staff_dominios;
