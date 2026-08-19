-- 0042 — El stock deja de ser un numero y pasa a ser un libro (Etapa 6b, parte 2).
--
-- EL PROBLEMA QUE RESUELVE
-- Hoy el stock del edificio se muta desde tres lugares (compra en 0030,
-- compra v2 en 0031, merma en 0033), cada uno haciendo `set stock = stock ± qty`.
-- El numero es correcto, pero **no hay forma de contestar por que el stock
-- dice 7**. No se puede auditar, no se puede corregir un error puntual sin
-- adivinar, y no se puede repartir entre sucursales.
--
-- No alcanzaba con ponerle branch_id al numero: eso deja la deuda intacta y
-- multiplicada por la cantidad de locales.
--
--   stock = 7   ->   +20 compra  -5 ventas  -3 merma  -4 transferencia
--                    -1 ajuste  =  7
--
-- POR QUE UN SALDO CACHEADO Y NO SUMAR SIEMPRE
-- Sumar el libro entero en cada pantalla de stock se degrada con los anios.
-- El saldo vive en `inventory_balances` y lo mantiene un trigger sobre el
-- libro, asi que no puede desincronizarse por olvido de nadie: no hay forma
-- de escribir un movimiento sin que el saldo se entere.
--
-- POR QUE reference_type / reference_id
-- Es lo que cierra el circulo: cada movimiento apunta a la compra, la venta,
-- la merma o la transferencia que lo genero. Sin eso el libro dice "salieron
-- 3" y no "salieron 3 por el pedido #412".
--
-- COMPATIBILIDAD
-- `ingredients.stock` NO se elimina en esta migracion. Se sigue escribiendo
-- igual que antes y ahora ademas se asienta el movimiento. Sacar la columna
-- exige tocar todas las pantallas que la leen; se hace despues, con el libro
-- ya poblado y comparado contra el numero viejo. Migrar los dos a la vez seria
-- cambiar la fuente de verdad del stock a ciegas.

-- ─────────────────────── inventory_movements ───────────────────────────

create table if not exists public.inventory_movements (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  branch_id      uuid references public.branches(id),

  -- El edificio tiene DOS cosas con stock y no comparten tabla: los insumos
  -- (gastro) y las variantes de producto (retail). Una sola columna polimorfica
  -- sin FK dejaria pasar ids inexistentes; dos columnas con un CHECK de
  -- exclusividad dan integridad real.
  ingredient_id  uuid references public.ingredients(id) on delete cascade,
  variant_id     uuid references public.product_variants(id) on delete cascade,

  kind           text not null check (kind in (
    'purchase', 'sale', 'waste', 'return',
    'transfer_out', 'transfer_in', 'adjustment', 'initial'
  )),
  -- Firmada: positiva entra, negativa sale. Guardar el signo en la cantidad y
  -- no derivarlo del kind permite un ajuste en las dos direcciones sin
  -- inventar dos kinds, y hace que el saldo sea una suma y nada mas.
  qty            numeric not null check (qty <> 0),
  unit_cost      numeric,

  reference_type text,     -- 'expense', 'order', 'waste_log', 'transfer'...
  reference_id   uuid,
  note           text,

  client_request_id uuid,
  created_by     uuid,
  created_at     timestamptz not null default now(),

  constraint inventory_movements_una_cosa check (
    (ingredient_id is not null and variant_id is null) or
    (ingredient_id is null and variant_id is not null)
  )
);

create index if not exists idx_inv_mov_tenant     on public.inventory_movements(tenant_id);
create index if not exists idx_inv_mov_ingredient on public.inventory_movements(ingredient_id, branch_id);
create index if not exists idx_inv_mov_variant    on public.inventory_movements(variant_id, branch_id);
create index if not exists idx_inv_mov_ref        on public.inventory_movements(reference_type, reference_id);

-- Idempotencia del libro. Esto es lo que cierra el hueco que 0040 dejo
-- anotado: una compra con total 0 no escribe gasto, pero SI escribe
-- movimiento, asi que aca queda protegida igual.
-- La cosa movida es parte de la identidad del movimiento. Sin ella, una compra
-- de 3 insumos con una sola clave chocaba en la segunda linea y el guard de la
-- RPC devolvia el movimiento de la primera: la compra entraba INCOMPLETA y sin
-- error. Se detecto probando el caso multi-linea.
create unique index if not exists inv_mov_client_request_uniq
  on public.inventory_movements
     (tenant_id, client_request_id, kind, coalesce(ingredient_id, variant_id))
  where client_request_id is not null;

alter table public.inventory_movements enable row level security;

drop policy if exists inv_mov_select on public.inventory_movements;
create policy inv_mov_select on public.inventory_movements
  for select using (tenant_id in (select private.current_user_tenants()));

