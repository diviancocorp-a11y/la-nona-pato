# HANDOFF — Dico, plataforma multi-rubro (para seguir en code)

> Punto de entrada para continuar. **Leer la seccion 00 primero** (lo mas
> reciente), despues la 0. Docs largos: `PLAN-MULTI-RUBRO.md`,
> `ARQUITECTURA-MODULAR.md`, `DEMO-REAL-VS-MOCK.md`. SQL en `platform/`.
>
> Para retomar en un chat nuevo: **`/dico`**. Para cerrar: **`/cerrardico`**.

---

## 00. Actualizacion 14/ago/2026 — EL ALTA SELF-SERVICE FUNCIONA

**El producto se llama Dico. Divianco es la empresa.** No son
intercambiables: textos legales y copyright -> Divianco; marketing y
producto -> Dico. `dico.app` esta tomado por un tercero, por eso la
plataforma se queda en `divianco.app`.

**Probado punta a punta en produccion (14/ago):** alta nueva completa
(registro -> mail -> confirmacion -> tenant creado -> redirect al subdominio)
y recuperacion de una cuenta huerfana via login. Las dos OK.

### Hecho en esta sesion

**Correo (Resend)** — dominio `send.divianco.app`, region sa-east-1.
Los 4 registros DNS verificados a mano en Cloudflare (DKIM, MX, SPF, DMARC).
SMTP cargado en Supabase Auth. Limite de envio: 30 mails/hora en Supabase,
pero **el techo real es Resend free = 100/dia**; subir Supabase sin subir el
plan de Resend solo mueve donde rebota.

**Signup self-service** (`/registro`, `/bienvenido`, `/entrar`):
- `0016`+`0019` `signup_tenant()`: sin argumentos, toma la identidad de
  `auth.uid()` y lee los datos del negocio del `raw_user_meta_data`. NO se
  reuso `provision_owner` porque recibe el `user_id` como parametro: darle
  grant a `authenticated` dejaria crear tenants a nombre de otro. Es
  idempotente — devuelve el tenant existente con `already_existed=true`.
- `0020`+`0021` slugs reservados: UNA fuente en SQL (`is_reserved_slug`) y
  una en JS (`tenantHost.js`), con un test que las compara parseando la
  migracion. Incluye los subdominios de correo y `dico`.
- Los datos del negocio viajan en `user_metadata`, NO en localStorage: el
  mail se confirma a veces desde otro dispositivo.

**Login** (`/entrar`) — *nacio de un bug real*: en la primera prueba el Site
URL de Supabase estaba en `localhost:3000`, el redirect fallo y quedo una
cuenta CONFIRMADA sin forma de entrar. Resuelve los dos casos con la misma
llamada gracias a la idempotencia de `signup_tenant`. Los mensajes de error
son **ambiguos a proposito** (no distinguen mail inexistente de clave
incorrecta): precisarlos permitiria enumerar cuentas.

**Ciclo de vida** (`0017`) — `status` / `activated_at` / `first_order_at` /
`last_activity_at` + triggers. `release_dormant_tenants()` agendada con
pg_cron (4am UTC): a los 45 dias sin un solo producto, el slug se libera
(se RENOMBRA a `dormant-<id>`, no se borra). Ataca la ocupacion del
namespace, que es el danio caro, sin friccion en el alta.

**Rename a Dico** — landing, signup, bienvenida, login, manifest, favicon
generado, y el catalogo/admin legacy. Los identificadores internos
(`HermesMark`, `HERMES_BUSINESS_COPY`) y los nombres de infraestructura
(repo, proyecto Supabase, proyecto Vercel) se dejan: renombrarlos rompe
imports y deploys a cambio de nada.

### Bloqueado por Ricky
- Nada critico. Si abre el registro al publico, vigilar el consumo de
  Resend (100 mails/dia en el plan free).

### Pendiente inmediato (en orden)
1. **El panel del admin no esta conectado al edificio.** Un tenant nuevo se
   registra, entra a su subdominio y NO TIENE DONDE CARGAR PRODUCTOS. Es el
   bloqueante para que el signup sirva de algo. Bloque grande.
2. **Module registry por vertical**: hoy una barberia ve "Recetas" y el
   filtro "Vegetariano". La UI sigue siendo la gastronomica.
3. Formulario de contrasena nueva tras el reset (el link ya cae en
   `/entrar` con sesion, falta el form).
