-- 0035_cuenta_del_comprador.sql — ETAPA 5b del PLAN-ERP
--
-- La otra mitad de "clientes": la 5a fue el CRM que ve el DUENO (agregado
-- sobre orders). Esto es la cuenta que usa el COMPRADOR en el catalogo:
-- guardar direcciones, marcar favoritos y ver sus pedidos.
--
-- Hoy eso esta ROTO EN SILENCIO en el edificio: AuthContext consulta
-- `addresses` y `favorites`, que no existen, y como un .select() con error
-- devuelve {error} en vez de tirar, la pantalla queda vacia sin avisar. Y un
-- comprador logueado tampoco puede leer sus propios pedidos, porque la unica
-- policy de select de `orders` es para miembros del negocio.
--
-- ── ESTAS DOS TABLAS NO LLEVAN tenant_id, Y ES A PROPOSITO ──
-- La regla del repo ("toda tabla nueva: tenant_id + RLS por tenant") vale
-- para las tablas del NEGOCIO. Estas son de la PERSONA: una direccion es de
-- quien vive ahi, no de la panaderia. En una plataforma donde el mismo
-- comprador pide en varios locales, ponerles tenant_id significaria que
-- tiene que volver a escribir su direccion en cada uno — y que si manana
-- prueba otro local, empieza de cero. El aislamiento aca lo da `user_id`:
-- cada uno ve lo suyo y nada mas, ni siquiera el dueno del local.
--
-- ── SOBRE profiles ──
-- `profiles` nacio en 0008 para el DUENO, con `tenant_id` y `full_name`, y
-- sin policy de INSERT (solo la crea provision_owner). Un comprador no podia
-- tener perfil. Ahora es UNA FILA POR PERSONA: la misma cuenta puede ser
-- duena de un local y compradora en otro, porque es la misma persona.
-- `profiles.tenant_id` queda por compatibilidad pero NO es la verdad de que
-- administra alguien: Ricky es dueno de 6 tenants y esa columna solo puede
-- guardar uno. Esa verdad vive —y siempre vivio— en `tenant_members`.

/* ═══════════════════ PERFIL DE LA PERSONA ═══════════════════ */

alter table public.profiles
  add column if not exists name text,
  add column if not exists phone text,
  add column if not exists nickname text,
  add column if not exists updated_at timestamptz not null default now();

-- Los duenos ya cargados tienen su nombre en full_name (lo escribe
-- provision_owner). Sin esto, el primer render de su cuenta los saluda vacio.
update public.profiles
   set name = full_name
 where name is null and full_name is not null;

-- 0008 no tenia policy de INSERT porque el perfil lo creaba provision_owner.
-- Un comprador que se registra en el catalogo necesita crear el suyo, y solo
-- el suyo: `id = auth.uid()` es lo que impide escribir el perfil de otro.
drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
  for insert to authenticated
  with check (id = auth.uid());

/* ═══════════════════════ DIRECCIONES ════════════════════════ */

create table if not exists public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  label text not null default 'Casa',
  address text not null,
  -- El geocoding es del cliente; se guardan para no recalcular el costo de
  -- envio en cada pedido.
  lat numeric,
  lng numeric,
  notes text,

  created_at timestamptz not null default now()
);

create index if not exists addresses_user_idx on public.addresses (user_id);

alter table public.addresses enable row level security;

-- Una sola policy para todo: es de quien la escribio, punto. Ni el dueno del
-- local ve la libreta de direcciones de sus clientes (lo que necesita para
-- entregar viaja en el pedido, en orders.delivery_address).
drop policy if exists addresses_own on public.addresses;
create policy addresses_own on public.addresses
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

/* ════════════════════════ FAVORITOS ═════════════════════════ */

create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- En el legacy la columna era `recipe_id`: alla el producto vivia en
  -- `recipes`. En el edificio la receta ES el producto (decision de la
  -- Etapa 2), asi que apunta a products y se llama por lo que es.
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Tocar dos veces el corazon no puede dejar dos filas.
create unique index if not exists favorites_user_product_uniq
  on public.favorites (user_id, product_id);

alter table public.favorites enable row level security;

drop policy if exists favorites_own on public.favorites;
create policy favorites_own on public.favorites
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

/* ═════════════ EL COMPRADOR VE SUS PROPIOS PEDIDOS ══════════ */
--
-- Hasta ahora orders_select era solo "miembros del negocio", asi que el
-- historial de un comprador logueado volvia vacio. Se SUMA el caso del
-- dueno del pedido; no se afloja nada de lo anterior.
--
-- El `user_id is not null` no es decorativo: sin el, un anonimo (auth.uid()
-- null) contra un pedido de invitado (user_id null) entraria en la
-- comparacion null = null. Da null, no true, asi que igual no pasa — pero
-- una regla de seguridad que depende de conocer la logica ternaria de SQL
-- es una que alguien va a romper al editarla.

drop policy if exists orders_select on public.orders;
create policy orders_select on public.orders
  for select using (
    tenant_id in (select private.current_user_tenants())
    or (user_id is not null and user_id = auth.uid())
  );

drop policy if exists order_items_select on public.order_items;
create policy order_items_select on public.order_items
  for select using (
    tenant_id in (select private.current_user_tenants())
    or exists (
      select 1 from public.orders o
       where o.id = order_items.order_id
         and o.user_id is not null
         and o.user_id = auth.uid()
    )
  );

comment on table public.addresses is
  'Direcciones del comprador. Sin tenant_id a proposito: son de la persona, no del negocio.';
comment on table public.favorites is
  'Favoritos del comprador (user_id + product_id). Sin tenant_id: el producto ya dice de que local es.';
