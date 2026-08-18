# Plan: traer el ERP viejo al edificio

> Estado al 15/ago/2026. El edificio tiene catálogo, checkout, alta
> self-service y un panel de dos pantallas. Todo el resto del ERP vive en el
> sistema viejo, contra una base por negocio.

---

## La idea que hace esto posible

El panel viejo ya está partido en tres capas:

```
pantalla React  →  service (src/services/*.js)  →  tabla
```

Las pantallas **no le hablan a la base**: le hablan a un service. Y los
cálculos pesados (`useFinancials`) son funciones puras sobre arrays, sin
Supabase adentro.

Eso cambia el tamaño del trabajo. No hay que reescribir el ERP: hay que
**mover las tablas conservando los nombres de columna, reescribir la capa de
services para que filtre por tenant, y reusar las pantallas casi tal cual.**

De las tres capas, se rehace una.

**Regla de oro de cada etapa:** si una pantalla necesita cambios de fondo para
funcionar contra el edificio, es señal de que la tabla se portó con un shape
distinto. Corregir la tabla, no la pantalla.

---

## Lo que NO entra en este plan

- **La data transaccional de los 3 negocios viejos.** Este plan trae la
  *funcionalidad*, no los pedidos históricos de La Nona Pato. Migrar la data
  es un proyecto aparte y se decide después, con el ERP ya andando.
- **Facturación AFIP.** Sigue detrás del feature flag `E_INVOICE`. Certificados,
  homologación y responsabilidad legal no son un ítem de checklist.

---

## Etapa 0 — Settings por tenant ✅ HECHA (15/ago)

Se resolvió con **tabla**, y salieron tres cosas que cambian el resto del plan:

**1. El puente.** Había dos lectores del jsonb en producción (`get_catalog` y
la edge function `submit-order`). En vez de migrar los tres a la vez —todo o
nada, con plata en juego— la tabla es la verdad y un trigger espeja las claves
que ellos leen de vuelta al jsonb. Siguen andando sin tocarlos. **Este patrón
sirve para cualquier etapa que tenga lectores en producción.**

**2. Las pantallas se gatean, no se bifurcan.** `Settings.jsx` (1010 líneas) se
reusó entero. El acople era *una sola línea* — `updateSettings(s)` — que ahora
es un prop `onSave` con default legacy. Las zonas que dependen de tablas que
todavía no existen se apagan con un prop `capacidades`, y **se encienden
cambiando un `false` por `true`** cuando llega su etapa. El admin viejo no
cambió en nada.

**3. Cuidado con los editores que guardan por su cuenta.** `CatChipsEditor` y
`PaymentAccountsEditor` llamaban a `updateSettings` directo, salteando el
`onSave` de la pantalla que los contiene. En el edificio eso es un cambio que
no persiste y no avisa — y en el caso de las cuentas de pago, un dueño cargando
su CBU, viendo el toast de éxito, y un checkout que sigue sin cuentas. **Al
portar una pantalla, revisar si sus hijos escriben solos.**

Lo que falta encender acá: QRs, páginas de info, pasarelas, canales de venta y
zona de riesgo — cada uno cuando llegue su tabla.

<details>
<summary>La decisión original (por qué tabla y no jsonb)</summary>

**Es la que bloquea a todas las demás, y hay que decidirla antes de empezar.**

El legacy tiene una tabla `settings` de 47 columnas, con una fila por negocio.
El edificio tiene `tenants.settings`, un jsonb hoy casi vacío. Prácticamente
toda pantalla del ERP lee de ahí: horarios, costos fijos, targets, medios de
pago, zona de delivery.

Las dos salidas son legítimas y hay que elegir una:

| | jsonb en `tenants.settings` | tabla `settings` con `tenant_id` |
|---|---|---|
| Migrar columna nueva | no requiere migración | ALTER TABLE |
| Validación | sólo en Zod | la DB también |
| Pre-commit actual | no lo cubre | `check-schema-sync` ya lo cubre |
| Reuso de `Settings.jsx` | hay que adaptar cada `set(...)` | casi directo |

**Recomendación: tabla.** El bug recurrente de este repo (#54, #56, #96 — campo
que se agrega a la UI, no al Zod, y se descarta en silencio) tiene su red de
contención construida alrededor de una tabla con columnas. Con jsonb esa red
no aplica y el bug vuelve.

**Entregable:** migración `settings` con `tenant_id` + RLS, service
`platformSettings.js`, y `Settings.jsx` apuntado al edificio.

</details>

---

## Etapa 1 — Stock ✅ HECHA (15/ago)

| | |
|---|---|
| Tabla | `ingredients` (migración 0026), mismas columnas que el legacy |
| Service | `platformInventory.js` |
| Pantalla | `Stock.jsx` reusada con `onUpsert` / `onArchive` inyectados |
| Registry | `stock.implementado = true` |

El método funcionó tal como se esperaba: **tres puntos de acople** en 649
líneas de pantalla. La merma queda apagada con `permiteMerma={false}` — vive
en `waste_log`, que es de la Etapa 6.

Dos cosas que se agregaron sobre el legacy:
- **Índice único parcial** por `(tenant_id, lower(name))` sobre los no
  archivados. Dos insumos con el mismo nombre siempre es error de carga, y
  además rompe el costeo cuando la Etapa 2 tenga que resolver por nombre.