4. `og:` tags por tenant — compartir por WhatsApp muestra la marca del
   build. Necesita render en el edge.
5. `unit_cost` en 0: sin modelo de costos, el P&L no da.

---

## 0. Actualizacion 12/ago/2026

**Deploy vivo:** https://hermes-platform-sigma.vercel.app — proyecto Vercel
`hermes-platform` (`prj_3WSWrxws27VLbIDebl8mDqyTPxCC`), aparte de los 3 legacy.
OJO: `hermes-platform.vercel.app` SIN el `-sigma` es de un tercero (proyecto PHP),
no es un deploy roto. Se deploya por CLI (`npx vercel --prod`), NO por git: el WIP
del edificio no esta commiteado y pushear a main redeployaria los 3 legacy.

**Decisiones tomadas esta sesion:**
1. Un solo proyecto Vercel para TODOS los tenants, con el tenant resuelto en
   RUNTIME por hostname — no un proyecto por cliente. Un proyecto por cliente
   hace imposible el alta self-service (habria que crear carpeta + proyecto +
   envs + deploy por cada registro).
2. Wildcard `*.<dominio-propio>` para dar a cada tenant su puerta. Vercel NO da
   wildcard en `*.vercel.app`, asi que esto exige dominio comprado (pendiente).
3. Orden: checkout -> runtime multi-tenant + wildcard + signup self-service ->
   recien despues ERP y migracion de los 3 legacy.

**Por que ese orden:** migrar los 3 legacy = reconstruir el ERP entero
multi-tenant. Legacy `orders` tiene 42 columnas y `settings` 47; el edificio no
tiene `recipes`, `ingredients`, `recipe_ingredients`, `settings`, `customers`,
`expenses` ni `sales`. Un cliente NUEVO en cambio arranca vacio y no necesita
nada de eso, asi que el signup puede salir meses antes que la migracion.

**Hecho (checkout del edificio):**
- `0012_checkout_core`: `orders` de 8 a 25 columnas (envio, pago + snapshot
  anti-spoof, propina, descuento, regalo, cupon), `order_items.subtotal`,
  tabla `coupons` con RLS por tenant, `rate_limits` + `check_rate_limit`.
- `0013_get_catalog_v2_checkout`: **fix** — v1 mandaba `sold_out_override:false`
  y eso significa "forzar agotado" (ver src/lib/stockAvailability.js), asi que
  TODO el catalogo salia AGOTADO. Va `null`. Ademas expone `payment_accounts`
  (filtradas server-side: sin cuentas de proveedor) y `delivery_pricing`.
- `platform/functions/submit-order/index.ts`: version multi-tenant, deployada
  con verify_jwt=false. Probada: pedido OK, aislamiento entre tenants OK
  (producto de otro tenant -> 400), sin tenant_slug -> 400.
- `src/services/catalog.js`: manda `tenant_slug` solo si `business.platform`.

**Hecho (resolucion de tenant en runtime, 13/ago/2026):**
- Dominio `divianco.app` + wildcard `*.divianco.app` en el proyecto, cert
  emitido. DNS en Cloudflare: `A @` y `A *` -> 76.76.21.21, **DNS only /
  nube gris** (Cloudflare free no proxea wildcards).
- `0014_tenant_host_resolution`: `tenants.domain` (dominio propio del cliente),
  CHECK de formato de slug + lista de slugs RESERVADOS (que nadie registre
  `www`, `admin`, `api`...), y RPC publico `get_tenant_by_host`.
- `src/lib/tenantHost.js`: parseo puro host -> tenant/root/unknown. 14 tests
  en `src/test/tenantHost.test.js` (incluye multi-nivel, reservados y
  dominios que se le parecen). Suite completa: 313 tests OK.
- `src/lib/activeTenant.js`: subdominio sincronico (sin red), dominio propio
  via RPC, fallback a `business.slug` para local y previews.
- `src/services/catalog.js`: `fetchCatalog` y `submitOrder` usan el slug
  resuelto por hostname, no el del build.
- `src/pages/PlatformLanding.jsx` + gate en App.jsx: la raiz sirve landing,
  no el catalogo de nadie (antes `fetchCatalog` devolvia null y el catalogo
  lo leia como "Supabase caido").

VERIFICADO en produccion: `mala-miga.divianco.app` sirve los 8 productos de
Mala Miga y `barberia-demo.divianco.app` los suyos, DESDE EL MISMO BUILD que
tiene `CLIENT=hermes-cochi` horneado. `divianco.app` sirve la landing.