-- Escritura solo por las RPC (security definer) y el service role. Un libro
-- contable que la UI puede editar directo no es un libro: el asiento se hace
-- con la operacion que lo genera, nunca suelto.
drop policy if exists inv_mov_insert on public.inventory_movements;

comment on table public.inventory_movements is
  'Etapa 6b: el libro del stock. Cada fila explica un cambio. El saldo sale de aca.';

-- ──────────────────────── inventory_balances ───────────────────────────

create table if not exists public.inventory_balances (
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  branch_id     uuid not null references public.branches(id) on delete cascade,
  ingredient_id uuid references public.ingredients(id) on delete cascade,
  variant_id    uuid references public.product_variants(id) on delete cascade,
  qty           numeric not null default 0,
  updated_at    timestamptz not null default now(),
  constraint inventory_balances_una_cosa check (
    (ingredient_id is not null and variant_id is null) or
    (ingredient_id is null and variant_id is not null)
  )
);

-- Un saldo por cosa y por sucursal. Dos indices parciales porque una PK sobre
-- columnas nullables no serviria: en Postgres los null no colisionan entre si.
create unique index if not exists inv_bal_ingrediente_uniq
  on public.inventory_balances (branch_id, ingredient_id) where ingredient_id is not null;
create unique index if not exists inv_bal_variante_uniq
  on public.inventory_balances (branch_id, variant_id) where variant_id is not null;

alter table public.inventory_balances enable row level security;

drop policy if exists inv_bal_select on public.inventory_balances;
create policy inv_bal_select on public.inventory_balances
  for select using (tenant_id in (select private.current_user_tenants()));

comment on table public.inventory_balances is
  'Etapa 6b: saldo derivado del libro. Lo mantiene un trigger — no se escribe a mano.';

-- ───────────────── El saldo se actualiza solo ──────────────────────────

create or replace function public.aplicar_movimiento_al_saldo()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_branch uuid;
begin
  -- Un movimiento sin sucursal va a la default. Pasa con lo que escriben las
  -- RPC viejas, que todavia no saben de sucursales.
  v_branch := new.branch_id;
  if v_branch is null then
    select b.id into v_branch from public.branches b
     where b.tenant_id = new.tenant_id and b.is_default;
  end if;
  if v_branch is null then
    raise exception 'el negocio no tiene sucursal por defecto';
  end if;

  if new.ingredient_id is not null then
    insert into public.inventory_balances (tenant_id, branch_id, ingredient_id, qty)
      values (new.tenant_id, v_branch, new.ingredient_id, new.qty)
    on conflict (branch_id, ingredient_id) where ingredient_id is not null
      do update set qty = public.inventory_balances.qty + excluded.qty,
                    updated_at = now();
  else
    insert into public.inventory_balances (tenant_id, branch_id, variant_id, qty)
      values (new.tenant_id, v_branch, new.variant_id, new.qty)
    on conflict (branch_id, variant_id) where variant_id is not null
      do update set qty = public.inventory_balances.qty + excluded.qty,
                    updated_at = now();
  end if;

  return new;
end $$;

drop trigger if exists trg_movimiento_al_saldo on public.inventory_movements;
create trigger trg_movimiento_al_saldo
  after insert on public.inventory_movements
  for each row execute function public.aplicar_movimiento_al_saldo();

-- El libro no se corrige borrando ni editando: se corrige con un asiento
-- contrario. Si se pudiera editar, el saldo cacheado quedaria mintiendo y la
-- auditoria no valdria nada.
create or replace function public.libro_es_de_solo_agregar()
returns trigger
language plpgsql
as $$
begin
  raise exception 'el libro de inventario no se edita ni se borra: registra un ajuste contrario';
end $$;

drop trigger if exists trg_libro_inmutable on public.inventory_movements;
create trigger trg_libro_inmutable
  before update or delete on public.inventory_movements
  for each row execute function public.libro_es_de_solo_agregar();

-- ─────────────── Asiento de apertura con lo que ya hay ─────────────────
--
-- El stock que hoy vive en ingredients.stock entra al libro como 'initial'.
-- Sin esto el libro arrancaria en 0 y contradiria al numero viejo desde el
-- primer dia.

insert into public.inventory_movements (
  tenant_id, branch_id, ingredient_id, kind, qty, unit_cost, note
)
select i.tenant_id, b.id, i.id, 'initial', i.stock, i.cost,
       'Saldo al implantar el libro (0042)'
  from public.ingredients i
  join public.branches b on b.tenant_id = i.tenant_id and b.is_default
 where coalesce(i.stock, 0) <> 0
   and not exists (
     select 1 from public.inventory_movements m
      where m.ingredient_id = i.id and m.kind = 'initial'
   );

-- ─────────────────── Registrar un movimiento ───────────────────────────

