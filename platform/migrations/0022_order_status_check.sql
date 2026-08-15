-- 0022_order_status_check.sql
-- Acota orders.status al vocabulario real del edificio.
--
-- Hasta ahora la columna era texto libre con default 'pending', un estado que
-- ninguna UI conoce ni sabe mostrar: submit-order escribe 'new' o
-- 'pending_payment' explicitamente, asi que 'pending' solo podia aparecer por
-- un insert descuidado y quedarse ahi invisible. Con el panel de pedidos ya
-- moviendo estados, conviene que la DB rechace lo que la UI no puede pintar.
--
-- Estados (mismo vocabulario que el legacy + pending_payment, que es propio
-- del checkout con MercadoPago):
--   pending_payment -> new -> preparing -> active -> completed
--   cancelled desde cualquiera
--
-- Seguro de aplicar: al momento de escribir esto la tabla tiene 0 filas.

alter table public.orders alter column status set default 'new';

update public.orders set status = 'new' where status = 'pending';

alter table public.orders
  add constraint orders_status_check
  check (status in ('pending_payment', 'new', 'preparing', 'active', 'completed', 'cancelled'));
