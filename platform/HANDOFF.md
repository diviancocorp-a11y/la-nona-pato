# HANDOFF — Dico, plataforma multi-rubro (para seguir en code)

> Punto de entrada para continuar. **Las secciones van de mas nueva a mas
> vieja: leer la primera.** Docs largos: `PLAN-ERP.md` (el plan vivo del ERP),
> `PLAN-MULTI-RUBRO.md`, `ARQUITECTURA-MODULAR.md`. SQL en `platform/`.
>
> Para retomar en un chat nuevo: **`/dico`**. Para cerrar: **`/cerrardico`**.

---

## 19/ago/2026 (tarde) — COBRO, MESAS Y ETAPA 6f (migraciones 0049-0050)

Cuatro commits. El edificio pasa de "construido" a **entregable a un local con
empleados**: hasta hoy, darle el panel a un mozo era darle el P&L.

### Estado

| | Donde esta |
|---|---|
| Base (`wwwzdgprsooyjgkuyoav`) | migracion **0050**, todo aplicado |
| Rama `platform/runtime-tenant` | **8423418** |
| Produccion (Vercel) | commit **483892c** — **12 commits atras** |

**Falta deployar.** `npm run deploy`. El asistente no puede: el clasificador de
permisos bloquea el comando de Vercel.

### Hecho

**Pantalla de cobro (6d cerrada).** `register_payment` y `order_balance`
existian desde 6d sin que nadie las llamara. El monto viene cargado con lo que
falta; dividir la cuenta es escribir menos, sin modo aparte. En efectivo
calcula el vuelto pero asienta lo COBRADO: guardar el billete entero haria que
el arqueo diera faltante todos los dias.

**0049 — medios de pago por defecto.** El seed quedo comentado en 0004 para
correrlo a mano; se corrio una vez y nunca mas. Los dos negocios nacidos del
alta self-service tenian CERO medios y no podian cobrar nada. Va como trigger
sobre `tenants`, mismo criterio que 0044.

**Alta de mesas y zonas (6c cerrada).** Sin migracion: todo estaba en 0045. En
modo acomodar se toca el plano y la mesa nace ahi, con el nombre siguiente y la
forma heredada. **Las zonas son un plano POR zona, con pestanias, y las
coordenadas pasaron a ser relativas a la zona** — decidido antes de que nadie
dibujara en serio, porque cambiarlo despues obliga a redibujar a mano.

**ETAPA 6f — roles con alcance.** `tenant_members` es
(tenant_id, user_id, branch_id, roles[]). Permisos declarados en
`src/modules/roles.js`, no en tabla editable. RLS real sobre expenses,
suppliers, sales, settings, staff, audit_log y cash_sessions. Pantalla de
equipo propia del edificio. La cocina no ve importes ni anula.

**Vitrina (`npm run vitrina`).** Sirve UNA pantalla sin base ni sesion,
interceptando `src/lib/supabase.js`. Cierra la deuda de "ninguna pantalla se
vio renderizada en un navegador". Seis escenas.

### Verificado

**Contra la base, con roles simulados** (`set_config('request.jwt.claims',...)`
+ `set local role authenticated`): un mozo no lee expenses, sales, settings,
suppliers, audit_log, cash_sessions ni nomina ajena; si ve productos; no carga
un gasto; al ascenderse a duenio el update afecta 0 filas; cierra un pedido y
la venta se asienta, y sigue sin ver el facturado.

**En el navegador, via vitrina:** cobro con cuenta dividida (dos medios hasta
saldar), alta de mesa tocando el plano (queda en 74.8%/79.7%, la zona correcta),
equipo con roles traducidos por rubro, y pedidos vistos por la cocina sin un
solo importe.

**726 tests, 4 checks del pre-commit, lint y build en verde.**

### Cuatro bugs que aparecieron ejecutando (ninguno leyendo)

1. **`audit_log` tenia dos policies select.** La nueva y `audit_select`, con el
   nombre viejo. Las permisivas se combinan con **OR**: la vieja anulaba la
   restriccion. Ahora se BARREN todas antes de crear las nuevas. Los delete de
   `staff` y `cash_sessions` tenian el mismo agujero.
2. **Un mozo no podia cerrar un pedido.** `complete_order` termina en
   `insert ... returning *` y el RETURNING exige poder LEER la fila; PostgREST
   lo agrega por defecto. Se resolvio haciendo la funcion definer con guard
   explicito, no aflojando la lectura de `sales`.
3. **Con una sola zona, el boton + mandaba `zone: null`**, creando una pestania
   "Sin zona" espuria. Lo agarro un test.
4. **La primera prueba de RLS fue un falso positivo**: el miembro ficticio no
   se habia insertado, asi que "no ve nada" era por no ser miembro.

### Lo que queda de 6f (decirlo con esas palabras)

