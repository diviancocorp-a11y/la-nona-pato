-- DICO-QA-Lite: datos sinteticos y deterministas.
-- Auth se crea despues mediante bootstrap-user.mjs; su UUID es efimero.

begin;

insert into public.tenants (
  id, slug, name, vertical, plan, status, country, currency, timezone,
  operation_mode, settings, created_at
) values (
  '10000000-0000-4000-8000-000000000001',
  'dico-qa-lite', 'Dico QA Lite', 'gastro', 'free', 'active', 'AR', 'ARS',
  'America/Argentina/Buenos_Aires', 'fisico',
  '{"catalog_theme":"ambar","logo_color":"#C45D3E","slogan":"Fixture local determinista"}'::jsonb,
  '2026-08-20T15:00:00-03:00'
);

insert into public.branches (
  id, tenant_id, name, address, timezone, day_cutoff_hour, is_default, active, created_at
) values (
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'Principal', 'Calle QA 100', 'America/Argentina/Buenos_Aires', 6, true, true,
  '2026-08-20T15:00:00-03:00'
);

insert into public.settings (
  tenant_id, biz_name, logo_letter, logo_color, slogan, catalog_theme,
  store_open, store_hours, show_hours_on_catalog, has_physical_store,
  store_address, prep_time_min, delivery_time_min, min_order_amount,
  hidden_cats, cat_names, cat_images, cat_groups, daily_deals, deal_pct,
  payment_methods, catalog_payment_methods, payment_accounts, delivery_pricing,
  exp_cats, ing_cats, updated_at
) values (
  '10000000-0000-4000-8000-000000000001',
  'Dico QA Lite', 'D', '#C45D3E', 'Fixture local determinista', 'ambar',
  true,
  '{"lunes":{"open":true,"from":"09:00","to":"23:00"},"martes":{"open":true,"from":"09:00","to":"23:00"},"miercoles":{"open":true,"from":"09:00","to":"23:00"},"jueves":{"open":true,"from":"09:00","to":"23:00"},"viernes":{"open":true,"from":"09:00","to":"23:00"},"sabado":{"open":true,"from":"09:00","to":"23:00"},"domingo":{"open":true,"from":"09:00","to":"23:00"}}'::jsonb,
  true, true, 'Calle QA 100', 25, 35, 0,
  '{}', '{}'::jsonb, '{}'::jsonb, '[]'::jsonb, '{}'::jsonb, 15,
  array['efectivo','tarjeta','transferencia'],
  array['efectivo','tarjeta','transferencia'],
  '[]'::jsonb, '[]'::jsonb,
  array['Insumos','Servicios'], array['Comida','Bebidas'],
  '2026-08-20T15:00:00-03:00'
)
on conflict (tenant_id) do update set
  biz_name = excluded.biz_name,
  logo_letter = excluded.logo_letter,
  logo_color = excluded.logo_color,
  slogan = excluded.slogan,
  catalog_theme = excluded.catalog_theme,
  store_open = excluded.store_open,
  store_hours = excluded.store_hours,
  show_hours_on_catalog = excluded.show_hours_on_catalog,
  has_physical_store = excluded.has_physical_store,
  store_address = excluded.store_address,
  prep_time_min = excluded.prep_time_min,
  delivery_time_min = excluded.delivery_time_min,
  min_order_amount = excluded.min_order_amount,
  hidden_cats = excluded.hidden_cats,
  cat_names = excluded.cat_names,
  cat_images = excluded.cat_images,
  cat_groups = excluded.cat_groups,
  daily_deals = excluded.daily_deals,
  deal_pct = excluded.deal_pct,
  payment_methods = excluded.payment_methods,
  catalog_payment_methods = excluded.catalog_payment_methods,
  payment_accounts = excluded.payment_accounts,
  delivery_pricing = excluded.delivery_pricing,
  exp_cats = excluded.exp_cats,
  ing_cats = excluded.ing_cats,
  updated_at = excluded.updated_at;

insert into public.products (
  id, tenant_id, type, name, price, active, category, description, image_url,
  requires_age_gate, created_at
) values
  ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','composite','Clasica QA',8500,true,'Principales','Producto estable para regresion visual.','/clients/dico-qa-lite/clasica.svg',false,'2026-08-20T15:01:00-03:00'),
  ('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','composite','Verde QA',7900,true,'Principales','Alternativa vegetal sintetica.','/clients/dico-qa-lite/verde.svg',false,'2026-08-20T15:02:00-03:00'),
  ('30000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','composite','Dulce QA',4200,true,'Postres','Postre para completar la grilla.','/clients/dico-qa-lite/dulce.svg',false,'2026-08-20T15:03:00-03:00'),
  ('30000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','simple','Bebida QA',2500,true,'Bebidas','Bebida sin dependencia externa.','/clients/dico-qa-lite/bebida.svg',false,'2026-08-20T15:04:00-03:00');

insert into public.resources (
  id, tenant_id, branch_id, kind, name, zone, capacity, min_party, max_party,
  combinable, pos_x, pos_y, shape, width, height, active, created_at
) values (
  '80000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'table', 'Mesa QA 1', 'Salon', 4, 1, 4, false, 20, 20, 'round', 90, 90, true,
  '2026-08-20T15:05:00-03:00'
);

insert into public.payment_methods (id, tenant_id, name, kind, active, created_at) values
  ('60000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Efectivo','cash',true,'2026-08-20T15:06:00-03:00'),
  ('60000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','Tarjeta','card',true,'2026-08-20T15:06:00-03:00'),
  ('60000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','Transferencia','transfer',true,'2026-08-20T15:06:00-03:00');

insert into public.cash_sessions (
  id, tenant_id, branch_id, opened_at, opening_amount, expected_amount,
  status, notes, business_day
) values (
  '70000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '2026-08-20T09:00:00-03:00', 20000, 20000, 'open', 'Turno sintetico QA', '2026-08-20'
);

insert into public.orders (
  id, tenant_id, branch_id, resource_id, cash_session_id, status, channel,
  customer_name, customer_phone, subtotal, total, payment, payment_status,
  client_request_id, created_at
) values
  ('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',null,null,'new','catalog','Ana QA','1100000001',8500,8500,'efectivo','pending','90000000-0000-4000-8000-000000000001','2026-08-20T12:00:00-03:00'),
  ('40000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',null,null,'preparing','catalog','Bruno QA','1100000002',7900,7900,'tarjeta','pending','90000000-0000-4000-8000-000000000002','2026-08-20T12:10:00-03:00'),
  ('40000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001','active','pos','Carla QA','1100000003',11000,11000,'efectivo','pending','90000000-0000-4000-8000-000000000003','2026-08-20T12:20:00-03:00');

insert into public.order_items (
  id, tenant_id, order_id, product_id, name_snapshot, unit_price, unit_cost,
  qty, subtotal, created_at
) values
  ('50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','Clasica QA',8500,0,1,8500,'2026-08-20T12:00:00-03:00'),
  ('50000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002','Verde QA',7900,0,1,7900,'2026-08-20T12:10:00-03:00'),
  ('50000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000001','Clasica QA',8500,0,1,8500,'2026-08-20T12:20:00-03:00'),
  ('50000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000004','Bebida QA',2500,0,1,2500,'2026-08-20T12:20:00-03:00');

commit;
