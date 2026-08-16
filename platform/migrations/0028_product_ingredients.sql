-- 0028_product_ingredients.sql — ETAPA 2 del plan de ERP
--
-- La receta: que insumos y en que cantidad lleva un producto. Es lo que apaga
-- el `unit_cost = 0` que hoy hace que ningun numero del edificio cierre.
--
-- NO se crea una tabla `recipes`. En el legacy "receta" y "producto" eran la
-- misma fila de `recipes`; en el edificio esa fila ya es `products` (con
-- `type='composite'` cuando lleva insumos). Portar `recipes` habria dejado dos
-- tablas compitiendo por ser el catalogo, y dos pantallas para cargar lo
-- mismo.
--
-- COMBOS FUERA a proposito (decision del 16/ago). Un combo es un producto
-- hecho de OTROS productos, no de insumos, y el costeo se vuelve recursivo —
-- en el legacy eso es `combo_items` y una funcion con recursion acotada a mano.
-- Es cerca de la mitad de la complejidad de la etapa para algo que un cliente
-- nuevo no necesita el primer dia. Cuando entren, van en su propia tabla y no
-- tocan esta.
--
-- La PK compuesta (product_id, ingredient_id) dice la regla sola: un insumo
-- aparece UNA vez por receta. Si lleva mas, se sube la cantidad.

create table if not exists public.product_ingredients (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id) on delete restrict,
  qty numeric not null default 0 check (qty >= 0),
  created_at timestamptz not null default now(),

  primary key (product_id, ingredient_id)
);

-- on delete restrict en ingredient_id (y no cascade) a proposito: borrar un
-- insumo que esta en recetas cambiaria el costo de todas en silencio. El
-- service archiva en vez de borrar; si alguien intenta borrarlo igual, la DB
-- frena y el error se traduce a "ese insumo esta en uso".

create index if not exists product_ingredients_tenant_idx
  on public.product_ingredients (tenant_id);

-- "que recetas usan este insumo" — lo pide el costeo cuando cambia un precio.
create index if not exists product_ingredients_ingredient_idx
  on public.product_ingredients (ingredient_id);

alter table public.product_ingredients enable row level security;

drop policy if exists product_ingredients_select on public.product_ingredients;
create policy product_ingredients_select on public.product_ingredients
  for select using (tenant_id in (select private.current_user_tenants()));

drop policy if exists product_ingredients_insert on public.product_ingredients;
create policy product_ingredients_insert on public.product_ingredients
  for insert with check (tenant_id in (select private.current_user_tenants()));

drop policy if exists product_ingredients_update on public.product_ingredients;
create policy product_ingredients_update on public.product_ingredients
  for update using (tenant_id in (select private.current_user_tenants()))
  with check (tenant_id in (select private.current_user_tenants()));

drop policy if exists product_ingredients_delete on public.product_ingredients;
create policy product_ingredients_delete on public.product_ingredients
  for delete using (tenant_id in (select private.current_user_tenants()));
