-- 0025_settings_table.sql — ETAPA 0 del plan de ERP (platform/PLAN-ERP.md)
--
-- La configuracion del negocio pasa de `tenants.settings` (jsonb) a una tabla
-- con columnas, una fila por tenant.
--
-- POR QUE TABLA Y NO JSONB
-- El bug recurrente de este repo (#54, #56, #96) es: se agrega un campo a la
-- UI, no al schema Zod, y el upsert lo descarta EN SILENCIO. Toda la red que
-- lo ataja —check-schema-sync, el manifest, check-supabase-columns— esta
-- construida alrededor de tablas con columnas. Sobre jsonb ninguna de esas
-- protecciones aplica y el bug vuelve. Con 44 campos de configuracion, vuelve
-- seguro.
--
-- EL PUENTE (lo importante de esta migracion)
-- Hay dos lectores del jsonb en produccion HOY: get_catalog (el catalogo
-- publico) y la edge function submit-order (el checkout). Si la tabla pasa a
-- ser la verdad y ellos siguen leyendo el jsonb, el panel escribe en un lado
-- y el cliente ve el otro — y en el caso de submit-order eso es plata: precios
-- y cuentas de cobro.
--
-- En vez de migrar los tres a la vez (una migracion + un deploy de function +
-- retest de checkout, todo o nada), la tabla es la fuente de verdad y un
-- trigger espeja las claves que esos dos leen de vuelta al jsonb. Siguen
-- funcionando sin tocarlos ni redeployarlos. El jsonb deja de ser configuracion
-- y pasa a ser cache derivada.
--
-- El puente se saca cuando get_catalog y submit-order lean de la tabla. Hasta
-- entonces: NADIE escribe tenants.settings a mano — se pisa en el proximo
-- guardado del panel.

/* ─────────────────────────────── Tabla ─────────────────────────────── */

-- tenant_id es la PK: una fila por tenant, garantizado por estructura y no
-- por convencion. El legacy usaba `id=1` porque habia una base por negocio.
create table if not exists public.settings (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,

  -- Identidad y marca
  biz_name text,
  logo_letter text,
  logo_color text,
  logo_url text,
  favicon_url text,
  cover_url text,
  og_image_url text,
  slogan text,
  banner_text text,
  banner_color text,
  catalog_font text,
  -- ACOTADO a 3 a proposito. No confundir con logo_color, que es hex libre.
  catalog_theme text check (catalog_theme is null or catalog_theme in ('ambar','noche','carbon')),

  -- Redes
  whatsapp text,
  instagram text,
  facebook text,
  tiktok text,
  linkedin text,
  twitter text,
  youtube text,

  -- Local y horarios
  store_open boolean,
  store_hours jsonb,
  show_hours_on_catalog boolean,
  has_physical_store boolean,
  store_address text,
  prep_time_min integer,
  delivery_time_min integer,

  -- Catalogo
  min_order_amount numeric,
  hidden_cats text[],
  cat_names jsonb,
  cat_images jsonb,
  cat_groups jsonb,
  daily_deals jsonb,
  deal_pct numeric,

  -- Cobro y envio
  payment_methods text[],
  catalog_payment_methods text[],
  payment_accounts jsonb,
  delivery_pricing jsonb,

  -- Cupones
  coupon_default_pct numeric,
  birthday_coupon_pct numeric,

  -- Costos proyectados y categorias internas
  waste_pct numeric,
  expense_pct numeric,
  usar_targets boolean,
  exp_cats text[],
  ing_cats text[],

  updated_at timestamptz not null default now()
);

alter table public.settings enable row level security;

drop policy if exists settings_select on public.settings;
create policy settings_select on public.settings
  for select using (tenant_id in (select private.current_user_tenants()));

drop policy if exists settings_insert on public.settings;
create policy settings_insert on public.settings
  for insert with check (tenant_id in (select private.current_user_tenants()));

drop policy if exists settings_update on public.settings;
create policy settings_update on public.settings
  for update using (tenant_id in (select private.current_user_tenants()))
  with check (tenant_id in (select private.current_user_tenants()));

-- Sin policy de DELETE: la config de un tenant no se borra suelta. Se va con
-- el tenant, por el on delete cascade.

/* ──────────────────────── Fila por tenant siempre ──────────────────── */

-- Un tenant sin fila de settings es un panel que no puede guardar nada. En vez
-- de que cada camino de alta se acuerde de crearla (signup_tenant,
-- provision_owner, scripts), la garantiza la DB.
create or replace function public.crear_settings_de_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.settings(tenant_id, biz_name)
    values (new.id, new.name)
    on conflict (tenant_id) do nothing;
  return new;
end $$;

drop trigger if exists tenants_crear_settings on public.tenants;
create trigger tenants_crear_settings
  after insert on public.tenants
  for each row execute function public.crear_settings_de_tenant();

/* ──────────────────────────── Backfill ─────────────────────────────── */

-- Los tenants que ya existen: se les crea la fila rescatando lo que hubiera
-- en el jsonb. cochi, por ejemplo, tiene delivery_pricing y prep_time_min
-- cargados; perderlos seria romper su catalogo en produccion.
insert into public.settings (
  tenant_id, biz_name, logo_color, logo_url, cover_url, slogan, catalog_theme,
  prep_time_min, deal_pct, min_order_amount,
  daily_deals, cat_groups, delivery_pricing, payment_accounts
)
select
  t.id,
  coalesce(t.settings->>'biz_name', t.name),
  t.settings->>'logo_color',
  t.settings->>'logo_url',
  t.settings->>'cover_url',
  t.settings->>'slogan',
  case when t.settings->>'catalog_theme' in ('ambar','noche','carbon')
       then t.settings->>'catalog_theme' end,
  (t.settings->>'prep_time_min')::int,
  (t.settings->>'deal_pct')::numeric,
  -- El jsonb tenia la clave con dos nombres distintos segun quien la escribio.
  coalesce((t.settings->>'min_order_amount')::numeric, (t.settings->>'min_order')::numeric),
  t.settings->'daily_deals',
  t.settings->'cat_groups',
  t.settings->'delivery_pricing',
  t.settings->'payment_accounts'
from public.tenants t
on conflict (tenant_id) do nothing;

/* ───────────────────────── El puente al jsonb ──────────────────────── */

-- Espeja a tenants.settings SOLO las claves que get_catalog y submit-order
-- leen hoy. Merge con `||` y no reemplazo: si el jsonb tiene algo que la tabla
-- todavia no modela, no se pierde.
create or replace function public.espejar_settings_a_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.tenants t
     set settings = coalesce(t.settings, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
       'biz_name',         new.biz_name,
       'logo_color',       new.logo_color,
       'logo_url',         new.logo_url,
       'cover_url',        new.cover_url,
       'slogan',           new.slogan,
       'catalog_theme',    new.catalog_theme,
       'prep_time_min',    new.prep_time_min,
       'deal_pct',         new.deal_pct,
       'min_order_amount', new.min_order_amount,
       'daily_deals',      new.daily_deals,
       'cat_groups',       new.cat_groups,
       'delivery_pricing', new.delivery_pricing,
       'payment_accounts', new.payment_accounts
     ))
   where t.id = new.tenant_id;
  return new;
