-- 0011 get_catalog(slug): endpoint publico del catalogo por tenant. 9/jul/2026.
-- Devuelve { settings, products, serverNow } con el shape que espera catalog-pro
-- (fetchCatalog en src/services/catalog.js). Reusa el front sin reescribirlo:
-- el build "platform" llama a esta RPC en vez de query directa a `recipes`.
--
-- SECURITY DEFINER + grant anon: INTENCIONAL. Es un endpoint publico (anon navega
-- el catalogo). El linter marca 2 warnings por eso -> son esperados y aceptados.
-- Mitigacion: la funcion devuelve SOLO campos seguros de productos ACTIVOS del
-- tenant pedido; no expone tenants.settings crudo ni data de otros tenants.

create or replace function public.get_catalog(p_tenant_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with t as (select * from public.tenants where slug = p_tenant_slug limit 1)
  select jsonb_build_object(
    'settings', jsonb_build_object(
      'biz_name',    (select name from t),
      'vertical',    (select vertical from t),
      'logo_letter', upper(left(coalesce((select name from t),'H'),1)),
      'logo_color',  coalesce((select settings->>'logo_color' from t), '#111111'),
      'cover_url',   (select settings->>'cover_url' from t)
    ),
    'products', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'category', p.category,
        'sale_price', p.price, 'image_url', p.image_url, 'description', p.description,
        'related_ids', '[]'::jsonb, 'is_vegetarian', false,
        'requires_age_gate', p.requires_age_gate, 'is_combo', false,
        'discount_pct', 0, 'sold_out_override', false,
        'created_at', p.created_at, 'sale_count', 0
      ) order by p.category nulls last, p.name)
      from public.products p, t
      where p.tenant_id = t.id and p.active = true
    ), '[]'::jsonb),
    'serverNow', now()
  );
$$;
revoke all on function public.get_catalog(text) from public;
grant execute on function public.get_catalog(text) to anon, authenticated;