- `adjustStock` está documentado como **no atómico**: lee y escribe en dos
  pasos. Alcanza mientras el único que ajusta es el operador; cuando los
  pedidos descuenten stock solos (Etapa 2) tiene que pasar a ser una RPC.

---

## Etapa 2 — Recetas y costos ✅ HECHA (16/ago)

| | |
|---|---|
| Tabla | `product_ingredients` (migración 0028) |
| Service | `platformRecipes.js` — costeo en funciones puras |
| Pantalla | `RecipeEditor` **dentro** del formulario de producto |

**No se portó `Recipes.jsx`.** En el legacy "receta" y "producto" eran la misma
fila de `recipes`; en el edificio esa fila ya es `products`. Traer la pantalla
habría dejado dos lugares para cargar lo mismo. La receta se edita donde se
edita el producto, y el costo y el margen se muestran ahí — que es el momento
en que sirven, cuando se está poniendo el precio.

**Combos pospuestos** (decisión del 16/ago): son productos hechos de otros
productos y el costeo se vuelve recursivo. Cerca de la mitad de la complejidad
de la etapa para algo que un cliente nuevo no necesita el primer día.

Decisiones que quedaron:
- **Sin receta, el margen es `null`, no 100%.** Con costo 0 el margen daría
  100% y todo el catálogo parecería rentabilísimo. Una mentira cómoda es peor
  que un dato ausente.
- El `type` pasa a `composite` solo cuando el producto tiene insumos.
- Guardar la receta **no es atómico** con guardar el producto. Si falla la
  segunda parte, el mensaje lo dice: "se guardó el producto, pero la receta
  no" — en vez de un "no se pudo guardar" que haría pensar que se perdió todo.

**Falta para cerrar el círculo:** `order_items.unit_cost` sigue en 0. Ya hay
con qué calcularlo; hay que hacer que `submit-order` lo escriba al confirmar
el pedido. Va con la Etapa 4, que es la que necesita ese dato.

---

## Etapa 3 — Compras, gastos y proveedores ✅ HECHA (16/ago)

| | |
|---|---|
| Tablas | `expenses`, `suppliers` (migraciones 0030 y 0031) |
| RPCs | `void_expense`, `register_purchase` |
| Services | `platformFinance.js`, `platformSuppliers.js` |
| Pantallas | `Expenses` + `Purchase` (Finance.jsx) y `Suppliers.jsx`, reusadas |
| Registry | `finanzas.implementado = true`, en los tres rubros |

**`purchases` no existe, y era un error del plan.** `purchases` y
`purchase_items` están en el legacy desde el schema inicial y **ninguna
pantalla las escribe**: la pantalla de Compras registra filas en `expenses`
(una por categoría de alimento, con el detalle en `items` jsonb) y ajusta el
stock. `fetchPurchases` quedó en `services/finance.js` sin un solo llamador.
Portarlas habría sido portar código muerto. **Antes de portar una tabla,
buscar quién la escribe hoy.**

**Dos operaciones se fueron a RPC.** Es la primera vez que una etapa no se
resuelve solo con tabla + service, y el criterio es el que va a valer de acá
en adelante: *si toca varias filas y es plata, va a la base*. Anular un gasto
y registrar una compra eran bucles de llamadas desde el navegador, con un
rollback escrito a mano en JavaScript — si el navegador se cierra en el medio,
queda mercadería ingresada sin su gasto. Las dos van `security invoker`: la
RLS de siempre sigue decidiendo quién toca qué, lo único que cambia es que
todo pasa en una transacción. Los guards contables (no anular dos veces, no
anular una anulación, no tocar un mes cerrado) se mudaron a la DB.

**Una compra es UN movimiento (0031, corrección tras probarla).** 0030 la
partía en una fila por categoría de alimento, copiando al legacy. Visto en
pantalla no se sostiene: la lista reescribe la descripción de toda compra de
materia prima a `Compra · <proveedor>`, así que las 2 o 3 filas quedaban
**idénticas** y parecían tres compras distintas al mismo proveedor — la
etiqueta por la que se partía ("Secos", "Lácteos") no se ve en ningún lado.

Ahora es una fila por compra, que es lo que efectivamente pasó, y el desglose
por categoría viaja **dentro de `items`** (cada línea lleva su
`food_category`). No se pierde nada: el P&L saca el total de `amount` y el
desglose sumando el jsonb, en vez de agrupando filas. `usar_category` queda
siempre en null para las compras — una fila mixta no tiene una sola categoría
USAR, y que a veces la tenga y a veces no es peor que no tenerla nunca. Lo que
marca que es mercadería es `category = 'Materia Prima'`.

**La lección:** el criterio para partir filas no puede ser sólo qué necesita el
cálculo. Si el que la carga no puede distinguir dos filas en pantalla, están
mal partidas.

**Un insumo sin `food_category` se resuelve por rubro.** En gastronomía cae en
`dry` como en el legacy: dejarlo sin clasificar lo sacaría del costo de comida
del P&L y el food cost daría más bajo de lo real sin que nada avise — y no es
un caso raro, porque el alta rápida de insumo dentro de la compra no pide la
categoría. En barbería y retail queda sin clasificar: meter un gel en
"Comida — Secos" es inventarle contabilidad de restaurante a quien no la lleva.

