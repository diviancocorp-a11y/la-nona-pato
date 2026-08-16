# HANDOFF — Dico, plataforma multi-rubro (para seguir en code)

> Punto de entrada para continuar. **Las secciones van de mas nueva a mas
> vieja: leer la primera.** Docs largos: `PLAN-ERP.md` (el plan vivo del ERP),
> `PLAN-MULTI-RUBRO.md`, `ARQUITECTURA-MODULAR.md`. SQL en `platform/`.
>
> Para retomar en un chat nuevo: **`/dico`**. Para cerrar: **`/cerrardico`**.

---

## 16/ago/2026 — EL PANEL DEL EDIFICIO EXISTE Y EL ERP EMPEZO A MUDARSE

Sesion larga (19 commits, migraciones 0022 a 0029). El edificio paso de "un
cliente se registra y no tiene donde cargar nada" a tener panel con productos,
pedidos, configuracion, stock y recetas con costo real.

### El metodo que salio de esta sesion (lo mas reutilizable)

Las pantallas del admin legacy **no le hablan a la base, le hablan a un
service**, y los calculos (`useFinancials`) son funciones puras. De las tres
capas —pantalla, service, tabla— **se rehace una sola**.

Cada pantalla se porta asi: se le inyecta el saver por prop con **default
legacy** (asi el admin viejo no cambia en nada) y se apaga por `capacidades`
lo que dependa de tablas que todavia no estan. Encender un modulo despues es
cambiar un `false` por `true`. El molde completo esta en `PLAN-ERP.md`.

**Trampa que ya nos mordio:** al portar una pantalla hay que revisar si sus
**componentes hijos escriben por su cuenta**. `CatChipsEditor` y
`PaymentAccountsEditor` llamaban a `updateSettings` directo, salteando el
`onSave` inyectado. En el edificio eso es un cambio que no persiste y no
avisa — y en cuentas de pago era el dueno cargando su CBU, viendo el toast de
exito, y un checkout que seguia sin cuentas.

### Hecho

**Panel del edificio** (`src/pages/PlatformAdmin.jsx`) — panel NUEVO, no una
bifurcacion del legacy: `pages/Admin.jsx` carga recipes, ingredients, sales,
expenses y waste_log, y de eso el edificio no tiene ninguna tabla. Lo decide
`business.platform` en la ruta `/admin`, igual que `fetchCatalog`. **Los dos
paneles conviven y no comparten una sola tabla: no intentar unificarlos.**

**`attach_owner` (0024)** + `platform/scripts/attach-owner.mjs` — vincula un
dueno a un tenant que YA existe. Los 5 portados/demo se habian cargado sin
dueno y por eso nadie podia abrirles el panel. Ya estan los 7 con dueno.

**Registry de rubros** (`src/modules/registry.js`) — declara QUE ES cada rubro
(como se llama lo que vende, que campos carga, que modulos tiene). Ningun
componente vuelve a preguntar `vertical === 'barber'`. `implementado:
true|false` es la unica fuente de verdad de que existe hoy; la nav filtra por
ahi, asi que declarar un modulo futuro no ensucia la UI.

**Etapa 0 — settings en tabla (0025).** Fue tabla y no jsonb porque el bug
recurrente del repo (campo que se agrega a la UI, no al Zod, y se descarta en
silencio) tiene toda su red de contencion construida alrededor de columnas.
**El puente es lo importante:** habia dos lectores del jsonb en produccion
(`get_catalog` y la edge function `submit-order`). En vez de migrar los tres a
la vez —todo o nada, con plata en juego— la tabla es la verdad y un trigger
espeja al jsonb las claves que ellos leen. Siguen andando sin tocarlos.
**No escribir `tenants.settings` a mano: se pisa en el proximo guardado.**

**Etapa 1 — stock (0026).** `Stock.jsx` reusada con `onUpsert`/`onArchive`
inyectados. Indice unico parcial por `(tenant_id, lower(name))` sobre no
archivados. `adjustStock` **no es atomico**: lee y escribe en dos pasos;
cuando los pedidos descuenten stock solos tiene que pasar a RPC.

**Etapa 2 — recetas y costo (0028).** **No se porto `Recipes.jsx`**: en el
legacy "receta" y "producto" eran la misma fila, y en el edificio esa fila ya
es `products`. Traerla habria dejado dos lugares para cargar lo mismo. La
receta se edita dentro del formulario del producto. **Combos pospuestos** por
decision explicita (son recursivos, media etapa de complejidad, un cliente
nuevo no los necesita el primer dia).

**Tooling que se arreglo en el camino** (todo esto fallaba en silencio):
- `check-supabase-columns.mjs` medía TODO contra el schema legacy y ademas
  solo entendia `.select('literal')` — los archivos con `.select(COLS)` se
  salteaban ENTEROS. Los "✓ N archivos validan" incluian archivos que ni
  miraba. Ahora distingue las dos bases (`PLATFORM_PATHS`) y resuelve
  constantes de modulo.