end $$;

drop trigger if exists settings_espejo on public.settings;
create trigger settings_espejo
  after insert or update on public.settings
  for each row execute function public.espejar_settings_a_tenant();

-- updated_at se mantiene solo.
create or replace function public.tocar_settings_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists settings_updated_at on public.settings;
create trigger settings_updated_at
  before update on public.settings
  for each row execute function public.tocar_settings_updated_at();

/* ─────────────────── Fix: el minimo de pedido no aplicaba ──────────── */

-- get_catalog emitia la clave 'min_order' pero CheckoutScreen.jsx lee
-- 'min_order_amount' (src/catalog-pro/CheckoutScreen.jsx:64). O sea que en el
-- edificio el minimo de pedido nunca se aplico: el checkout leia undefined,
-- lo pasaba a 0, y cualquier carrito pasaba. Se emiten las dos claves para no
-- romper a nadie que ya lea la vieja.
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
      'catalog_theme', coalesce(
        (select settings->>'catalog_theme' from t
          where settings->>'catalog_theme' in ('ambar','noche','carbon')),
        'ambar'
      ),
      'prep_time_min',    coalesce((select (settings->>'prep_time_min')::int from t), 30),
      'deal_pct',         coalesce((select (settings->>'deal_pct')::numeric from t), 15),
      'min_order_amount', coalesce((select (settings->>'min_order_amount')::numeric from t), 0),
      'min_order',        coalesce((select (settings->>'min_order_amount')::numeric from t), 0),
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