**`suppliers.scope`: qué le comprás (0031).** `category` dice DE QUÉ rubro es
el proveedor (Carnicería, Servicios) y sirve para leerlo, no para filtrar: la
carnicería aparecía en el desplegable de "Registrar gasto", donde no tiene nada
que hacer. `scope` es otra pregunta — `insumos` van a stock y se cargan por
Compra, `servicios` por Gasto, `ambos` aparece en las dos. Default `ambos`,
para que ningún proveedor ya cargado desaparezca de un lado sin explicación.
El alta inline hereda el contexto: desde un gasto nace `servicios`, desde una
compra nace `insumos`.

**Barbería también stockea.** Compra gel, toallas y repuestos, y necesita saber
cuándo se le acaban: eso es una compra que ingresa mercadería, no un gasto
suelto. Lo que no tiene es **receta** — nadie carga cuánto gel lleva un corte.
`stock` pasó a estar en los tres rubros; `receta` sigue siendo sólo de gastro.

**Navegación:** las tres pantallas entran como **una sola** pestaña (`Gastos`)
con tres solapas, en `FinanzasPanel`. La barra inferior se usa con el pulgar y
seis ítems no entran. Además son el mismo momento del día: se carga la compra,
se ve cuánto salió, y si el proveedor no estaba se crea ahí.

Lo que quedó apagado a propósito:
- **La foto del ticket.** Necesita un bucket de Storage y el edificio no tiene
  ninguno (las imágenes de producto se cargan pegando una URL). Con
  `permiteComprobante={false}` la sección no se muestra y no se exige — pedir
  una foto que no se puede subir dejaría el botón de confirmar trabado.
- **La clasificación USAR** fuera de gastronomía (`usaContabilidadUsar`).

### Qué probar

En **la-nona-pato** (gastro, tiene 2 insumos cargados):
1. Gastos → Registrar gasto: descripción, monto, categoría. Aparece en la
   lista con el total del mes actualizado.
2. Compra → agregar los 2 insumos con precios nuevos → Confirmar. Tienen que
   pasar **tres** cosas: **un solo** gasto nuevo en la solapa Gastos, el stock
   subió en la pestaña Stock, y el margen del producto que los usa cambió.
   Abrir ese gasto: adentro tienen que estar **todos** los productos comprados.
3. Proveedores → crear uno de tipo **Servicios**. Volver a Gastos → Registrar
   gasto: tiene que estar en el desplegable. Crear otro de tipo **Insumos**:
   ese **no** tiene que aparecer ahí, pero sí al registrar una compra. Pausar
   uno → desaparece de los desplegables, sigue en el gestor.
4. Anular un gasto del mes: el original queda tachado y aparece la reversión
   en verde. El botón "Ver reversión ↗" salta de uno al otro.
5. Intentar crear un proveedor con un nombre que ya existe → mensaje claro,
   no un error de base.
6. En el formulario de proveedor, el interruptor "Este proveedor factura"
   tiene que decir qué es. Antes era un interruptor pelado, sin una palabra.

**Casos negativos** (lo que NO tiene que pasar):
- En **barberia-demo**: al cargar un gasto **no aparece** el desplegable
  "Categoría USAR". La solapa Compra **sí** existe — una barbería compra gel.
- En **cochi**: los gastos y proveedores de la-nona-pato **no se ven**. Es el
  mismo dueño en los dos, así que es RLS + filtro por `tenant_id`.

---

## Etapa 4 — Ventas y P&L ✅ HECHA (16/ago) — falta aplicar 0032 y deployar

| | |
|---|---|
| Tabla | `sales` (migración 0032) — columnas del legacy + `tenant_id`, `order_id`, `payment_method` |
| RPC | `complete_order` — estado + ventas en una transacción |
| Service | `platformSales.js` (+ adaptadores puros para las pantallas legacy) |
| Pantallas | `SalesView` + `MonthSummary` en `VentasPanel` (dos solapas) |
| Registry | `ventas.implementado = true`, en los tres rubros |

**PENDIENTE DE ESTA SESIÓN (16/ago, noche):** el clasificador de permisos
bloqueó el MCP de Supabase, así que la migración 0032 **NO está aplicada** en
la base y `submit-order` **NO está redeployada**. El código está completo y
testeado (532 tests, build OK) pero el panel va a fallar al cargar ventas
hasta aplicar la migración. Pasos: 1) aplicar `platform/migrations/0032` (MCP
`apply_migration`), 2) redeployar `platform/functions/submit-order` con
`verify_jwt=false`, 3) correr las pruebas de abajo.

**Completar un pedido va por RPC.** En el legacy es un bucle de `createSale`
desde el navegador (`useOrderWorkflow`), una llamada por item: si el navegador
se cierra en el medio quedan ventas de un pedido sin completar. Mismo criterio
que la Etapa 3: varias filas + plata = la base. `complete_order` guarda
estado y ventas juntos, con guards (`ya_completado`, `pedido_cancelado`,
`ya_tiene_ventas` como cinturón anti-duplicado).

**El costo se congela dos veces, y la segunda manda.** `submit-order` calcula
`order_items.unit_cost` con la receta del momento del pedido (best-effort: si
el costeo falla, el pedido sale igual con 0 — un cliente no puede quedarse sin
comprar por una falla del costeo interno). `complete_order` usa ese costo
congelado, y si vino en 0 —pedidos viejos, receta cargada después— lo
recalcula con la receta actual y lo escribe también en `order_items`: los dos
libros dicen lo mismo.