**Lo que sigue acoplado al build (el `<head>`):** para TODOS los tenants,
`document.title` dice "Cochi", el meta `theme-color` es `#c91b14` y el favicon
apunta a `/clients/hermes-cochi/favicon.png`. Los genera el plugin de
vite en index.html. Falta tambien el manifest PWA por tenant. El `--ac` del
catalogo SI sale bien (viene del sistema de temas, no de business.js).

**Pendiente inmediato:**
- Verificar el formulario de checkout en un browser real (el pane headless de
  la sesion no entrega clicks a React; el carrito SI funciona, verificado por
  DOM click).
- `tenants.settings` de cochi tiene delivery_pricing y prep_time_min, pero
  `payment_accounts` VACIO a proposito = solo efectivo. No cargar CBU/alias
  inventados en un negocio real.
- `unit_cost` de order_items va en 0: el edificio no tiene modelo de costos.
- Consola del catalogo: `fetchSettings` (App.jsx:107) sigue pegandole a la
  tabla `settings` que no existe en el edificio, y falta el RPC
  `get_weekly_top`. Ninguno bloquea el pedido.
- Los placeholders `__BIZ_TITLE__`, `__BIZ_SUPABASE_URL__` y 6 mas quedan sin
  reemplazar en el HTML — bug PREEXISTENTE del build, pasa igual en local.

---

## 1. Que estamos haciendo

Pivot de hermes-gastro (SaaS single-vertical gastro) a **plataforma multi-rubro
multi-tenant**: gastro / barberia / ropa, en UN codebase y UNA base de datos
compartida con RLS por `tenant_id`. Los 3 gastro viejos estan dormidos y se
consolidan como tenants del edificio nuevo (no se migra data transaccional).

## 2. Infra

| Que | Valor |
|-----|-------|
| Org Supabase | `lidtvkdatrcxcpmvioup` |
| **Edificio** (proyecto nuevo) | `hermes-platform` ref `wwwzdgprsooyjgkuyoav`, sa-east-1 |
| URL | https://wwwzdgprsooyjgkuyoav.supabase.co |
| anon/publishable key | `sb_publishable_8gMlo42jYdK8epcD-Zr9TQ_eKmY2nW-` |
| service role | solo del dashboard, NUNCA en repo/chat |
| gastro viejos (PAUSADOS, data intacta) | cochi `nzrzfknvlnddpexghynq` · mala-miga `tszcksppdglktcmzgepd` · la-nona-pato `rewzotanfurutjolghkf` |

Free tier = 2 proyectos activos. Hoy solo `hermes-platform` activo. Para leer los
gastro viejos hay que pausar uno y restaurar el otro (reversible, tarda minutos).

## 3. DB del edificio (migraciones aplicadas, en `platform/migrations/`)

- **0001** fundacion: `tenants`, `tenant_members`, `products` (con `type`:
  composite|simple|variant_parent|service) + RLS. Helper `current_user_tenants()`.
- **0002** helper movido a schema `private` (linter).
- **0003** core Pedidos: `orders`, `order_items`.
- **0004** POS/Caja: `payment_methods`, `cash_sessions`, `payments` (split).
- **0005** pack barberia: `staff`, `appointments` (exclusion constraint anti-solape),
  `products.duration_min`.
- **0006** `btree_gist` a schema `extensions`.
- **0007** pack ropa: `product_variants` (talle/color/sku/barcode/stock),
  `store_credits`, `product_returns`, `products.stock`.
- **0008** auth: `profiles` + `provision_owner()` (tenant+owner+profile atomico).
- **0009** `products` gana category/description/image_url.
- **0010** `products.requires_age_gate` (+18 mala-miga).
- **0011** `get_catalog(slug)` RPC publico (shape de catalog-pro).

Patron RLS (toda tabla de negocio): `tenant_id uuid not null references
tenants(id)` + `enable row level security` + policies `using/with check
(tenant_id in (select private.current_user_tenants()))`.

Advisors de seguridad: **limpio salvo 2 warnings INTENCIONALES** de `get_catalog`
(es endpoint publico, anon debe poder llamarlo).

Test de aislamiento (correr si tocas RLS): `platform/tests/tenant_isolation.sql`
(SQL rapido) y `platform/tests/isolation_e2e.mjs` (RLS real via API con JWT).

