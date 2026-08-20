-- 20260820 — versiona `payment_integrations` (LEGACY).
--
-- POR QUE ESTA MIGRACION LLEGA TARDE
-- La tabla existe y esta EN USO en los 3 tenants legacy desde que se conecto
-- MercadoPago, pero se creo a mano por el dashboard y nunca se versiono. Es el
-- mismo caso que `info_pages`, `dynamic_qrs` y `push_subscriptions`, que se
-- versionaron el 12/jun por esta misma razon.
--
-- El costo de no tenerla: si hubiera que recrear un tenant legacy desde cero,
-- `supabase/migrations/` no alcanzaba — la tabla donde vive la credencial de
-- cobro no estaba en ningun lado. Se descubrio al construir la version
-- multi-tenant (platform/migrations/0051), cuando el checker de columnas aviso
-- que la tabla solo existia del lado del edificio.
--
-- ── DE DONDE SALE ESTE DDL ──
-- Los 3 proyectos legacy estan pausados, asi que NO es un volcado de la base:
-- esta reconstruido a partir de todo lo que la usa, que es el conjunto
-- completo de columnas que el codigo toca:
--
--   supabase/functions/mp-connect-manual   insert de todas las columnas
--   supabase/functions/mp-oauth-callback   insert con refresh_token y scopes
--   supabase/functions/mp-status           select public_key, metadata, external_user_id
--   supabase/functions/create-payment-preference  select access_token
--   supabase/functions/mp-webhook          select access_token
--   src/services/paymentIntegrations.js    select de los campos "seguros"
--
-- Por eso TODO es idempotente: sobre los tenants que ya la tienen no cambia
-- nada, y sobre uno nuevo la crea igual. Si al despausar un proyecto aparece
-- alguna diferencia de tipos o defaults, gana la base y esto se corrige.

create table if not exists public.payment_integrations (
  id uuid primary key default gen_random_uuid(),

  -- Hoy solo 'mercadopago'. La columna existe desde el principio porque la
  -- pantalla se llamo siempre "Pasarelas", en plural.
  provider text not null default 'mercadopago',

  -- La credencial con la que se cobra. Ver la nota de seguridad al final.
  access_token text not null,
  -- Solo lo llena el flujo OAuth; el manual no tiene con que renovar.
  refresh_token text,

  -- El id de la cuenta de MercadoPago, para mostrar a cual quedo conectado.
  external_user_id text,
  scopes text[] default '{}'::text[],
  public_key text,
  expires_at timestamptz,

  -- Baja logica: conectar una cuenta nueva desactiva la anterior en vez de
  -- borrarla, asi queda el rastro de con que cuenta se cobro antes.
  is_active boolean not null default true,

  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- live_mode, connection_type ('manual' | 'oauth'), nickname, email, site_id.
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_payment_integrations_activa
  on public.payment_integrations(provider) where is_active;

alter table public.payment_integrations enable row level security;

-- Se BARREN las policies antes de crearlas. Reemplazar por nombre asume como
-- se llamaba la vieja, y las permisivas se combinan con OR: alcanza con que
-- sobreviva una de "cualquier authenticated" para que exigir is_admin() no
-- sirva de nada. Paso exactamente eso con `audit_log` en el edificio.
do $$
declare p text;
begin
  for p in select policyname from pg_policies
            where schemaname = 'public' and tablename = 'payment_integrations' loop
    execute format('drop policy if exists %I on public.payment_integrations', p);
  end loop;
end $$;

-- Patron del Sprint 1: nada de "cualquier authenticated". Solo el admin.
create policy payment_integrations_select on public.payment_integrations
  for select to authenticated using (public.is_admin());
create policy payment_integrations_insert on public.payment_integrations
  for insert to authenticated with check (public.is_admin());
create policy payment_integrations_update on public.payment_integrations
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy payment_integrations_delete on public.payment_integrations
  for delete to authenticated using (public.is_admin());

comment on table public.payment_integrations is
  'Conexion con la pasarela de cobro. Versionada el 20/ago/2026, reconstruida '
  'desde el codigo que la usa: se habia creado a mano y nunca se migro.';

-- ── PENDIENTE ANOTADO, NO RESUELTO ACA ──
-- Estas policies dejan el `access_token` LEGIBLE por cualquier admin del
-- negocio. Hoy ningun cliente lo pide —el service selecciona solo los campos
-- seguros— pero eso es una convencion del front, no una restriccion: un admin
-- puede pedir la columna por API y obtenerla.
--
-- El edificio ya no lo permite: alli la tabla tiene RLS y CERO policies, y el
-- token no sale de las edge functions (platform/migrations/0051).
--
-- No se cierra aca a proposito. Cambiar el acceso de una tabla de la que
-- dependen los cobros de tres negocios EN PRODUCCION, sin poder probarlo
-- —los proyectos estan pausados—, es como se rompen las cosas que andaban.
-- Va cuando se pueda aplicar y verificar con la base despierta.