**El P&L del mes va SIN el colchón** (`costoBruto`, no `costoReceta`): merma%
y gastos% proyectados son de PRICING. Aplicarlos al mes además de restar los
gastos reales es el doble conteo del 12/jun. `MonthSummary` recibe esa
función ya elegida desde `VentasPanel`.

**SalesView era otro hijo que guarda solo** (`createSale` importado directo),
tal como estaba anotado en el molde. Ahora recibe `onCreate` con default
legacy. La venta manual del edificio congela `unit_cost` con la receta actual
en el momento de guardar.

**Sin doble conteo en la pantalla:** las ventas que `complete_order` asienta
llevan `order_id`. SalesView recibe los pedidos completados + solo las ventas
manuales (`order_id` null); el P&L recibe TODAS las ventas. Pasarle las dos
cosas enteras mostraría cada pedido dos veces.

**`sales` no tiene UPDATE ni DELETE** (mismo criterio que `expenses`): una
venta se corrige por reversión, no editando historia. El legacy tenía
`deleteSale` en el service y ninguna pantalla lo llamaba.

Decisiones de alcance:
- **Los KPIs de `Home.jsx` no se portaron**: el panel del edificio no tiene
  Home — se entra por Productos. El resumen del mes cumple ese rol. Si algún
  día hay pestaña Inicio, `useFinancials` sigue siendo reusable tal cual.
- **Pedidos completados ANTES de la Etapa 4 no tienen ventas asentadas** (se
  completaron con un update pelado). Aparecen en la solapa Ventas (vía
  pedidos) pero no en el P&L. No se backfillea: son pedidos de prueba.
- La pantalla del mes usa la receta ACTUAL para el costo (comportamiento
  legacy de MonthSummary); el costo congelado por venta queda en la tabla para
  cuando el resumen lo aproveche.

Lo que le dejó la Etapa 3 para resolver (sigue vigente para UsarPnL): **las
compras llegan siempre con `usar_category` en null**. El total sale de
`amount` filtrando por `category = 'Materia Prima'`; el desglose por tipo de
comida, de sumar el jsonb `items`.

### Qué probar

Primero aplicar 0032 y redeployar submit-order (ver arriba). Después, en
**la-nona-pato**:
1. Aparece la pestaña **Ventas** en la barra (ícono de gráfico), con dos
   solapas: Ventas y Resumen del mes.
2. Hacer un pedido desde el catálogo con un producto QUE TENGA receta →
   en Pedidos, avanzarlo hasta **Completar**. Tienen que pasar tres cosas:
   el pedido queda Completado, la venta aparece en la solapa Ventas (con el
   nombre del cliente), y el Resumen del mes suma el ingreso con costo real.
3. Completar el MISMO pedido de nuevo (recargando la página para forzarlo):
   mensaje "ya estaba completado", sin venta duplicada.
4. Registrar una **venta manual** desde la solapa Ventas: aparece como "Venta
   manual" y el total del mes la suma una sola vez.
5. En el Resumen: los ingresos por medio de pago ya NO caen todos en "Sin
   especificar" (el pedido trae su medio de pago).

**Casos negativos:**
- En **barberia-demo**: la pestaña Ventas existe, pero el Resumen NO muestra
  P&L USAR, Menu Engineering ni Food Cost teórico.
- En **cochi**: las ventas de la-nona-pato no se ven (mismo dueño, RLS +
  filtro por tenant).
- Cancelar un pedido y después intentar completarlo: "Un pedido cancelado no
  se puede completar".

---

## Etapa 5a — Clientes en el panel ✅ HECHA (17/ago)

| | |
|---|---|
| Tablas | **ninguna nueva** (corrección al plan, ver abajo) |
| Service | `platformCrm.js` — agregación pura sobre `orders` |
| Pantalla | `CRM.jsx` reusada, como solapa Clientes dentro de Ventas |

**La corrección al plan (paso 0 del molde, otra vez):** el plan listaba
`addresses` y `favorites`, pero el CRM del legacy **no lee ninguna tabla de
clientes** — `fetchCustomerStats` agrega sobre `orders`, y los pedidos del
edificio ya traen nombre, teléfono, email y dirección. `addresses` y
`favorites` son de OTRA mitad: la cuenta del comprador en el catálogo
(AuthContext / MyAccount / CheckoutScreen), que es la **Etapa 5b** de abajo.
Mismo caso que `purchases` en la Etapa 3.

Decisiones:
- **CRM vive como tercera solapa de Ventas** (Ventas · Resumen · Clientes),
  no como pestaña propia: seis ítems no entran en la barra del pulgar, y es
  el mismo momento — cuánto se vendió y a quién.
- **`fetchCustomerStats(tenantId)` hace su propia consulta sin límite**: el
  panel carga 100 pedidos para operar, pero el total gastado de un cliente
  viejo necesita la historia entera. La tendencia por cliente (▲▼) sí se
  calcula sobre los 100 cargados — suficiente para 30/60 días.
- **Apagado por prop en el edificio:** `permiteCumple` (usa
  `customers.birth_date` + edge function `birthday-gift`, no existen) y
  `permitePromos` (crea cupones con el shape legacy `kind`/`label` que la
  tabla del edificio no tiene). El export (CSV/Excel/PDF) queda: es puro
  cliente. CRM era otro hijo que cargaba solo — ahora recibe `onFetchStats`.