- **El recorte `propio` esta a medias.** Se implemento el de la cocina (sin
  importes, sin anular). Falta que el mozo vea SUS mesas y SUS ventas, y que el
  encargado quede acotado a su sucursal: hoy el filtro es por modulo entero.
- **`accountant` y `marketer` no tienen pantalla propia.** El contador abre en
  Ventas, que es lo mas cerca que hay. Su pantalla es la lista de sus negocios
  (seccion 4.5) y no existe.
- **El alcance por sucursal no se ejerce en la UI.** `alcanza_branch` existe y
  las policies de caja lo usan, pero el panel todavia no deja elegir sucursal
  ni filtra por ella.
- **`role` sigue en la tabla**, deprecada y sincronizada por trigger. Se elimina
  cuando produccion este al dia y ningun consumidor la lea.

### Trampas nuevas

- **Reemplazar una policy por nombre no alcanza.** Si la vieja se llamaba
  distinto, sobrevive y anula la nueva. Barrer y recrear.
- **`check-supabase-columns.mjs` NO valida los selects embebidos** de PostgREST
  (`tenant_members(role, roles, branch_id)`). Paso en verde con el snapshot
  desactualizado, que es justo el bug que ese checker existe para atrapar.
- **La flakiness de los tests no era azar: era CPU.** Con un dev server
  corriendo fallan 3-4 al azar por timeout; sin el pasan los 726. `testTimeout`
  subio a 15s.
- **Un `insert ... returning` necesita permiso de SELECT**, no solo de INSERT.

### Pendiente inmediato

1. **Deployar** (12 commits). Lo corre Ricky.
2. Cerrar el recorte `propio` que quedo a medias.
3. 6g — opportunity engine, desbloqueado por los datos de 6b-6e.
4. MercadoPago multi-tenant: sigue siendo lo mas grande y lo que mas plata mueve.

---

## 19/ago/2026 — EL LOCAL FISICO: ETAPAS 0, 6a-6e (migraciones 0039-0048)

Sesion larga: 11 commits, **10 migraciones aplicadas**, 663 tests. El edificio
paso de "ERP a distancia" a tener sucursales, salon, caja, propinas y personal.

> **Doc de la etapa: `platform/PLAN-LOCAL-Y-ROLES.md` (v2).** Ahi esta el
> criterio que ordena todo y el registro de que se acepto y que se recorto de
> la revision contra Square/Toast/Fresha/Shopify/7shifts. Leerlo antes de
> seguir con 6f o 6g.

### ATENCION: la base esta ADELANTADA respecto de produccion

| | Donde esta |
|---|---|
| Base (`wwwzdgprsooyjgkuyoav`) | migracion **0048**, todo aplicado |
| Produccion (Vercel) | commit **483892c**, o sea hasta 6b |
| Rama `platform/runtime-tenant` | commit **a6cf0d1** (6e) |

**6c, 6d y 6e NO estan en produccion.** Son 7 commits sin deployar. No rompe
nada —las migraciones son aditivas y ninguna pantalla vieja usa las tablas
nuevas— pero lo que se ve en divianco.app no es lo que dice el repo.

Para deployar: `npm run deploy` (encadena Vercel + edge functions).

### El criterio que ordeno la etapa

**Barato ahora y caro despues -> entra ya, aunque no tenga pantalla.** Todo lo
que cambia la FORMA del dato (branch_id, ledger, business_date, audit log,
claves de idempotencia) se migro ahora; migrarlo con dos anios de operacion
cargada es reescribir. Lo que cuesta lo mismo siempre (pantallas, algoritmos)
espera al cliente que lo pida.

Ese criterio salio de discutir una revision externa que proponia agregar doce
cosas mas. Cada una era correcta por separado; sumadas eran mas trabajo que
todo lo construido hasta hoy, con cero clientes usando el edificio.

### Hecho

**Etapa 0 — idempotencia (0040) y audit log (0043).** El diagnostico previo
decia "falta idempotencia". Verificado contra el codigo: NO era eso.
`complete_order`, `signup_tenant` y `mp-webhook` ya la tenian y bien. Faltaba
en `submit-order`, `register_waste` y `register_purchase`. La clave se ata al
CONTENIDO de la operacion: generarla por llamada no sirve (dos clicks = dos
claves) y guardarla por sesion tampoco (la segunda compra del dia devolveria
la primera). Las firmas viejas de las RPC se eliminaron: si quedaran, una
llamada sin clave las elegiria por sobrecarga y perderia la garantia en
silencio.

El audit log es un trigger generico (no uno por tabla, que se desincroniza) y
guarda el DIFF `{columna: {antes, despues}}`, no la fila: una fila de settings
tiene 50 columnas y guardarla entera hace el log ilegible.

