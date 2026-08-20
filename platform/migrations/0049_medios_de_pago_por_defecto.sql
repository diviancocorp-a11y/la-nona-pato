-- 0049 Medios de pago por defecto. Aplicada via MCP 19/ago/2026.
--
-- EL AGUJERO QUE TAPA
-- `payment_methods` existe desde 0004 pero su seed quedo COMENTADO al final de
-- aquella migracion, para correrlo a mano. Se corrio una vez, sobre los
-- tenants que existian entonces, y nunca mas. Resultado: los dos negocios que
-- nacieron del alta self-service (`prueba-disco`, `tienda-nueva`) tienen CERO
-- medios de pago. Abren la caja y no pueden cobrar nada, porque no hay con que.
--
-- POR QUE UN TRIGGER Y NO UN INSERT EN signup_tenant
-- Mismo criterio que 0044 con `branch_id`: los caminos que crean un tenant son
-- varios (el alta, los scripts de `platform/scripts/`, el SQL a mano) y van a
-- crecer. Sembrar dentro del alta arregla uno solo y deja el mismo agujero
-- abierto para el que siga. El trigger cubre todos y no hay que acordarse.
--
-- SECURITY DEFINER es necesario, no decorativo: cuando corre el trigger, la
-- fila de `tenant_members` todavia no existe —el alta la inserta despues— asi
-- que la policy de `payment_methods` rechazaria el insert por RLS.
--
-- MercadoPago SOLO en Argentina. Ofrecerlo en Mexico o Espania es prometer una
-- integracion que no existe; el resto de los paises arrancan con efectivo y
-- tarjeta, y agregan lo suyo a mano. Es la misma linea que 6a: el pais decide
-- que se promete.

create or replace function private.sembrar_medios_de_pago()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  insert into public.payment_methods (tenant_id, name, kind)
  select new.id, m.name, m.kind
    from (values
      ('Efectivo',    'cash'),
      ('Tarjeta',     'card'),
      ('MercadoPago', 'mp')
    ) as m(name, kind)
   where m.kind <> 'mp' or coalesce(new.country, 'AR') = 'AR';

  return new;
end $$;

drop trigger if exists tenants_sembrar_medios on public.tenants;
create trigger tenants_sembrar_medios
  after insert on public.tenants
  for each row execute function private.sembrar_medios_de_pago();

-- Backfill: solo los que no tienen NINGUNO. El `not exists` es lo que hace que
-- esto sea seguro de correr de nuevo, y ademas respeta al negocio que borro a
-- proposito un medio que no usa — resembrarselo seria pisarle una decision.
insert into public.payment_methods (tenant_id, name, kind)
select t.id, m.name, m.kind
  from public.tenants t
  cross join (values
    ('Efectivo',    'cash'),
    ('Tarjeta',     'card'),
    ('MercadoPago', 'mp')
  ) as m(name, kind)
 where (m.kind <> 'mp' or coalesce(t.country, 'AR') = 'AR')
   and not exists (
     select 1 from public.payment_methods pm where pm.tenant_id = t.id
   );
