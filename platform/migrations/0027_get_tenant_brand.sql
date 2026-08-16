-- 0027_get_tenant_brand.sql
-- Identidad visual de un tenant, para pantallas que se muestran ANTES de
-- tener sesion.
--
-- El problema concreto: el login de tienda-nueva.divianco.app decia "Cochi",
-- con el logo y el color de Cochi. LoginScreen leia la marca de la tabla
-- `settings`, que desde 0025 tiene RLS por tenant — sin sesion no devuelve
-- nada, y el componente caia al `business` compilado, que es el del build
-- (CLIENT=hermes-cochi). Todos los tenants mostraban la misma marca.
--
-- No sirven las dos funciones publicas que ya existen:
--   - get_tenant_by_host resuelve solo dominios PROPIOS (t.domain), no
--     subdominios de la plataforma, que es como entra casi todo el mundo.
--   - get_catalog devuelve la marca pero arrastra el catalogo entero: 43
--     productos para pintar un logo.
--
-- Devuelve SOLO identidad visible: lo mismo que cualquiera ve entrando al
-- catalogo. Nada de settings crudo, que lleva las cuentas de pago.

create or replace function public.get_tenant_brand(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'slug',        t.slug,
    'name',        coalesce(s.biz_name, t.name),
    'vertical',    t.vertical,
    'logo_letter', coalesce(s.logo_letter, upper(left(coalesce(s.biz_name, t.name, 'D'), 1))),
    'logo_color',  s.logo_color,
    'logo_url',    s.logo_url,
    'slogan',      s.slogan
  )
  from public.tenants t
  left join public.settings s on s.tenant_id = t.id
  where t.slug = lower(trim(coalesce(p_slug, '')))
  limit 1;
$$;

revoke all on function public.get_tenant_brand(text) from public;
grant execute on function public.get_tenant_brand(text) to anon, authenticated;