**6a — los ejes del alta (0039).** `operation_mode` (fisico/virtual/hibrido),
`channels[]`, `country`, `currency`, `timezone`. Modo y canales son DOS cosas
porque los canales son varios a la vez; meterlos en uno obligaria a inventar
`fisico_con_delivery`. El pais es el punto de entrada del adaptador fiscal:
solo AR tiene integracion y la UI lo dice en vez de prometerlo.

**6b — sucursales (0041) y el libro del stock (0042).** `branch_id` en lo que
ocurre EN un lugar, no en lo que es del negocio: un cliente que compra en dos
locales es un cliente, no dos. `business_date` calcula el dia operativo en la
zona del local y con hora de corte configurable.

El stock dejo de ser un numero: `inventory_movements` + `inventory_balances`
mantenido por trigger. El libro es de SOLO AGREGAR —se corrige con asiento
contrario— porque si se pudiera editar, el saldo cacheado quedaria mintiendo.
`ingredients.stock` NO se elimino: corre en paralelo hasta compararlo con
datos reales. Cambiar la fuente de verdad del stock a ciegas es el error caro.

**0044 — ninguna operacion nueva queda sin sucursal.** Con un trigger y no
tocando cada escritor: son media docena y crecen.

**6c — recursos y reservas (0045).** `appointments` ya tenia desde 0005 un
EXCLUDE que impide turnos solapados del mismo barbero; se agrego el equivalente
por recurso y se reuso todo lo demas. `staff_id` paso a nullable (una reserva
de mesa no tiene barbero) con un CHECK que exige al menos uno de los dos. El
status paso a flujo real: `booked -> confirmed -> arrived -> in_service ->
done`. Las senias se modelaron aunque el cobro llegue con MercadoPago. Waitlist
como entidad: `status='left'` es demanda perdida.

`MapaDeMesas.jsx`: coordenadas en PORCENTAJE (el mismo plano en el monitor y
en el telefono), dos modos sobre el mismo plano y **arrastre apagado por
defecto** — un toque torcido no puede mover una mesa en hora pico. Dibujar el
salon es opcional: lo no ubicado se reserva igual.

**6d — caja, comanda y Dicotip (0046, 0047).** `cash_sessions` existia desde
0004 sin usarse. Se agrego el indice unico de UNA caja abierta por sucursal, y
el esperado suma SOLO efectivo: lo de tarjeta no esta en el cajon y sumarlo
haria que el arqueo diera mal siempre.

No hay estado "cuenta abierta" (`orders.status` ya tiene `active`) ni tabla
para dividir la cuenta (`payments` ya soporta varios pagos por pedido).

Propinas como DOMINIO, no como campo: `employee_direct` (Dicotip, no pasa por
la caja), `employee_pool`, `merchant_collected`. Sin distinguirlos, el local
declara propinas que no recibio o el mozo cobra dos veces. `get_tip_target` es
publica y por SLUG, y devuelve el alias del mozo y NADA mas de el.

**6e — personal (0048).** Turnos con EXCLUDE por persona, disponibilidad
declarada por el EMPLEADO, ausencias, fichaje y costo laboral.

**La biometria no entra nunca.** WebAuthn guarda clave publica y contador; la
huella no sale del telefono. Geocerca y selfie quedaron como senial opcional:
acumular ubicacion e imagen de cada empleado todos los dias para resolver "que
no fiche un companiero" es desproporcionado cuando la passkey ya lo resuelve.

`labor_cost_vs_sales` cruza horas FICHADAS (no programadas: lo programado es
una intencion) por costo/hora contra las ventas del dia operativo.

**Reclasificacion del checker de columnas.** Los 4 avisos eran tres problemas
distintos: `activeTenant.js` mal clasificado; `account.js` e `infoPages.js`
son DUALES (bifurcan por `business.platform`) y el checker no lo contemplaba
—se agrego `DUAL_PATHS`, validados contra la union—; y el snapshot LEGACY
estaba viejo (5/jun, sin `waste_log`, `info_pages`, `push_subscriptions`).

### Verificado

**En produccion, con curl:** el checkout con la misma clave dos veces devuelve
el MISMO orderId con `deduplicated:true` y un solo pedido en la base. El alta
en divianco.app/registro muestra los 7 campos, 3 modos y 9 paises.

**Contra la base, con datos reales y limpieza** (~60 casos): merma y compra
idempotentes; el libro contesta "purchase 20, waste -3, adjustment -2 = 15";
rechaza update y delete; doble reserva de la misma mesa rechazada por el
EXCLUDE; `available_resources` no ofrece la mesa de 8 para 2 personas; arqueo
con faltante guarda -200 y cerrar de nuevo no lo pisa; la propina directa no
cambia el esperado en caja; turno solapado rechazado; jornada 20:00-04:00 da 8
horas y el MISMO dia operativo; costo laboral 12%; `staff_credentials` sin
ninguna columna biometrica (verificado contra `information_schema`).

**663 tests, build, 4 checks del pre-commit y lint en verde.**