### Qué probar (después del deploy)

En **la-nona-pato**, pestaña Ventas → solapa Clientes:
1. Aparecen los clientes de los pedidos reales, consolidados (mismo teléfono
   = un cliente), ordenados por total gastado, con su último pedido.
2. El buscador filtra por nombre/teléfono/email. El botón de exportar genera
   el Excel con los filtros.
3. **NO** aparece la tarjeta "Regalo de cumpleaños" ni el botón de promos al
   tocar un cliente (apagados en el edificio).
4. En **cochi**: los clientes de la-nona-pato no se ven (mismo dueño).

## Etapa 5b — La cuenta del comprador ✅ HECHA (18/ago)

| | |
|---|---|
| Tablas | `addresses`, `favorites` (migración 0035), RLS por `user_id` |
| Service | `account.js` — bifurca por `business.platform`, como `fetchCatalog` |
| Pantallas | `AuthContext` y `MyAccount`, sin consultas inline |

Arreglaba **tres roturas silenciosas** del edificio: AuthContext consultaba
`addresses`/`favorites`, que no existían; MyAccount leía `recipes` para los
favoritos; y un comprador logueado **no podía ver sus propios pedidos**,
porque la única policy de select de `orders` era para miembros del negocio.
Ninguna tiraba error: un `.select()` que falla devuelve `{error}`, así que la
cuenta quedaba vacía y parecía que el usuario no tenía nada.

**`addresses` y `favorites` NO llevan `tenant_id`, y es a propósito.** La
regla del repo ("toda tabla nueva: tenant_id + RLS por tenant") vale para las
tablas del NEGOCIO. Estas son de la PERSONA: una dirección es de quien vive
ahí, no de la panadería. Con `tenant_id`, el mismo comprador tendría que
volver a escribir su dirección en cada local de la plataforma. El aislamiento
lo da `user_id` — cada uno ve lo suyo y **ni el dueño del local ve la libreta
de direcciones de sus clientes** (lo que necesita para entregar viaja en el
pedido, en `orders.delivery_address`).

**`profiles` pasó a ser una fila por PERSONA.** Nació en 0008 para el dueño,
con `tenant_id` y sin policy de INSERT: un comprador no podía tener perfil.
Ahora suma `name`/`phone`/`nickname` y puede crear el suyo (`id = auth.uid()`).
`profiles.tenant_id` queda por compatibilidad pero **no es la verdad de qué
administra alguien**: Ricky es dueño de 6 tenants y esa columna guarda uno
solo. Esa verdad vive en `tenant_members`. Por lo mismo `updateProfile` hace
**upsert** en el edificio: con `update` el comprador guardaba su nombre, veía
el éxito, y no se persistía nada.

**Se tocó una policy de la tabla de plata**, así que el test incluye la
no-regresión: el dueño **sigue viendo los dos pedidos** de su local. Lo que se
suma es el caso del dueño del pedido, sin aflojar nada de lo anterior.

**Verificado contra la base** (BEGIN/ROLLBACK, 10 casos con dos compradores
sintéticos): Ana guarda su dirección y no puede escribir la de Beto; favorito
duplicado rechazado; Ana ve su pedido pero no el de un invitado; Beto no ve
nada de Ana; el dueño sigue viendo los pedidos pero **no** la libreta de Ana;
y el anónimo no ve nada.

> **Trampa del test:** al pasar a rol `anon` hay que **limpiar
> `request.jwt.claims`**. Si quedan las del usuario anterior, `auth.uid()`
> sigue devolviendo su id y el "anónimo" ve todo — parece un agujero de
> seguridad y es el test mal escrito. Me pasó en esta etapa.

### Pendiente con decisión de por medio: historial por teléfono

En el edificio, el historial de un invitado (sin cuenta) **devuelve vacío a
propósito**. El legacy lo resuelve con `get_phone_customer_orders`, un RPC
SECURITY DEFINER que matchea el teléfono: cualquiera que escriba un número
ajeno ve esos pedidos. En un solo negocio es un riesgo acotado; en una
plataforma con muchos locales es el mismo agujero multiplicado. Portarlo tal
cual sería heredar la decisión sin tomarla.

Las salidas, para elegir una: (a) portarlo igual, asumiendo el riesgo;
(b) scopearlo al tenant y a los últimos N días, que achica la ventana sin
cerrarla; (c) pedir un dato más (el código del pedido), que lo cierra pero
suma fricción. **Mientras no se decida, el invitado no ve historial** — que es
exactamente lo que pasa hoy, sólo que ahora está documentado.

### Qué probar

En el catálogo de **la-nona-pato**, con una cuenta (no invitado):
1. Mi cuenta → Direcciones → agregar una. Recargar: sigue ahí.
2. Ir a pagar con envío: la dirección guardada aparece para elegir.
3. Marcar un producto como favorito → pestaña Favoritos lo muestra con su
   precio y foto. Desmarcarlo lo saca.
4. Hacer un pedido logueado → Mi cuenta → Historial lo muestra.
5. **Negativo:** con otra cuenta, ninguna de esas cosas se ve.
6. **Negativo:** en el panel del negocio, el CRM sigue mostrando los clientes
   (no se rompió `orders`).

---

## Salud diaria — el edificio se reporta solo ✅ (17/ago, transversal)

