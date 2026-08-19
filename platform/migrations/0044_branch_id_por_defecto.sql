-- 0044 — Ninguna fila nueva queda sin sucursal.
--
-- QUE PASO
-- 0041 hizo el backfill de lo historico, pero las escrituras NUEVAS seguian
-- entrando con branch_id null: submit-order, complete_order y las RPC de
-- gastos no saben de sucursales. Se detecto probando el checkout contra
-- PRODUCCION — el pedido se creo bien, y sin sucursal.
--
-- Es el unico estado que este modelo no deberia permitir: una operacion que
-- ocurrio en algun lado pero no dice donde. Con un solo local no molesta;
-- cuando aparezca el segundo, todo lo escrito hasta entonces seria
-- inatribuible y no habria forma de repartirlo.
--
-- POR QUE UN TRIGGER Y NO ARREGLAR CADA ESCRITOR
-- Los escritores son media docena y crecen. Arreglarlos uno por uno deja el
-- agujero abierto para el proximo que alguien escriba sin acordarse — que es
-- exactamente como aparecio este. El trigger no se puede olvidar.
--
-- Es el mismo criterio del trigger que mantiene el saldo del inventario: la
-- garantia vive en la base, no en la disciplina de quien escribe.

create or replace function public.completar_sucursal()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.branch_id is null then
    select b.id into new.branch_id
      from public.branches b
     where b.tenant_id = new.tenant_id and b.is_default;
  end if;
  return new;
end $$;

comment on function public.completar_sucursal is
  'Etapa 6b: toda operacion cae en la sucursal por defecto si no dice cual. '
  'Un negocio de un solo local nunca se entera; uno de varios no pierde el dato.';

do $$
declare t text;
begin
  foreach t in array array[
    'orders', 'sales', 'cash_sessions', 'appointments', 'expenses', 'payments'
  ]
  loop
    execute format('drop trigger if exists trg_completar_sucursal on public.%I', t);
    execute format(
      'create trigger trg_completar_sucursal before insert on public.%I
         for each row execute function public.completar_sucursal()', t);
  end loop;
end $$;