### Tres bugs que aparecieron probando (y no antes)

1. **La clave del libro no incluia la cosa movida.** Una compra de 3 insumos
   con una sola clave chocaba en la segunda linea y el guard devolvia el
   movimiento de la primera: **la compra entraba INCOMPLETA y sin error**.
2. **Las escrituras nuevas quedaban sin `branch_id`.** El backfill de 0041
   llenaba lo historico pero no lo nuevo. Se detecto probando el checkout
   contra produccion. Arreglado en 0044.
3. **El CHECK del fichaje era `>` estricto.** Con una salida en el mismo
   instante que la entrada, el empleado quedaba con el fichaje ABIERTO PARA
   SIEMPRE, y una jornada abierta sigue sumando horas. Pasa a `>=`.

Los tres se encontraron ejecutando, no leyendo. Es el argumento a favor de
probar cada migracion contra la base antes de commitear.

### Lo que quedo A MEDIAS (decirlo con esas palabras)

- **No se puede crear una mesa desde la UI.** El boton "Nueva mesa" muestra un
  toast que dice que llega con el editor. Las 5 de `barberia-demo` se cargaron
  por SQL. Falta el formulario de alta de recursos.
- **No hay pantalla de cobro.** `register_payment` y `order_balance` existen en
  `platformCaja.js` pero nadie los llama todavia: la caja abre, arquea y
  cierra, pero el cobro sigue sin UI.
- **No hay pantalla para armar la semana.** `PersonalPanel` acepta un
  `onVerSemana` que el panel no le pasa. Se puede fichar y ver el costo, no
  programar turnos.
- **Dicotip no tiene ni QR impreso ni pantalla publica.** Las RPC
  (`get_tip_target`, `submit_service_review`, `register_tip`) estan probadas
  contra la base, pero falta la pagina que abre el cliente al escanear.
- **`agenda` y `variants` siguen en `implementado: false`.** Sus tablas estan
  desde 0005 y 0007; falta la UI. Un modulo en la nav sin pantalla es peor que
  uno ausente.
- **Ninguna pantalla de 6c/6d/6e se vio renderizada en un navegador.** El panel
  pide sesion y el asistente no la tiene: la verificacion fue por tests de
  render (34 casos). Si algo se ve mal, hay que mirarlo.

### Pendiente inmediato (en orden)

1. **Deployar.** `npm run deploy`. Hay 7 commits sin publicar.
2. **Cerrar los a-medias de arriba**, empezando por el alta de mesas y la
   pantalla de cobro: sin esas dos, 6c y 6d no se pueden usar de verdad.
3. **6f — vistas por rol.** El esquema completo (7 roles, que ve cada uno,
   donde abre) esta en la seccion 8 de `PLAN-LOCAL-Y-ROLES.md`. Incluye ampliar
   `tenant_members.role` y pasar a una fila por (tenant, usuario, sucursal) con
   `roles[]`.
4. **6g — opportunity engine.** Las reglas de Dico hoy son 9 y **todas son de
   higiene** ("te falta el precio"). La segunda familia —stock muerto, demanda
   perdida, clientes fuera de frecuencia, ocupacion baja— esta desbloqueada por
   los datos que dejo esta sesion.
5. **MercadoPago multi-tenant.** Sigue siendo lo mas grande que falta y lo que
   mas plata mueve. Bloquea las senias de reserva y el pre-cobro anti no-show.

### Bloqueado por Ricky

- **Deployar** (ver arriba). El asistente no puede: el clasificador de permisos
  bloquea el comando de Vercel.
- **El encuadre legal de la propina electronica.** El modelo contempla
  distribucion y settlement, pero la regulacion 2024 + LCT es cumplimiento, no
  arquitectura, y **no esta verificada**. Antes de que un mozo cobre por
  Dicotip, tiene que mirarlo un contador.
- **Verificar que "Dicotip" este libre** como marca y dominio. Va impreso en
  cada ticket. (El nombre anterior, "Tipco", ya estaba tomado.)
- **Probar el salon, la caja y el fichaje con datos reales.** Es la leccion que
  se repite: la Etapa 3 dio 4 correcciones al probarla, y esta sesion dio 3
  bugs mas al ejecutar contra la base. Nada de 6c-6e lo uso una persona.
- **Push sigue sin probarse de punta a punta** (`push_subscriptions` en cero,
  pendiente desde el 18/ago).

### Trampas nuevas para el que siga

- **El snapshot legacy no se puede regenerar**: los 3 proyectos estan pausados.
  Si falta una tabla, las columnas salen de `supabase/migrations/`.
- **Hay DOS `submit-order`** con codigo distinto: `supabase/functions/`
  (legacy) y `platform/functions/` (edificio). `scripts/deploy-functions.mjs`
  apunta al legacy; el del edificio es `platform/scripts/deploy-functions.mjs`,
  que arma un workdir temporal porque el CLI busca en `supabase/functions/`.
  Usar el equivocado sube el codigo legacy al edificio **sin fallar**.