create or replace function public.register_stock_movement(
  p_tenant_id uuid,
  p_kind text,
  p_qty numeric,
  p_ingredient_id uuid default null,
  p_variant_id uuid default null,
  p_branch_id uuid default null,
  p_unit_cost numeric default null,
  p_reference_type text default null,
  p_reference_id uuid default null,
  p_note text default null,
  p_client_request_id uuid default null
)
returns public.inventory_movements
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_mov public.inventory_movements;
begin
  if p_tenant_id is null then
    raise exception 'falta_tenant';
  end if;
  -- security definer: el chequeo de membresia es la unica barrera, no la RLS.
  if p_tenant_id not in (select private.current_user_tenants()) then
    raise exception 'no_sos_miembro';
  end if;

  if p_client_request_id is not null then
    select * into v_mov from public.inventory_movements m
     where m.tenant_id = p_tenant_id
       and m.client_request_id = p_client_request_id
       and m.kind = p_kind
       and coalesce(m.ingredient_id, m.variant_id)
           = coalesce(p_ingredient_id, p_variant_id);
    if found then
      return v_mov;
    end if;
  end if;

  -- Que lo movido sea de este negocio. Sin esto, un id de otro tenant
  -- ensuciaria su libro: la funcion es definer y la RLS no la frena.
  if p_ingredient_id is not null and not exists (
    select 1 from public.ingredients i
     where i.id = p_ingredient_id and i.tenant_id = p_tenant_id) then
    raise exception 'insumo_de_otro_negocio';
  end if;
  if p_variant_id is not null and not exists (
    select 1 from public.product_variants v
     where v.id = p_variant_id and v.tenant_id = p_tenant_id) then
    raise exception 'variante_de_otro_negocio';
  end if;
  if p_branch_id is not null and not exists (
    select 1 from public.branches b
     where b.id = p_branch_id and b.tenant_id = p_tenant_id) then
    raise exception 'sucursal_de_otro_negocio';
  end if;

  insert into public.inventory_movements (
    tenant_id, branch_id, ingredient_id, variant_id, kind, qty, unit_cost,
    reference_type, reference_id, note, client_request_id, created_by
  )
  values (
    p_tenant_id,
    coalesce(p_branch_id, (select b.id from public.branches b
                            where b.tenant_id = p_tenant_id and b.is_default)),
    p_ingredient_id, p_variant_id, p_kind, p_qty, p_unit_cost,
    p_reference_type, p_reference_id, p_note, p_client_request_id, auth.uid()
  )
  returning * into v_mov;

  return v_mov;
end $$;

revoke all on function public.register_stock_movement(
  uuid, text, numeric, uuid, uuid, uuid, numeric, text, uuid, text, uuid)
  from public, anon;
grant execute on function public.register_stock_movement(
  uuid, text, numeric, uuid, uuid, uuid, numeric, text, uuid, text, uuid)
  to authenticated;

-- ─────────────── Por que hay N: el libro de una cosa ───────────────────

create or replace function public.stock_explicado(
  p_tenant_id uuid,
  p_ingredient_id uuid,
  p_branch_id uuid default null
)
returns table (kind text, total numeric, movimientos bigint)
language sql
stable
set search_path = public, private, pg_temp
as $$
  select m.kind, sum(m.qty), count(*)
    from public.inventory_movements m
   where m.tenant_id = p_tenant_id
     and m.ingredient_id = p_ingredient_id
     and (p_branch_id is null or m.branch_id = p_branch_id)
     and m.tenant_id in (select private.current_user_tenants())
   group by m.kind
   order by sum(m.qty) desc;
$$;

grant execute on function public.stock_explicado(uuid, uuid, uuid) to authenticated;

comment on function public.stock_explicado is
  'Etapa 6b: el desglose que contesta por que el stock dice lo que dice.';

-- ────────── Merma y compra asientan en el libro (mismo 0042) ───────────
--
-- El libro sin escritores es un adorno. `register_waste` y `register_purchase`
-- siguen moviendo `ingredients.stock` igual que antes —la compatibilidad se
-- mantiene a proposito— y ahora ademas asientan el movimiento con su
-- referencia. Cuando el libro este poblado y comparado contra el numero viejo,
-- se saca la columna.
--
-- El SQL completo de las dos funciones se aplico en la migracion
-- `merma_y_compra_asientan_en_el_libro`. Lo que agregan sobre 0040 es:
--
--   register_waste     -> perform register_stock_movement(..., 'waste', -qty,
--                         reference_type='waste_log', reference_id=<fila>)
--   register_purchase  -> un movimiento 'purchase' POR LINEA, con
--                         reference_type='expense', reference_id=<gasto>
--                         y un guard extra: si ya hay movimientos con esa
--                         clave, corta aunque no haya gasto (compra en 0).
--
-- Ese guard extra es lo que cierra el hueco que 0040 dejo anotado.