No es una etapa del ERP: es lo que avisa si las etapas ya entregadas se
rompen. Va acá en el flujo porque recién con las Etapas 4/5a hay algo en
producción que valga la pena vigilar todas las mañanas.

`scripts/morning-health.mjs` (reescrito) + workflow cron L-S 7am AR:

- **Lo que chequea es lo VIVO**: landing, los 3 tenants reales (HTTP del
  subdominio + `get_catalog` con conteo de productos — un catálogo vacío en
  un negocio real es rojo, no verde), `submit-order` (OPTIONS), drift del
  snapshot (`schema-sync --check --target=platform`, se saltea sin
  credenciales) y Sentry (issues de 24h, se saltea sin token).
- **La versión anterior chequeaba los 3 legacy pausados**: rojo todas las
  mañanas. Un reporte siempre en rojo se deja de leer — era anti-salud.
- **El ping matutino además cuenta como actividad**: ayuda contra la
  auto-pausa del free tier.
- Mensaje con criterio: lo roto PRIMERO, el verde corto.

**Pendiente de Ricky (secrets en GitHub → Settings → Secrets → Actions):**
los `TELEGRAM_*` ya existen; sumar `PLATFORM_SUPABASE_URL` +
`PLATFORM_SUPABASE_SERVICE_ROLE_KEY` (activa el check de drift) y
`SENTRY_AUTH_TOKEN` + `SENTRY_ORG` + `SENTRY_PROJECT` (activa el de
errores). Los `LNP/COCHI/MALA_MIGA_ANON_KEY` viejos ya no se usan.
**OJO**: el cron corre desde `main`; hasta el merge, probarlo con
workflow_dispatch eligiendo la rama `platform/runtime-tenant`.

## Etapa 6 — Periferia

Cada uno es independiente y chico. Se hacen cuando se piden:

~~merma~~ ✅ · ~~imágenes propias~~ ✅ · ~~push~~ ✅ · ~~QRs
dinámicos~~ ✅ · ~~páginas de info~~ ✅ · **usuarios y roles — lo único que
queda** · menu engineering y analytics: ya viven en el Resumen del mes

### Páginas de info y QRs ✅ (18/ago) — las últimas capacidades apagadas

| | |
|---|---|
| Tablas | `info_pages`, `dynamic_qrs` (migración 0037) |
| RPCs públicos | `get_info_page`, `resolve_qr` |
| Pantallas | las del legacy, ahora contra `services/infoPages.js` y `qrs.js` |

Van juntas porque son la misma forma: **contenido del tenant que un visitante
sin sesión tiene que poder leer**. De ahí los dos caminos: el panel lee las
tablas con RLS por tenant; el visitante entra por RPC con el **slug** del
negocio, igual que `get_catalog`.

**`resolve_qr` resuelve y cuenta la visita en UNA llamada.** En el legacy son
dos (leer el destino, después un RPC para sumar): desde un teléfono recién
escaneando, la segunda a veces no llega porque el browser ya navegó. Por eso
`incrementQrVisit` **no hace nada** en el edificio — llamarlo igual contaría
doble cada escaneo.

**El slug es único POR TENANT**, no global: dos negocios pueden tener su
página `como-llegar` sin pisarse.

**`resolveTenantId()` nuevo en `activeTenant.js`**: lee `tenants` con la RLS
puesta, así que solo funciona logueado y siendo miembro — que es exactamente
quién edita páginas y QRs. Lo público no pasa por ahí: va por los RPCs con
slug, y así no hubo que exponer un endpoint nuevo para traducir slug→uuid.

**Verificado contra la base** (8 casos): el anónimo lee la página visible, no
lee la oculta, el mismo slug en otro negocio devuelve lo del otro negocio, no
puede leer la tabla directo ni escribirla; resuelve el QR propio, no el de
otro negocio, y la visita queda contada.

**Qué probar** en la-nona-pato → Configuración:
1. Aparecen "QRs dinámicos" y "Páginas informativas" (antes estaban ocultas).
2. Crear una página → abrir `la-nona-pato.divianco.app/info/<slug>` en una
   ventana privada (sin sesión): se ve.
3. Marcarla como no visible → la misma URL deja de mostrarla.
4. Crear un QR → abrir `/q/<slug>` → redirige, y el contador sube **de a uno**.
5. **Negativo:** esa misma URL en `cochi.divianco.app` no encuentra nada.

### Push ✅ (18/ago) — el negocio se entera de que entró un pedido

| | |
|---|---|
| Tabla | `push_subscriptions` (migración 0036), sólo vía RPCs |
| Función | `send-push` del edificio, deployada con `verify_jwt=false` |
| Pantalla | `AdminPushBanner`, reusado tal cual, en la pestaña de entrada |

**Era la única pieza de periferia que costaba plata todos los días:**
`submit-order` ya invocaba `send-push` y fallaba en silencio porque la función
no existía en el edificio. Una cocina que no mira la pantalla pierde el pedido.

**UNA sola VAPID para toda la plataforma.** En el legacy cada negocio tenía su
par de claves porque cada uno era una app aparte. Acá no: VAPID identifica al
**servidor** que manda, no al negocio, y todos los tenants se sirven desde el
mismo origen. Un par por tenant obligaría además a generar claves en cada alta
self-service. Lo que separa a un negocio de otro es `tenant_id` en la
suscripción.

**Sin tenant no se manda nada.** `send-push` corta con 400 si no viene
`tenant_id`/`tenant_slug`. Un fallback a "todos" sería un push cruzado entre
negocios — el peor error posible de esta función.

