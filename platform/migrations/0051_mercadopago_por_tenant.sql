-- 0051 MercadoPago por tenant (Argentina). Aplicada via MCP 19/ago/2026.
--
-- EL PROBLEMA
-- El legacy cobra con MP, pero con UNA cuenta: la del negocio, en env vars y en
-- una tabla sin `tenant_id`. En el edificio cada negocio cobra en SU cuenta, y
-- eso cambia dos cosas que no son detalles:
--
--   1. El token deja de ser configuracion y pasa a ser DATO DE UN TENANT.
--   2. El webhook llega sin decir de quien es. Hay que resolverlo sin creerle
--      a quien golpea la puerta.
--
-- POR QUE TOKEN MANUAL Y NO OAUTH
-- MP no habilita OAuth para las apps de tipo "Integracion propia", que es lo
-- que crea su wizard por default. El negocio copia su Access Token productivo y
-- lo pega. Es lo que hacen Tienda Nube y el resto de las plataformas de la
-- region, y es lo que ya resolvio el legacy en `mp-connect-manual`.
--
-- ── EL TOKEN ES EL ACTIVO MAS SENSIBLE DEL EDIFICIO ──
-- Con el se puede cobrar en nombre del negocio y leer sus ventas. Por eso esta
-- tabla tiene RLS habilitada y CERO POLICIES: eso no es un olvido, es la
-- decision. Sin policies, ningun `anon` ni `authenticated` puede leerla,
-- escribirla ni listarla — ni siquiera el duenio del negocio. Solo la service
-- role la toca, y solo desde edge functions.
--
-- El panel nunca recibe el token: pregunta el ESTADO a `mp-status`, que
-- devuelve si esta conectado y a que cuenta, nunca el secreto.
--
-- Queda pendiente y dicho: el token se guarda en claro. Cifrarlo con Vault es
-- el paso siguiente, y no se hace ahora para no atar la primera version a una
-- pieza mas. Hoy lo que lo protege es que la tabla es inalcanzable desde el
-- cliente.

create table if not exists public.payment_integrations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,

  provider text not null default 'mercadopago'
    check (provider in ('mercadopago')),

  -- El secreto. Ver la nota de arriba.
  access_token text not null,
  public_key text,

  -- El id de la cuenta MP. Sirve para dos cosas: mostrarle al negocio a que
  -- cuenta quedo conectado, y detectar que pego el token de otra cuenta.
  external_user_id text,
  mp_nickname text,
  mp_email text,

  -- Los tokens de prueba de MP empiezan con TEST-. Distinguirlo evita el peor
  -- de los malentendidos: creer que se esta cobrando de verdad.
  live_mode boolean not null default true,

  -- Secreto de la firma del webhook, que MP da aparte del token. Es opcional
  -- porque el negocio puede no configurarlo, pero sin el no se puede verificar
  -- que la notificacion vino de MP.
  webhook_secret text,

  is_active boolean not null default true,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_payment_integrations_tenant
  on public.payment_integrations(tenant_id, provider) where is_active;

-- Una sola integracion activa por negocio y proveedor: si hubiera dos, cual
-- cobra seria cuestion de suerte.
create unique index if not exists payment_integrations_una_activa
  on public.payment_integrations(tenant_id, provider) where is_active;

alter table public.payment_integrations enable row level security;
-- SIN POLICIES A PROPOSITO. Ver la cabecera.

comment on table public.payment_integrations is
  'Credenciales de cobro por tenant. RLS habilitada y sin policies A PROPOSITO: '
  'solo la service role la toca, desde edge functions. El panel consulta el '
  'estado por `mp-status` y nunca recibe el access_token.';

/* ──────────────── El pedido tiene que poder contar su pago ──────────────── */

alter table public.orders
  add column if not exists payment_external_id text,
  add column if not exists payment_status text,
  add column if not exists paid_at timestamptz;

-- Por este indice entra el webhook: llega con el id del pago de MP y tiene que
-- encontrar la orden sin recorrer la tabla entera de todos los negocios.
create index if not exists idx_orders_payment_external
  on public.orders(payment_external_id) where payment_external_id is not null;

comment on column public.orders.paid_at is
  'Cuando MP confirmo el pago. Es lo que distingue "esperando pago" de '
  '"pago acreditado", y lo que hace idempotente al webhook: MP reintenta.';

/* ─────────────── El estado que espera la plata ─────────────── */

-- `pending_payment` ya existe en el check de 0012. Lo que faltaba era que una
-- orden en ese estado NO cuente como pedido: hasta que MP no confirme, no hay
-- plata y no tiene por que aparecerle a la cocina.
comment on column public.orders.payment_status is
  'Estado del pago segun MP: approved, pending, in_process, rejected, refunded, '
  'cancelled. No confundir con `status`, que es el estado del PEDIDO.';