- **La flakiness de los tests existe y se manifesto**: el pre-commit fallo una
  vez en los smoke tests (`utils.test.js` + `schemas.test.js`) y paso a la
  siguiente sin cambiar nada. Tambien habia 4 `async` sin `await` en
  `mapaDeMesas.test.jsx` que daban timeouts — se sacaron, pero el fallo del
  smoke es otro caso y sigue sin identificar.
- **Al probar RPC con el MCP de Supabase** hay que simular la sesion con
  `set_config('request.jwt.claims', ...)`: el MCP corre sin `auth.uid()` y
  todos los guards de membresia cortan. Y **no usar `raise` para revertir**: se
  lleva puesta la tabla temporal de resultados y el test devuelve vacio. Hay
  que limpiar con `delete` explicito.

---

## 18/ago/2026 — EL ERP QUEDO COMPLETO Y LA PERIFERIA CERRADA

Sesion larga: 12 commits, migraciones **0032 a 0038**, 3 edge functions.
El edificio pasó de "panel de productos y pedidos" a **ERP entero**: Etapas 4
(ventas y P&L), 5a (CRM) y 5b (cuenta del comprador), mas TODA la periferia
(merma, imagenes propias, push, QRs, paginas de info, equipo). Ademas Dico
capa 1 y el arreglo de las `og:` tags.

### Lo mas reutilizable que salio

**Antes de asumir que un RPC devuelve algo, mirarlo.** Escribi las RPCs de
push pidiendo `tenant_id` asumiendo que `get_tenant_brand` devolvia el `id`.
**No lo devuelve.** Verificarlo antes cambio el diseño: las RPCs publicas del
edificio reciben el **slug**, que ya viaja en la URL, y asi no hubo que
exponer un endpoint nuevo solo para traducir slug→uuid. Vale para
`upsert_push_subscription`, `get_info_page` y `resolve_qr`.

**Dos caminos de lectura, no uno.** Todo lo que un visitante SIN SESION tiene
que ver (paginas de info, QRs, catalogo) va por RPC con el slug; lo que edita
un miembro va por tabla con RLS. Mezclarlos obliga a exponer de mas.

**Portar no es copiar: revisar que se hereda.** Dos agujeros del legacy que
NO se portaron, los dos por la misma razon (lo que en una app de un negocio
esta acotado, en una plataforma se multiplica):

1. `admin-users` **pisa la contraseña** de un email que ya tiene cuenta. Aca
   cualquier dueño podria "agregar a su equipo" a otra persona y quedarse con
   su cuenta, incluidos los negocios que ella administra.
2. `upsert_push_subscription` aceptaba `role` sin validar. Los push de admin
   llevan nombre del cliente y monto.

### Hecho (todo aplicado, commiteado y pusheado)

**Etapa 4 — ventas y P&L (0032).** `sales` + RPC `complete_order`: completar
un pedido cambia el estado y asienta sus ventas en UNA transaccion (en el
legacy es un bucle de `createSale` desde el navegador). El costo se congela
dos veces: `submit-order` lo escribe al crear el pedido y `complete_order` lo
recalcula si vino en 0. El P&L del mes va **sin** el colchon de pricing — es
el doble conteo que ya se arreglo una vez el 12/jun.

**Etapa 5a — CRM (sin tabla nueva).** Correccion al plan: el CRM del legacy no
lee una tabla de clientes, **agrega sobre `orders`**. `addresses`/`favorites`
eran de otra mitad (la 5b).

**Etapa 5b — cuenta del comprador (0035).** Arreglaba **tres roturas
silenciosas**: `addresses`/`favorites` no existian, MyAccount leia `recipes`,
y —la que no estaba en el plan— **un comprador logueado no podia ver sus
propios pedidos** porque la unica policy de select de `orders` era para
miembros. Ninguna daba error: un `.select()` que falla devuelve `{error}`.
`addresses` y `favorites` **sin `tenant_id` a proposito**: son de la persona,
no del negocio. Se toco `orders_select`, asi que el test incluye la
no-regresion del dueño.

**Periferia completa:**

- **Merma (0033)** — RPC `register_waste`, asiento + descuento juntos.
- **Imagenes propias (0034)** — bucket `tenant-images`, UNO para todos,
  aislado por carpeta `<tenant_id>/`. Un bucket por tenant obligaria a
  provisionar infraestructura en cada alta self-service. El alta de producto
  pedia "Imagen (URL)": un panadero no tiene una URL.
- **Push (0036)** — UNA VAPID para toda la plataforma (identifica al SERVIDOR,
  no al negocio). `send-push` corta con 400 sin tenant: un fallback a "todos"
  seria notificarle a los clientes de otro local.