**Dos mejoras sobre el legacy:**
- **No cualquiera se suscribe como admin.** El RPC viejo aceptaba el `role`
  sin validar, y los push de admin llevan nombre del cliente y monto.
  Ahora, pedir `admin` sin ser miembro del tenant **degrada a `customer`** en
  vez de fallar (quien se suscribe no eligió el rol: lo eligió la pantalla).
- **La autorización de `send-push` es por membresía**, no por una tabla
  `admin_users` que en el edificio no existe.

**Las RPCs reciben el SLUG, no el uuid.** Primera versión pedía `tenant_id` y
eso obligaba a exponer un RPC público nuevo sólo para traducir slug→id
(`get_tenant_brand` no devuelve el id — lo verifiqué antes de asumirlo). El
slug ya está en la URL: superficie nueva a cambio de nada.

**Verificado contra la base** (BEGIN/ROLLBACK, 12 casos): invitado sin sesión
se suscribe y se desuscribe; el colado que pide `admin` queda como `customer`;
el dueño sí queda `admin`; anon no puede escribir, borrar ni contar tocando la
tabla directo; la cuenta es por tenant (2 vs 0); el mismo endpoint dos veces
deja una fila con las claves nuevas. **Y en producción**, contra la función ya
deployada: sin tenant → 400, sin auth → 401, y **con la anon key (que es
pública y viaja en el bundle) → 401**.

#### Falta que Ricky cargue las claves (2 minutos, y sin esto no suena nada)

Las VAPID son un secreto: no las genero yo ni las pego en el chat.

1. Generarlas: `npx web-push generate-vapid-keys`
2. En Supabase → proyecto `hermes-platform` → Edge Functions → Secrets:
   `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
   (`mailto:hola@divianco.app`)
3. En Vercel → proyecto `hermes-platform` → Environment Variables:
   `VITE_VAPID_PUBLIC_KEY` = **la pública** (la privada NO va acá: el front
   es público). Redeploy para que entre al bundle.

Mientras falten, `send-push` responde 500 "VAPID no configurado" — explícito,
no en silencio.

**Qué probar** (después de cargar las claves y redeployar):
1. Entrar al panel de la-nona-pato → aparece el banner de notificaciones →
   activarlo → el navegador pide permiso.
2. Hacer un pedido desde el catálogo → llega la notificación "Nuevo pedido"
   con el nombre y el monto.
3. **Negativo:** el mismo dispositivo no recibe los pedidos de cochi.

### Imágenes propias ✅ (17/ago) — la peor fricción del onboarding

| | |
|---|---|
| Storage | bucket `tenant-images` (migración 0034), público para leer |
| Service | `platformStorage.js` |
| Pantallas | `ImagePicker` en el editor de producto · foto de ticket en Compra |

**El problema era el alta de producto**: pedía "Imagen (URL)" con placeholder
`https://...`. El dueño de una panadería no tiene una URL, tiene una foto en
el teléfono — para poner una imagen había que subirla antes a un servicio
ajeno y pegar el link. La mitad de los catálogos nuevos iban a quedar sin
fotos, que es justo lo que hace que un catálogo se vea muerto.

**Un bucket para todos, aislado por carpeta `<tenant_id>/`.** Un bucket por
tenant obligaría a provisionar infraestructura (service role) en cada
registro, y eso mata el alta self-service. Con uno solo, subir es una
escritura normal del cliente y el aislamiento lo hace la RLS sobre
`storage.objects` leyendo la primera carpeta del path. **Por eso el path se
arma siempre en el service**: si una pantalla pudiera elegirlo, podría
escribir en la carpeta de otro negocio.

**Los límites viven en el bucket**, no solo en el JavaScript: 5 MB y tipos de
imagen. La validación del cliente da el mensaje rápido; un request armado a
mano la saltea entera, el `file_size_limit` no.

**Pegar un enlace sigue existiendo**, escondido tras "o pegar un enlace": los
tenants portados tienen sus imágenes en el storage de los proyectos viejos.

**Verificado contra la base** (BEGIN/ROLLBACK, 6 casos): subir a la carpeta
propia OK; a la de un negocio **ajeno de verdad**, rechazado; sin carpeta,
rechazado; borrar del ajeno, rechazado; lectura anónima, funciona (el
comprador no tiene sesión); anónimo subiendo, rechazado.

> **Trampa del test de aislamiento en este proyecto:** el dueño de prueba es
> miembro de los 6 tenants, así que "subir a la carpeta de cochi" **está
> permitido** y parece un bug. Para probar aislamiento hay que crear un tenant
> sin membresía dentro de la transacción. Es la misma distinción de siempre:
> RLS decide qué PODÉS tocar, no qué estás mirando.

**Qué probar** en la-nona-pato:
1. Editar un producto → donde antes pedía una URL ahora hay "Sacar una foto o
   elegir del teléfono". Subir una → se ve la miniatura → Guardar → la foto
   aparece en el catálogo público.
2. Intentar subir un archivo que no sea imagen o de más de 5 MB → mensaje
   claro, sin subir nada.
3. Compra → ahora aparece **Comprobante** con "Foto del ticket" / "Sin
   recibo". Subir una foto y confirmar: el gasto queda con el 📎.

### Merma ✅ (17/ago) — la pieza que completa el P&L