- `npm run schema:sync` **ahora existe** (antes la doc lo mencionaba y no
  estaba), sobre el RPC `schema_snapshot()` (0023). Y hay un guard offline de
  frescura que corre en el pre-commit sin credenciales.
- `check-integrity-all` armaba UN comando con los ~225 paths de `src/`: al
  cruzar el limite de 8191 caracteres de Windows **dejo de dejar commitear**.
  Va por lotes.
- Los scripts de `platform/scripts/` no corrian en Windows
  (`import.meta.url === file://argv[1]` nunca da true con backslashes): salian
  con codigo 0 sin hacer nada.

### Bugs de esta sesion que vale conocer (todos fallaban sin avisar)

1. **Aislamiento entre tenants.** Las lecturas se apoyaban solo en RLS, que
   dice "las filas de cualquier tenant del que seas miembro" — correcto como
   frontera de seguridad, **inutil como filtro de alcance**. Con un dueno en
   5 tenants, el panel de cada uno mostraba los productos de todos. **RLS
   decide QUE PODES ver; el filtro por `tenant_id` decide QUE ESTAS MIRANDO.
   Hacen falta los dos.** Nunca hubo filtracion a terceros.
2. **El panel sin engranaje ni nav.** Las pestanias usaban `ag-page-over` como
   contenedor raiz: es un overlay full-screen y `admin-shared.css` tiene una
   regla que esconde el topbar y el bottom nav mientras exista uno en el DOM.
   El chrome se renderizaba y quedaba tapado — el DOM estaba perfecto, asi que
   leyendo el codigo no se veia nada raro.
3. **La marca del build en todos los tenants.** El login leia `settings`, que
   desde 0025 tiene RLS, y sin sesion caia al `business` compilado: todos
   decian "Cochi". Se resolvio con el RPC publico `get_tenant_brand` (0027).
   El `<title>` tenia lo mismo: `applyTenantHead` solo se llama desde
   `Catalog.jsx`, nunca desde `/admin`.
4. **`Number(null)` es 0.** El colchon de merma no se aplicaba: la pantalla
   mostraba `waste_pct ?? 5` (5%) y el costeo calculaba `Number(null)` (0%).
   Misma familia que `Number('')` en el precio, dos veces en un dia. Ahora
   null/undefined/'' es "sin definir" y un **0 explicito sigue valiendo 0**.
   0029 ademas puso defaults en la DB para que no haya una tercera lectura.
5. **El PWA no se podia actualizar.** La deteccion de version nueva andaba,
   pero `reload` era un `location.reload()` pelado y el service worker volvia
   a servir el build cacheado. Ni Ctrl+Shift+R ni cerrar todas las pestanias
   alcanzaban. `src/lib/hardReload.js` vacia los caches antes de recargar, y
   lo usan el banner **y** el rescate por chunk roto de `App.jsx` — ese
   segundo era peor: recargaba, el SW devolvia el mismo index con el mismo
   chunk inexistente, y el usuario quedaba con la pantalla rota.

### Verificado

**En produccion, por Ricky:** el panel entero (productos, pedidos, config,
stock, recetas), la separacion por tenant con datos reales, la terminologia
por rubro, el costo y el margen con el colchon aplicado. Quedaron 2 insumos y
2 lineas de receta cargadas de esas pruebas.

**Contra la base, con `BEGIN`/`ROLLBACK`:** `attach_owner` (idempotencia y los
3 guards), el puente de settings (escribir en la tabla se refleja en
`get_catalog` sin pisar lo que la tabla no modela).

**Solo tests y build:** 462 tests. Lo que NO se probo con un usuario real es
el checkout del edificio de punta a punta desde que existe la tabla settings.

### Pendiente inmediato

1. **Etapa 3 del `PLAN-ERP.md`**: compras, gastos y proveedores. Alimenta el
   otro lado del P&L y depende de la 1, que ya esta.
2. **`order_items.unit_cost` sigue en 0.** Ya hay con que calcularlo (la
   receta existe); falta que `submit-order` lo escriba al confirmar el pedido.
   Va con la Etapa 4, que es la que necesita ese dato.
3. Encender en la config del edificio lo que sigue apagado: QRs, paginas de
   info, pasarelas, canales de venta, zona de riesgo. Cada uno con su tabla.
4. Las `og:` tags siguen siendo las del build (compartir por WhatsApp muestra
   la marca equivocada). Necesita render en el edge — el `<title>` ya se
   arreglo, esto no.

### Bloqueado por Ricky

- **Nada tecnico.** Los scripts leen las credenciales de `.env.scripts`
  (ignorado por git), asi que no hace falta exportar nada por terminal.
- **Una decision, sin urgencia:** que pasa con `main`. Hoy sirve a los 3
  negocios legacy y esta congelada (0 commits desde que salio la rama). La
  rama lleva +9465 lineas, casi todo archivos nuevos, con 104 borradas
  repartidas en 10 archivos legacy — **no hay riesgo de conflicto**. Pero
  cuanto mas tiempo convivan las dos, mas se parece a una bifurcacion
  permanente. Las salidas son mergear cuando el edificio este maduro, o que
  esta rama pase a ser la principal y main quede archivada.

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