- **QRs y paginas (0037)** — `resolve_qr` resuelve y cuenta la visita en UNA
  llamada; desde un telefono recien escaneando, un segundo request a veces no
  llega. Por eso `incrementQrVisit` **no hace nada** en el edificio.
- **Equipo (0038)** — `tenant-users` + `find_user_id_by_email` (solo
  service_role: expuesto a `authenticated` seria un oraculo de emails
  registrados). No se puede sacar ni degradar al ultimo dueño.

**`og:` tags por tenant.** Compartir cualquier local por WhatsApp mostraba
"Cochi". La causa NO era el endpoint sino el ruteo: **Vercel resuelve el
filesystem antes que los rewrites**, y para `/` ya existe `index.html`, asi
que la regla por User-Agent nunca se evaluaba. Se resolvio con
**`middleware.js`** (Edge Middleware), que corre antes del filesystem. Va
defensivo: try/catch y cualquier duda termina en dejar pasar — corre en TODAS
las visitas de documento y una excepcion ahi tira el sitio entero.

**Reset de contraseña**: `/entrar` detecta `type=recovery` en el hash.

**morning-health reescrito**: miraba los 3 legacy pausados, o sea rojo todas
las mañanas. Ahora mira lo vivo (landing, tenants con conteo de productos,
`submit-order`, drift del snapshot, Sentry 24h).

**Dico capa 1**: `src/components/dico/DicoCara.jsx` + `dico.css`, 5 estados,
enchufado en `DicoAvisos` con la expresion atada al nivel del aviso mas grave
— o sea la misma informacion que el color. **SVG y no video**: los mp4 no
tienen canal alfa (el "fondo transparente" sale blanco; harian falta WebM/VP9
para Chrome y HEVC para Safari) y 13 clips pesan mas que toda la app, que se
usa desde el telefono de una cocina.

**Tooling**: `_chain.js` daba a todos los metodos del builder el MISMO
`vi.fn`, asi que un `not.toHaveBeenCalled()` no podia pasar nunca. Arreglado
(la trampa estaba anotada en este handoff y cai en ella igual).

### Verificado

