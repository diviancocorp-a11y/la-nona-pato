-- 0013 get_catalog v2: fix del sold_out_override + settings que pide el checkout.
--
-- DOS problemas de la v1 (0011), detectados al deployar el build a Vercel:
--
-- 1. BUG: 'sold_out_override' venia hardcodeado en `false`. Segun
--    src/lib/stockAvailability.js, false NO significa "hay stock" — significa
--    "forzar agotado". Resultado: los 10 productos de cochi salian AGOTADO en
--    el catalogo publico. El valor correcto para "auto" es NULL.
--    products no tiene columna sold_out_override todavia; cuando exista, se
--    mapea aca.
--
-- 2. FALTANTE: el bloque settings devolvia 5 campos. El checkout lee
--    settings.payment_accounts (CheckoutScreen.jsx:75) y settings.delivery_pricing
--    (pages/Catalog.jsx:127). Sin eso el cliente no puede elegir como paga ni
--    se calcula el envio. Se pasan desde tenants.settings jsonb.
--
-- Hardening: payment_accounts se filtra EN EL SERVER (activas y con scope
-- distinto de 'proveedores'). El front ya filtraba, pero las cuentas de
-- proveedor llevan CBU que el cliente final no tiene por que ver.
-- Se expone una whitelist de claves, nunca tenants.settings crudo.

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
      'cover_url',   (select settings->>'cover_url' from t),
      -- Config de catalogo y checkout (whitelist desde tenants.settings)
      'prep_time_min',    coalesce((select (settings->>'prep_time_min')::int from t), 30),
      'deal_pct',         coalesce((select (settings->>'deal_pct')::numeric from t), 15),
      'min_order',        coalesce((select (settings->>'min_order')::numeric from t), 0),
      'daily_deals',      coalesce((select settings->'daily_deals' from t), '{}'::jsonb),
      'cat_groups',       coalesce((select settings->'cat_groups' from t), '[]'::jsonb),
      'delivery_pricing', coalesce((select settings->'delivery_pricing' from t), '[]'::jsonb),
      'payment_accounts', coalesce((
        select jsonb_agg(a)
        from t, jsonb_array_elements(coalesce(t.settings->'payment_accounts', '[]'::jsonb)) a
        where coalesce(a->>'active', 'true') <> 'false'
          and coalesce(a->>'scope', 'ambos') <> 'proveedores'
      ), '[]'::jsonb)
    ),
    'products', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'category', p.category,
        'sale_price', p.price, 'image_url', p.image_url, 'description', p.description,
        'related_ids', '[]'::jsonb, 'is_vegetarian', false,
        'requires_age_gate', p.requires_age_gate, 'is_combo', false,
        'discount_pct', 0, 'sold_out_override', null,
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
