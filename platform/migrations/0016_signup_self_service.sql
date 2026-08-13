-- 0016 Signup self-service: alta de tenant por el propio cliente.
--
-- POR QUE NO SE REUSA provision_owner: recibe p_user_id COMO PARAMETRO. Si se
-- le diera grant a `authenticated`, cualquier usuario logueado podria crear un
-- tenant a nombre de otro pasando un uuid ajeno. provision_owner queda como
-- esta (solo service_role, para el script de alta manual) y el camino
-- self-service usa signup_tenant(), que toma la identidad de auth.uid() y
-- NUNCA del caller.
--
-- FLUJO (condicionado por la confirmacion de email, que esta ACTIVADA en el
-- proyecto: auth/v1/signup devuelve confirmation_sent_at y NINGUN token):
--   1. El front llama supabase.auth.signUp() con los datos del negocio en
--      options.data -> quedan en raw_user_meta_data. No hay sesion todavia.
--   2. El usuario confirma desde el mail (puede ser en OTRO dispositivo, por
--      eso los datos viajan en el user metadata y no en localStorage).
--   3. Ya con sesion, el front llama signup_tenant(), que lee el metadata del
--      propio usuario server-side y crea tenant + owner + profile.

-- ── 1. Disponibilidad de slug (para validar el form en vivo) ───────
-- Publico a proposito: si un slug esta tomado ya es observable visitando
-- <slug>.divianco.app. No filtra nada que no sea publico.
create or replace function public.slug_available(p_slug text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- Mismas reglas que los CHECK de 0014: que el form diga "no disponible"
    -- en vez de reventar con un error de constraint al final del alta.
    lower(coalesce(p_slug,'')) ~ '^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])$'
    and lower(p_slug) not in (
      'www','admin','api','app','mail','smtp','imap','pop','ftp',
      'blog','docs','help','support','status','cdn','static','assets',
      'dev','test','staging','demo','preview','localhost',
      'hermes','divianco','grupodivianco','panel','dashboard',
      'login','signup','register','account','billing','pay','checkout'
    )
    and not exists (select 1 from public.tenants t where t.slug = lower(p_slug));
$$;
revoke all on function public.slug_available(text) from public;
grant execute on function public.slug_available(text) to anon, authenticated;

-- ── 2. Alta del tenant ─────────────────────────────────────────────
create or replace function public.signup_tenant()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_meta      jsonb;
  v_email     text;
  v_confirmed timestamptz;
  v_name      text;
  v_vertical  text;
  v_slug      text;
  v_tenant    uuid;
begin
  if v_uid is null then
    raise exception 'No hay sesion activa' using errcode = '28000';
  end if;

  select u.raw_user_meta_data, u.email, u.email_confirmed_at
    into v_meta, v_email, v_confirmed
  from auth.users u where u.id = v_uid;

  -- Sin email confirmado no se crea nada: evita que alguien ocupe slugs con
  -- direcciones que no controla.
  if v_confirmed is null then
    raise exception 'Confirma tu email antes de crear el negocio' using errcode = '28000';
  end if;

  -- Un tenant por cuenta. Sin esto, una sola cuenta puede quedarse con
  -- cuantos subdominios quiera.
  if exists (select 1 from public.tenant_members m where m.user_id = v_uid) then
    raise exception 'Esta cuenta ya tiene un negocio' using errcode = '23505';
  end if;

  v_name     := nullif(trim(v_meta->>'biz_name'), '');
  v_vertical := lower(nullif(trim(v_meta->>'vertical'), ''));
  v_slug     := lower(nullif(trim(v_meta->>'slug'), ''));

  if v_name is null or v_slug is null then
    raise exception 'Faltan datos del negocio' using errcode = '22023';
  end if;

  if v_vertical is null or v_vertical not in ('gastro','barber','retail') then
    raise exception 'Rubro invalido' using errcode = '22023';
  end if;

  -- Revalidado server-side: el metadata lo puede editar el propio usuario,
  -- asi que lo que valida el form NO es garantia de nada.
  if not public.slug_available(v_slug) then
    raise exception 'El slug % no esta disponible', v_slug using errcode = '23505';
  end if;

  insert into public.tenants(slug, name, vertical, settings)
    values (v_slug, v_name, v_vertical, jsonb_build_object(
      'logo_color', '#111111',
      'catalog_theme', 'ambar',
      'prep_time_min', 30
    ))
    returning id into v_tenant;

  insert into public.tenant_members(tenant_id, user_id, role)
    values (v_tenant, v_uid, 'owner');

  insert into public.profiles(id, tenant_id, full_name, email)
    values (v_uid, v_tenant, coalesce(nullif(trim(v_meta->>'full_name'),''), v_name), v_email)
  on conflict (id) do update
    set tenant_id = excluded.tenant_id, email = excluded.email;

  return jsonb_build_object('tenant_id', v_tenant, 'slug', v_slug, 'vertical', v_vertical);
end $$;

revoke all on function public.signup_tenant() from public, anon;
grant execute on function public.signup_tenant() to authenticated;