**En produccion, con curl:** las `og:` tags por tenant (UA de WhatsApp da "La
Nona Pato", de Telegram en cochi da "Cochi", el humano recibe la SPA con 200);
los guards de las 3 edge functions (sin tenant 400, sin auth 401, y **con la
anon key —que es publica y viaja en el bundle— 401**); catalogo 200.

**Contra la base, con BEGIN/ROLLBACK:** ~50 casos entre las 7 migraciones. Lo
importante: aislamiento entre negocios en storage, push, paginas y QRs;
no-regresion del dueño al tocar `orders_select`; el colado que pide rol admin
queda como customer; anon no ve ni escribe nada.

**Estado de la base al cierre:** 7 tablas nuevas, 6 RPCs, bucket. Todo ahi.

**569 tests + build.** Una corrida fallo una vez y paso las 3 siguientes:
**hay flakiness**, no identificada.

### LO QUE NO SE PROBO (importante)

1. **Push de punta a punta: `push_subscriptions` tiene CERO filas.** Nadie
   activo el banner todavia, asi que no llego ninguna notificacion nunca. La
   VAPID publica esta en el bundle; la privada solo se puede comprobar con una
   llamada autorizada. **Hasta que alguien active el banner y entre un pedido,
   esto no esta probado.**
2. **Dico no se vio nunca con ojos humanos.** El pane del navegador no
   renderiza archivos locales. El ajuste fino de las curvas sale de mirarlo.
3. Las pantallas nuevas (equipo, QRs, paginas, favoritos, direcciones) estan
   deployadas pero **nadie las uso con datos reales**. Las listas de que probar
   estan al final de cada seccion del `PLAN-ERP.md`.

### Pendiente inmediato (en orden)

1. **Probar lo de arriba.** Son 3 etapas y toda la periferia sin tocar por un
   usuario real. La leccion de la Etapa 3 fue exactamente esa: probarla saco
   cuatro correcciones.
2. **MercadoPago multi-tenant** — lo mas grande que queda y lo que mas plata
   mueve: un negocio que no cobra online pierde ventas. OAuth por tenant.
3. Canales de venta y zona de riesgo (los `false` que quedan en
   `CAPACIDADES_EDIFICIO`).
4. Packs de rubro: agenda (barberia), variantes (retail), caja.
5. **Dico capa 3 (LLM)** — ya desbloqueada: su plan pedia Etapas 4 y 5, que
   estan. Pero antes conviene que el P&L se valide con datos reales: una IA
   que opina sobre numeros no probados dice cosas equivocadas con seguridad.

### Bloqueado por Ricky

- **Activar el banner de push y hacer un pedido.** Sin eso, push no esta
  probado (ver arriba). Las VAPID ya estan cargadas en Supabase y Vercel.
- **Mirar a Dico** y decir que se siente mal. Ricky genero 3 videos de
  animacion con sus prompts; **el asistente no puede reproducir video**, asi
  que si hay que ajustar curvas hace falta que describa el movimiento o mande
  capturas.
- **Decision: historial por telefono del invitado.** Hoy devuelve vacio A
  PROPOSITO. El RPC del legacy deja ver los pedidos de cualquier numero que
  se escriba; en una plataforma con muchos locales es el mismo agujero
  multiplicado. Tres salidas planteadas en el `PLAN-ERP.md` (portarlo igual /
  scopear a tenant + ultimos N dias / pedir el codigo de pedido).
- **Decision: que pasa con `main`.** Sigue congelada sirviendo a los 3 legacy.
  Cuanto mas conviven las ramas, mas se parece a una bifurcacion permanente.
- **Secrets opcionales del morning-health**: `PLATFORM_SUPABASE_*` (activa el
  check de drift) y `SENTRY_*` (activa el de errores) en GitHub Actions. Sin
  ellos anda igual, saltea esos dos checks. **OJO**: el cron corre desde
  `main`; hasta el merge, probarlo con workflow_dispatch eligiendo la rama.

### Trampas nuevas para el que siga

- **Al probar aislamiento, ojo con dos cosas.** (a) El dueño de prueba es
  miembro de los 6 tenants, asi que "escribir en la carpeta de cochi" **esta
  permitido** y parece un bug: hay que crear un tenant sin membresia dentro de
  la transaccion. (b) Al pasar a rol `anon` hay que **limpiar
  `request.jwt.claims`**; si quedan las del usuario anterior, `auth.uid()`
  sigue devolviendo su id y el "anonimo" ve todo.
- **Los deploys NO salen del push.** Van por CLI
  (`npx.cmd vercel --prod --scope diviancocorp-a11ys-projects --yes`). Se
  verifico: hubo commits pusheados sin deployar durante horas.
- **PowerShell rompe los here-strings** con parentesis o comillas en el texto.
  Para commits largos, `git commit -F archivo.txt`.

---

## 16/ago/2026 (noche) — CORRECCIONES DE LA ETAPA 3, PROBADA EN PRODUCCION

Ricky probó la Etapa 3 con datos reales y salieron cuatro cosas. Migración
0031. **Dico quedó planificado en `PLAN-DICO.md`** (capas 1 y 2 primero, la
del LLM recién después de las Etapas 4 y 5; personaje sin piernas dentro de la
app, con piernas sólo para marketing).

1. **Una compra volvió a ser UN movimiento.** 0030 la partía en una fila por
   categoría de alimento, copiando al legacy. En pantalla no se sostiene: la
   lista reescribe la descripción de toda compra de materia prima a
   `Compra · <proveedor>`, así que las filas quedaban **idénticas** y parecían
   varias compras al mismo proveedor — la etiqueta por la que se partía
   ("Secos", "Lácteos") no se ve en ningún lado. Ahora el desglose viaja
   dentro de `items` (cada línea con su `food_category`) y no se pierde nada.
   **La lección: si el que carga no puede distinguir dos filas en pantalla,
   están mal partidas.** El criterio no puede ser sólo qué necesita el cálculo.
2. **`suppliers.scope`.** `category` dice de qué rubro es el proveedor y sirve
   para leerlo, no para filtrar: la carnicería salía en el desplegable de
   "Registrar gasto". `scope` (insumos | servicios | ambos) decide en qué
   pantalla aparece. Default `ambos` para no hacer desaparecer nada, y el alta
   inline hereda el contexto (desde un gasto nace `servicios`).
3. **`ToggleSwitch` mostraba un interruptor pelado.** `label` iba sólo a
   `aria-label` y `hint` **ni siquiera era una prop** — se descartaba en
   silencio. Los dos lugares que pasaban las dos cosas esperando verlas
   ("Este proveedor factura" y el **"Tengo local físico"** de la marca, que ya
   estaba así en producción) mostraban un switch sin una palabra de qué
   prendía. Con lector de pantalla se entendía; mirando, no.
4. **Barbería también stockea.** Compra gel, toallas y repuestos: eso es una
   compra que ingresa mercadería, no un gasto suelto. `stock` pasó a estar en
   los tres rubros. Lo que la barbería no tiene es **receta** — nadie carga
   cuánto gel lleva un corte, así que `usaReceta` sigue siendo sólo de gastro.

**Verificado contra la base:** la compra mixta da 1 fila con el desglose
adentro, y el insumo sin clasificar sigue cayendo en `dry` sólo en gastro.
499 tests.

**Trampa para el que escriba tests: ARREGLADA el 18/ago.** En
`src/test/_chain.js` todos los métodos del builder eran **el mismo** `vi.fn`,
así que `.in` acumulaba también los `.eq` y los `.order`, y un
`not.toHaveBeenCalled()` no podía pasar nunca. Ahora cada método tiene su
propio mock (siguen devolviendo `self`, así que encadenar funciona igual).
Se corrió la suite entera al cambiarlo: 569 tests, ninguno dependía de la
acumulación. Los tests viejos que filtran por argumento siguen siendo
correctos, sólo que ya no hace falta.

---

## 16/ago/2026 (tarde) — ETAPA 3: GASTOS, COMPRAS Y PROVEEDORES

El edificio ya sabía cuánto cuesta producir (Etapa 2). Ahora sabe cuánto sale
todo lo demás. Migración 0030 + dos RPCs.

### Lo más reutilizable que salió

**Antes de portar una tabla, buscar quién la escribe hoy.** El plan pedía
`expenses`, `suppliers` y `purchases`. `purchases` y `purchase_items` existen
en el legacy desde el schema inicial y **ninguna pantalla las escribe**: una
compra son N filas de `expenses` (una por categoría de alimento, con el
detalle en `items` jsonb) más los ajustes de stock. `fetchPurchases` estaba en
`services/finance.js` sin un solo llamador. Un `grep` al principio se ahorra
una etapa de trabajo inútil.

**Regla nueva del molde: si toca varias filas y es plata, va a una RPC.** Es
la primera etapa que no se resuelve solo con tabla + service. Anular un gasto
y registrar una compra eran bucles desde el navegador con un rollback escrito
a mano en JavaScript — si el navegador se cierra en el medio, queda mercadería
ingresada sin su gasto. Ahora son `void_expense` y `register_purchase`, las
dos `security invoker`: la RLS sigue decidiendo quién toca qué, lo único que
cambia es que todo pasa en una transacción. Los guards contables (no anular
dos veces, no anular una anulación, no tocar un mes cerrado) viven en la DB, y
el email de quien anula sale del token y no de lo que mande el cliente.

**La trampa de los hijos que guardan solos volvió a aparecer**, tal como
estaba anotado: `ExpForm` y `Purchase` cargan y crean **proveedores** por su
cuenta, salteando cualquier saver de la pantalla que los contiene. Se revisó
antes de portar, así que esta vez no costó un bug.

### Hecho

- **0030**: `suppliers` y `expenses` con las mismas columnas del legacy +
  `tenant_id`. `expenses` **no tiene policy de DELETE** a propósito: un gasto
  se anula, no se borra, y esa regla la sostiene la base y no la buena
  voluntad de la pantalla.
- **Índice único de proveedores** por `(tenant_id, lower(btrim(name)))` —
  novedad contra el legacy, donde el campo era texto libre y generó duplicados.
  El `btrim` no es cosmético: sin él `"  Carniceria"` entraba como fila nueva.
  Se probó y pasaba.
- **`FinanzasPanel`**: las tres pantallas entran como UNA pestaña con tres
  solapas. La barra inferior se usa con el pulgar y seis ítems no entran.
  `Suppliers` va con `asPage` porque su raíz normal es `.ag-page-over`, que
  esconde el topbar y el nav — el bug de esta mañana, ahora con test.
- **Registry**: `finanzas` en los tres rubros; `contabilidadUsar` solo en
  gastro. Ningún componente pregunta por el vertical.
- **`schema:sync` ahora lee `.env.scripts`.** Con el archivo ya creado seguía
  respondiendo "sin credenciales — salteado", que se lee como "no hace falta"
  y deja el snapshot viejo sin que nadie se entere.

### Decisiones que conviene conocer

- **Un insumo sin `food_category` se resuelve por rubro.** En gastro cae en
  `dry` como el legacy: dejarlo sin clasificar lo sacaría del costo de comida
  del P&L y el food cost daría más bajo de lo real, en silencio — y no es raro,
  porque el alta rápida de insumo dentro de la compra no pide la categoría. En
  barbería y retail queda sin `usar_category`.
- **La foto del ticket quedó apagada.** Necesita un bucket de Storage y el
  edificio no tiene ninguno (las imágenes de producto se cargan pegando una
  URL). Se apagó entera con `permiteComprobante={false}` en vez de dejar un
  botón que falla.

### Verificado

**Contra la base, con `BEGIN`/`ROLLBACK`:** la compra completa (agregación de
líneas repetidas, stock, costo, desglose por categoría) y la anulación; y 11
casos negativos — insumo de otro negocio, compra vacía, tenant ajeno, anular
dos veces, anular una anulación, anular un mes cerrado, borrar un gasto,
proveedor duplicado (con y sin espacios), mismo nombre en otro negocio, y el
insumo sin clasificar en gastro vs barbería.

**Solo tests y build:** 494 tests. **Nadie lo tocó todavía con un usuario
real** — la lista de qué probar está al final de la Etapa 3 en `PLAN-ERP.md`.

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
