-- 0064 El catalogo deja de ser escribible por cualquier empleado.
--
-- ══════════════════ QUE PASABA ══════════════════
--
-- Medido en el smoke del 4/9/2026 (§5): con sesion de Mozo,
-- `update products set price = 1` cambio 3 filas. Y `delete` tambien.
--
-- Las policies de `products` venian de 0001/0002 y son por MEMBRESIA:
-- `tenant_id in (select private.current_user_tenants())` para select, insert,
-- update y delete. La 0050 puso roles a `expenses`, `suppliers`, `sales`,
-- `settings`, `staff`, `audit_log` y `cash_sessions` — `products` no entro en
-- esa lista.
--
-- El panel lo esconde: `puedeVer` saca el modulo de la navegacion de quien no
-- lo tiene. Pero eso es navegacion, y el propio codigo lo dice. Contra la API,
-- cualquiera con sesion del negocio editaba o borraba el catalogo entero.
--
-- ══════════════════ EL CORTE ══════════════════
--
-- LEER lo lee todo el mundo: el mozo necesita el catalogo para tomar el
-- pedido y la cocina para saber que sale. Es lo que ya dice la matriz de
-- roles del panel (`src/modules/roles.js`), donde `products` es LECTURA hasta
-- para el rol mas acotado.
--
-- ESCRIBIR es de duenio y encargado, como `settings`: el precio es una
-- decision del negocio.
--
-- BORRAR es solo del duenio, igual que en el resto de 0050.
--
-- Mismo barrido previo que 0050 y por la misma razon: las policies permisivas
-- se combinan con OR, asi que alcanza con que sobreviva una vieja por
-- membresia para que este corte no sirva de nada.

do $$
declare p text;
begin
  for p in select policyname from pg_policies
            where schemaname = 'public' and tablename = 'products' loop
    execute format('drop policy if exists %I on public.products', p);
  end loop;
end $$;

create policy products_select on public.products for select using (
  tenant_id in (select private.current_user_tenants())
);

create policy products_insert on public.products for insert with check (
  tenant_id in (select private.current_user_tenants())
  and private.tiene_rol(tenant_id, array['owner','manager'])
);

create policy products_update on public.products for update using (
  tenant_id in (select private.current_user_tenants())
  and private.tiene_rol(tenant_id, array['owner','manager'])
) with check (
  tenant_id in (select private.current_user_tenants())
  and private.tiene_rol(tenant_id, array['owner','manager'])
);

create policy products_delete on public.products for delete using (
  tenant_id in (select private.current_user_tenants())
  and private.tiene_rol(tenant_id, array['owner'])
);

comment on table public.products is
  'Catalogo del negocio. Lee cualquier miembro; escriben duenio y encargado; '
  'borra el duenio (0064).';