| | |
|---|---|
| Tabla | `waste_log` (migración 0033), sin UPDATE ni DELETE |
| RPC | `register_waste` — asiento + descuento de stock en una transacción |
| Service | `platformWaste.js` (contrato bool del legacy) |
| Pantalla | el form de merma de `Stock.jsx`, encendido con el saver inyectado |

En el legacy `registerWaste` son dos llamadas sueltas (asiento y descuento):
si la segunda no llega, queda merma asentada con el stock intacto. Acá es una
RPC con los guards de siempre (`no_sos_miembro`, `cantidad_invalida`,
`insumo_de_otro_negocio`) y el clamp a 0 del legacy — tirar más de lo que el
sistema creía que había es un error de inventario previo, no stock negativo.
`WasteForm` era otro hijo que guardaba solo; ahora recibe `onRegistrar`.

La merma cargada alimenta el Resumen del mes (`mermaCost`), que hasta ahora
recibía una lista vacía. La pantalla `Waste.jsx` (historial + cancelados) no
se portó: el registro rápido + el número en el P&L son el valor; el historial
se pide cuando alguien lo pida.

**Verificado contra la base** (BEGIN/ROLLBACK): asiento con trim de nota,
stock −1, y los negativos qty 0 / insumo inexistente / tenant ajeno / clamp
a 0.

**Qué probar** en la-nona-pato, pestaña Stock:
1. Botón "Merma" → elegir insumo, cantidad, motivo → el stock baja y en
   Ventas → Resumen aparece "Merma valorizada" con el costo.
2. Cargar una merma mayor al stock: el stock queda en 0, no negativo.
3. En barberia-demo el botón Merma también existe (compra gel, lo tira
   vencido). En cochi no se ve la merma de la-nona-pato.

---

## Orden y por qué

```
0 settings ──┬── 1 stock ──── 3 compras ──┐
             │                            ├── 4 ventas y P&L
             └── 2 recetas ───────────────┘
   ✅            ✅      ✅        ✅            ✅ 4 (falta aplicar 0032)

5 clientes  ·  6 periferia   (independientes, en cualquier momento)
```

La 0 primero porque la necesitan todas. Después 1 y 2 se pueden hacer en
paralelo. La 4 va última de la cadena porque es la que más se nota cuando los
números están mal.

---

## Cómo se hace cada etapa (el molde)

0. **Buscar quién escribe la tabla hoy.** Que exista en el legacy no significa
   que se use: `purchases` estaba desde el schema inicial y ninguna pantalla la
   tocaba. Un `grep` del nombre de tabla antes de empezar ahorra una etapa
   entera de trabajo inútil.
1. **Migración**: tabla con `tenant_id not null` + RLS con el patrón
   `tenant_id in (select private.current_user_tenants())`. **Si una operación
   toca varias filas y es plata, va a una RPC `security invoker`**, no a un
   bucle de llamadas desde el navegador: el cuerpo de una función plpgsql es
   una transacción, y la RLS sigue aplicando igual.
2. **Snapshot**: `npm run schema:sync` o subir `_migrations_through`.
3. **Service nuevo** en `src/services/platform*.js`, con el `tenantId`
   **obligatorio** en toda lectura. RLS decide qué podés ver; el filtro decide
   qué estás mirando. Los dos hacen falta — es el bug que ya nos pasó.
4. **Sumar el archivo a `PLATFORM_PATHS`** en `scripts/check-supabase-columns.mjs`,
   o el pre-commit lo valida contra el schema equivocado.
5. **Pantalla**: reusar el componente del legacy inyectándole el saver por
   prop, con default legacy para no tocar el admin viejo. Apagar por
   `capacidades` lo que dependa de tablas que todavía no están. **Revisar si
   los componentes hijos escriben por su cuenta** — si lo hacen, inyectarles
   el saver también. Si hay que tocarle la lógica, revisar el punto 1.
6. **Registry**: `implementado: true` y agregarlo a los rubros que corresponda.
   Una barbería no necesita Recetas.
7. **Test de aislamiento**: que la consulta salga con el filtro puesto.
8. **Cerrar con una lista de qué probar**, concreta: en qué tenant, qué tocar
   y qué tendría que pasar. Sin eso el feedback vuelve como "no anda" y se
   pierde una vuelta entera averiguando dónde. Incluir siempre **un caso
   negativo** (algo que NO debería aparecer): es lo que detecta que la
   separación por tenant o por rubro se rompió.

> **Ojo con el service worker.** La app es PWA: tras un deploy el navegador
> puede seguir sirviendo el build viejo y parece que el cambio no salió.
> Ctrl+Shift+R no siempre alcanza. Lo seguro es cerrar TODAS las pestañas del
> sitio y volver a abrir, o usar el banner de actualización.

---

## Riesgos conocidos

- **El shape de `orders`.** El legacy tiene 42 columnas; el edificio, 25. Al
  portar pantallas que leen pedidos, faltan campos. Decidir caso por caso si
  la columna se agrega o la pantalla la deja de mostrar.
- **Rubro ≠ gastro.** Recetas, stock de ingredientes y merma son gastronómicos.
  El registry ya permite no mostrárselos a una barbería; conviene declararlo al
  portar cada módulo y no después.
- **Alcance.** Cada etapa parece chica y arrastra la siguiente. La disciplina es
  entregar la etapa completa y usable antes de abrir la próxima.
