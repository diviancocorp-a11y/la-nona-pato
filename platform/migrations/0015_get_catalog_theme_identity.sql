-- 0015 get_catalog v3: tema del catalogo + identidad que faltaba.
--
-- Los 3 temas (ambar/noche/carbon) existen desde siempre en el modelo legacy:
-- settings.catalog_theme, aplicado en App.jsx:64 como body[data-cp-theme].
-- En el edificio NUNCA se aplicaban: get_catalog no devolvia el campo, y el
-- unico que lo leia (fetchSettings) apunta a la tabla `settings`, que aca no
-- existe. Resultado: los 5 tenants forzados a 'ambar'.
--
-- Se suman tambien slogan y logo_url, que lib/tenantHead.js ya consume:
--   - slogan  -> titulo de la pestania ("Cochi — Que bien se cochina")
--   - logo_url -> favicon real cuando el tenant subio su logo; sin el, se
--     genera un SVG con la inicial sobre logo_color.
--
-- Ojo con la distincion, que es a proposito:
--   catalog_theme = ACOTADO a 3 opciones (paleta de superficie del catalogo)
--   logo_color    = hex LIBRE (acento de marca: logo, favicon, theme-color)
-- No son lo mismo y no se pisan.

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
      'slogan',      (select settings->>'slogan' from t),
      'logo_url',    (select settings->>'logo_url' from t),
      -- Validado en la fuente: un valor invalido en el jsonb no puede dejar
      -- el catalogo sin tokens de tema.
      'catalog_theme', coalesce(
        (select settings->>'catalog_theme' from t
          where settings->>'catalog_theme' in ('ambar','noche','carbon')),
        'ambar'
      ),
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
