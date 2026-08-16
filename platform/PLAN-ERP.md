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

## Etapa 4 — Ventas y P&L

| | |
|---|---|
| Tablas | `sales` (+ `tenant_id`) |
| Cálculo | **`useFinancials` se reusa sin tocar** — es cálculo puro sobre arrays |
| Pantallas | `SalesView`, `MonthSummary`, los KPIs de `Home.jsx` |

Lo que le dejó la Etapa 3 para resolver: **las compras llegan siempre con
`usar_category` en null**, porque una compra mixta no tiene una sola categoría
USAR. El total sale de `amount` filtrando por `category = 'Materia Prima'`; el
desglose por tipo de comida sale de sumar el jsonb `items`, donde cada línea
lleva su `food_category`. Es una consulta más rara que agrupar filas, pero es
la única forma de que el libro muestre una compra como un movimiento.

Depende de la 2 y la 3: sin costos reales ni gastos, el P&L da cualquier cosa.
Es exactamente el error que ya se arregló una vez en el legacy (doble conteo de
merma y gastos proyectados, 12/jun) — conviene no repetirlo portando a medias.

---

## Etapa 5 — Clientes

| | |
|---|---|
| Tablas | `profiles` (ya existe), `addresses`, `favorites` |
| Service | `crm.js` |
| Pantalla | `CRM.jsx` |

En el legacy `customers` y `profiles` ya se habían unificado; el edificio nace
con esa decisión tomada, así que esta etapa es más corta de lo que parece.

---

## Etapa 6 — Periferia

Cada uno es independiente y chico. Se hacen cuando se piden:

merma (`waste_log`) · QRs dinámicos · push · páginas de info · usuarios y roles
(`tenant_members` ya existe, falta la UI) · menu engineering · analytics

---

## Orden y por qué

```
0 settings ──┬── 1 stock ──── 3 compras ──┐
             │                            ├── 4 ventas y P&L
             └── 2 recetas ───────────────┘
   ✅            ✅      ✅        ✅

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