## 4. Tenants y datos actuales

| slug | vertical | datos |
|------|----------|-------|
| la-nona-pato | gastro | 43 productos, 10 cat (sin desc/img: backfill pendiente) |
| cochi | gastro | 10 productos, 4 cat (con desc+img) |
| mala-miga | gastro | 11 productos, 5 cat (2 con +18) |
| barberia-demo | barber | 2 barberos, 2 turnos demo, 1 servicio |
| tienda-demo | retail | 1 producto padre + 3 variantes (S/M/L) |

Catalogo gastro real portado (recipes -> products composite). Las imagenes
apuntan al storage de los proyectos viejos (viven mientras existan; copiar
buckets = paso aparte).

## 5. Auth (decidido: por script)

- **`platform/scripts/create-owner.mjs`**: recibe email+name+vertical+slug ->
  crea auth user -> `provision_owner` (tenant+owner+profile atomico) -> si el
  vinculo falla, borra el user (rollback). Exporta `createOwner()` para reuso.
- Reusa lo mismo: el test e2e y, en B6, el boton de signup self-service.
- Correr con env `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
  Requiere `npm i @supabase/supabase-js`. (No se corrio en la sesion: necesita
  service role.)
- **`platform/scripts/attach-owner.mjs`** (15/ago): linkea un dueno a un tenant
  que YA existe — los 5 portados/demo, que se cargaron sin dueno y por eso no
  se les podia abrir el panel. Usa la RPC `attach_owner` (migracion 0024), que
  es idempotente. `create-owner` no servia para esos: crea el tenant.
  `node platform/scripts/attach-owner.mjs --email x@y.com --slug cochi`

## 6. Front (reuso de hermes-gastro)

- Build nuevo tipo "platform": `.env.hermes-cochi` (apunta al edificio) +
  `clients/hermes-cochi/business.js` (`platform: true`, `slug: 'cochi'`).
- `src/services/catalog.js` -> `fetchCatalog()` bifurca: si `business.platform`,
  usa RPC `get_catalog(slug)`; si no, deja el camino viejo (single-tenant sobre
  `recipes`) intacto para los clients legacy.
- Se reusa TAL CUAL: `src/catalog-pro/*`, `src/contexts/AuthContext.jsx`,
  `src/components/admin/LoginScreen.jsx`, `src/lib/supabase.js`
  (env `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`).
- Correr (git bash): `bash platform/dev-cochi.sh` o
  `cd ~/Proyectos/hermes-gastro && npm install --include=dev && CLIENT=hermes-cochi npm run dev`.

## 7. Operativo vs pendiente

**Operativo hoy:** catalogo publico de cochi (home/categorias/producto) leyendo
del edificio via `get_catalog`.

**Pendiente para dejar todo vivo:**
1. Deploy de edge functions al edificio: `submit-order`, `validate-coupon`,
   `mp-*`, + RPCs `get_server_time`, `upsert_customer` (para el checkout).
   Recordar `verify_jwt=false` en las publicas (bug #6 CLAUDE.md).
2. `attach_owner` + login admin + apuntar Orders/Stock/Finance al edificio.
3. Module registry (`src/modules/registry.js`) + nav que se arma segun
   `tenant.vertical` (Recetas|Servicios|Productos, etc.).
4. UI de los packs: agenda (barberia) y grilla de variantes (ropa).
5. B6: signup self-service (boton -> `createOwner`).
6. Backfill desc/imagenes de LNP; copiar buckets de storage.

## 8. Gotchas (de CLAUDE.md + esta sesion)

- NO escribir via el mount Linux; solo herramientas del lado Windows. UTF-8 strict.
- `NODE_ENV=production` global se come devDeps -> `npm install --include=dev`.
- git bash: env var inline (`CLIENT=x npm run dev`), NO `set CLIENT=x&&` (eso es CMD).
- Toda tabla nueva: tenant_id + policy patron + test de aislamiento ANTES (TDD).
- `get_catalog` SECURITY DEFINER expuesto a anon = intencional (endpoint publico).
- Restaurar proyecto pausado tarda varios minutos y la conexion "flapea" al final.

## 9. Orden sugerido para seguir

1. `attach_owner` + correr `create-owner` -> login admin del edificio andando.
2. Edge functions `submit-order` (+deps) al edificio -> checkout vivo.
3. Module registry + nav por vertical.
4. UI packs barberia/ropa.
5. B6 signup self-service.
