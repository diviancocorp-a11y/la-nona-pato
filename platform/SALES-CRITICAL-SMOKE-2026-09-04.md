# SALES-CRITICAL SMOKE — ¿puede DICO tomar su primer cliente pago de gastronomía?

Fecha: **2026-09-04** · Tipo: **inspección + smoke + medición.**
**No se implementó ningún fix, no se refactorizó nada, no se tocó producción.**

Todo lo que dice este documento se ejecutó. Donde no se pudo ejecutar, lo dice.

---

## 0. Estado real del repositorio

| | |
|---|---|
| Repo | `diviancocorp-a11y/hermes-gastro` |
| Branch | `feat/dico-panorama-v1` |
| HEAD al cerrar | **`c46399c9ea8574faea65db264ac6f7c8282d303d`** |
| `git status` al cerrar | limpio salvo `DICO_SINTRA_EXPORT/` y su `.zip` (sin trackear) |
| Publicado | `origin/feat/dico-panorama-v1` = `d9361cd` — **15 commits sin pushear** |
| Deploy | **ninguno.** Nada de esta rama está en producción |

### El árbol se movió DURANTE la auditoría

| Momento | HEAD | Estado del árbol |
|---|---|---|
| Al abrir | `5acea95` | 7-11 archivos modificados, parte en el índice |
| Al cerrar | `c46399c` | limpio |

Los tres commits nuevos (`60a4677`, `129d753`, `c46399c`) son exactamente los
cambios que estaban sin commitear cuando corrí los tests y la captura de
Phase 4 — y esas dos herramientas **leen el disco**, no un ref. Así que la
evidencia de esta auditoría corresponde al contenido de `c46399c`.

**Ninguno de los tres toca** `PlatformAdmin.jsx`, `orders`, `payments`, RLS ni
migraciones: todos los hallazgos de flujo y de base siguen valiendo en `c46399c`.

### Qué versión se ejecutó, exactamente

| Prueba | Contra qué |
|---|---|
| Camino crítico (sondas 1-8) | **base local de testing**: Supabase local del harness, 61 migraciones de `platform/migrations`, seed determinista. **Nunca se tocó `wwwzdgprsooyjgkuyoav`** |
| Navegador | `scripts/qa-lite/revision-phase4.mjs` — dev server en `127.0.0.1:5273` contra esa misma base local |
| Suite | `vitest run` sobre el árbol de trabajo: **1185/1185 PASS, 86 archivos** |
| Gate Phase 4 | `capturar-phase4.mjs --lote=smoke-despues` — build real + Chromium real |

**Advertencia de método que vale para todo el documento:** la base local aplica
**las migraciones del repo**. Producción tiene al menos una función aplicada por
MCP que **no existe como archivo** (`merma_y_compra_asientan_en_el_libro`, citada
en `0042`). Donde eso cambia el resultado, está marcado. Verificarlo exige la
service role de producción y **no se hizo a propósito**.

---

## 1. Camino crítico de gastronomía — paso por paso

Negocio de prueba creado de cero: `parrilla-smoke` / "Parrilla Don Smoke",
gastro / físico / AR, canales mesa+mostrador+delivery+retiro.

### 1.1 NEGOCIO NUEVO — **PASS**

- **Evidence:** `.qa-lite/smoke-2026-09-04/probe-02-alta.mjs`
- **Observed:** `slug_available` correcto (libre → `true`, ocupado → `false`).
  `signup_tenant()` creó tenant + branch "Principal" + `tenant_members` con rol
  owner + `profiles` + `settings`. Segunda llamada devolvió
  `already_existed: true` sin duplicar nada.
  **`tenants.name` guardó "Parrilla Don Smoke", no el slug** → la migración
  `0060` está aplicada en la base local.
- **Blocker:** NO · **Severity:** —
- **Ojo:** el tenant nace con **`plan_id = null`**. Está declarado como pendiente
  en la propia `0060`. No rompe nada hoy porque nada bloquea por plan.

### 1.2 CONFIGURACIÓN — **FAIL**

- **Evidence:** navegador, dos sesiones independientes; y
  `src/pages/PlatformAdmin.jsx:625-627` + `:758`.
- **Observed:** el engranaje de Configuración **no abre nada**. Ni con click
  real ni con click programático: el panel se queda en Productos.
  La causa está leída en el código y es determinista:

  ```js
  // PlatformAdmin.jsx:625
  if (!tabs.length || tabs.some(t => t.id === tab)) return;
  setTab(pantallaInicial(roles, tabs) || tabs[0].id);
  ```

  `tabs` contiene **sólo módulos** (`products`, `orders`, `stock`, `finanzas`,
  `ventas`, `caja`, `mesas`, `personal`). `config`, `cobros` y `usuarios` **no
  son módulos**, así que el efecto los rebota a `products` en el mismo tick.
- **Consecuencia:** son inalcanzables desde la UI **Configuración del negocio**
  (horarios, dirección, delivery, marca), **Cuentas y medios de pago**,
  **Cobros Online (conectar MercadoPago)** y **Usuarios**.
- **Blocker:** **SÍ** · **Severity:** **P0**
- **No es una regresión de Phase 4:** el guard está igual en `ba61504` y en
  `bdc168a`. Viene de la etapa 6f.

### 1.3 PRODUCTO — **PASS**

- **Evidence:** `probe-03-producto-catalogo.mjs`; navegador.
- **Observed:** alta como **dueño con RLS real** (sin service role) de tres
  productos: composite, simple con `stock: 0`, y uno inactivo. Precio,
  categoría, descripción y `active` persisten. La Golden Screen los muestra
  agrupados por categoría con sus KPIs.
- **Blocker:** NO · **Severity:** —
- **Deuda medida:** la **base no valida nada**. Acepta `price = -500`, acepta
  producto sin precio (queda en `0`) y acepta nombre vacío. La única validación
  es `validateProduct()` en el cliente, que sí es correcta. Es defensa en
  profundidad faltante, no un agujero explotable desde el producto. → **P2**

### 1.4 STOCK / INSUMOS — **PARTIAL**

- **Evidence:** `probe-07-inventario.mjs`
- **Observed:** compra de 5 kg → `ingredients.stock` 10 → 15, con gasto asentado
  ($31.000, "Materia Prima"). Repetir la compra con la misma clave **no
  duplicó** ni el stock ni el gasto. Merma de 2 → stock 13. Receta cargada
  (0,4 kg sobre un plato de $14.500 → costo teórico $2.400).
- **Blocker:** NO · **Severity:** P1 (ver §4)

### 1.5 CATÁLOGO — **PASS**

- **Evidence:** `probe-03`, `get_catalog` llamado como **anónimo sin sesión**.
- **Observed:** devolvió 2 de 3 productos. El oculto fue el de `active: false`.
  **El de `stock: 0` salió publicado.**
- **Blocker:** NO · **Severity:** —

### 1.6 PEDIDO — **PARTIAL**

- **Evidence:** `probe-04-dinero.mjs`; navegador (panel de Pedidos con los 3
  pedidos del fixture, detalle, ítems, teléfono y botón "Cobrar $8.500").
- **Observed:** el pedido se crea, se lee desde el panel con la RLS del dueño,
  conserva ítems, cantidades y precio, y `order_balance` devuelve el total exacto.
- **Blocker:** **SÍ, para un local con mostrador o mesas** · **Severity:** **P1**
- **Lo que falta, verificado:** **no existe ninguna forma de crear un pedido
  desde el panel.** El único escritor de `orders` es la edge function
  `submit-order`, o sea el **catálogo público**. `grep` sobre todo `src/`: cero
  `insert` en `orders`, cero RPC de alta de pedido, cero botón "Nuevo pedido" en
  `OrdersPanel`. El pedido de la sonda se creó emulando a `submit-order` con
  service role, y está declarado como tal.

### 1.7 POS — **PARTIAL** (ver 1.6) · **1.8 COBRO MANUAL — PARTIAL**

- **Evidence:** `probe-04`; navegador (diálogo "Cobrar", 6 medios, monto
  precargado con el saldo, texto "Viene con lo que falta. Poné menos para
  dividir la cuenta").
- **Observed bueno:** el cobro en efectivo funciona. **La idempotencia es real**:
  dos llamadas con la misma `client_request_id` devolvieron **el mismo pago**,
  1 fila en `payments`, $29.000 cobrados. La UI oculta el formulario de cobro
  cuando el saldo llega a 0.
- **Observed malo:** con **otra** clave, `register_payment` **aceptó cobrar el
  total una segunda vez**: $58.000 registrados sobre un pedido de $29.000. No lo
  frena el servidor (no hay guard contra el saldo en la RPC) ni el cliente
  (`puedeCobrar = !!metodo && montoNum > 0`, sin techo).
- **Blocker:** **SÍ** · **Severity:** **P0**

### 1.9 CAJA — **PASS**

- **Evidence:** `probe-04`, pasos 1, 11 y 12.
- **Observed:** `open_cash_session` abrió el turno con $20.000; **reabrir
  devolvió el mismo turno**, no creó un segundo. `cash_session_expected` dio
  $78.000 = apertura + los dos cobros en efectivo (incluyendo el sobrecobro, o
  sea que el arqueo **sí lo muestra**). `close_cash_session` guardó
  `expected 78.000 / closing 40.000 / difference −38.000` y el faltante quedó
  registrado, no corregido.
- **Blocker:** NO · **Severity:** —

### 1.10 STOCK POST-VENTA — **FAIL**

- **Evidence:** `probe-04` paso 10 y `probe-07`.
- **Observed:** después de completar la venta, `inventory_movements` del negocio
  = **0**. `ingredients.stock` no se movió. **La venta no descuenta stock, ni
  directo ni por receta.** No hay ningún escritor de movimientos `kind='sale'`
  en el repo: el string sólo aparece en el `CHECK` de la tabla.
- **Blocker:** NO para cobrar; **SÍ** para prometer control de inventario ·
  **Severity:** **P1**

### 1.11 VENTA — **PASS**

- **Evidence:** `probe-04` pasos 8 y 9.
- **Observed:** `complete_order` asentó 1 fila en `sales` con fecha, qty,
  unit_price, total, `payment_method` y `branch_id`, y pasó el pedido a
  `completed`. La **segunda llamada fue rechazada con `ya_completado`** y `sales`
  quedó en 1 fila: **no duplica la venta**.
- **Nota:** `orders.paid_at` y `orders.payment_status` quedan en `null` tras un
  cobro en efectivo — sólo los escribe el webhook de MercadoPago. **No tiene
  impacto**: ninguna pantalla del edificio los lee, y el "primer valor" de la
  consola entra por la ruta `sales` (migración `0059`).

### 1.12 P&L / RESULTADO — **PARTIAL**

- **Evidence:** `probe-06-restaurar-y-resultado.mjs`
- **Observed:** con la venta y un gasto cargados —
  ingresos $29.000 · CMV **$0** · gastos $5.000 · resultado $24.000.
  El CMV da 0 porque el producto se vendió **antes** de tener receta: el costo se
  congela al crear el pedido y `complete_order` sólo lo recalcula si la receta ya
  existe. Con receta cargada, el costo teórico se calcula bien ($2.400).
- **Panel Hoy:** no expone RPC propia; se arma en el cliente. No se verificó
  contra datos reales — es exactamente lo que el HANDOFF ya declara como "sólo
  compila / se vio en la vitrina".
- **Blocker:** NO · **Severity:** P2

---

## 2. Alta / registro — respuesta puntual a lo preguntado

| Cosa | Verificado |
|---|---|
| nombre del negocio | **sí**, y se guarda bien (no el slug) |
| rubro / modo / canales | **sí**, los tres viajan y se persisten |
| creación de owner | **sí**, `tenant_members` con `roles: ['owner']` |
| creación de sucursal | **sí**, "Principal", `is_default` |
| medios de pago iniciales | **sí, tres**: Efectivo, Tarjeta, MercadoPago |
| configuración mínima | **sí**, fila en `settings` con `biz_name` |
| validaciones | ver abajo |
| mensajes de error | traducidos en `signup.js`; el slug ocupado tiene callejón sin salida conocido y documentado en `0060` |
| redirect al primer valor | el dueño abre en `products`, que es la Golden Screen |
| recuperación de contraseña | existe en `Login.jsx` (auditado el 20/ago) |

### Las dos afirmaciones de Sintra

**A. "Falta hacer obligatorio el nombre del negocio."**
→ **NOT REPRODUCED / ALREADY HANDLED.**
`Signup.jsx:124` exige `bizName.trim().length >= 2` y el botón está
`disabled={!puedeEnviar}`. Además el slug se deriva del nombre, así que sin
nombre no hay slug y `signup_tenant()` aborta con `sin_slug`. **Dos capas.**

**B. "Falta exigir al menos un medio de pago antes de crear productos."**
→ **NOT REQUIRED BY PRODUCT CONTRACT.**
El negocio **nace con tres medios de pago**, sembrados por el trigger
`tenants_sembrar_medios` (`0049`) — que existe precisamente porque este agujero
ya ocurrió y se tapó en agosto. Medido en el alta nueva: Efectivo, Tarjeta,
MercadoPago. Agregar la validación que Sintra pide no protegería de nada y
metería un paso al alta.
**Lo que sí falta es otra cosa:** no hay ninguna pantalla para **crear, editar o
borrar** un medio de pago. Ver §6.

---

## 3. Producto / catálogo — el caso stock = 0

**Sintra dice:** "los primeros productos pueden no cargar si no hay stock; el
cliente crea un producto sin stock y se ve vacío públicamente".

→ **FALSE. NOT REPRODUCED.**

Medido de dos formas:

1. **En el código.** `get_catalog` (última definición, `0025`) filtra
   `where p.tenant_id = t.id and p.active = true`. **`stock` no aparece en el
   filtro.**
2. **Ejecutado.** Producto "Empanada de carne" con `stock: 0` y `active: true`
   → **VISIBLE** en el catálogo público llamado como anónimo. Producto "Flan
   casero" con `stock: 12` y `active: false` → oculto.

Y en gastronomía el punto es doblemente irrelevante: los productos compuestos
nacen con `stock: null`, porque lo que tiene existencias es el insumo, no el
plato.

**Acción sugerida por Sintra (poner un aviso "los clientes no verán este
producto si no tiene stock > 0"): NO IMPLEMENTAR.** Diría algo falso.

---

## 4. Inventario — qué modelo hay de verdad

Sintra afirma: *"Inventario MOVIMIENTOS (ledger inmutable) está verificado;
compras ingresan stock correctamente; cada venta debe decrementar stock en
transacción atómica"*.

### Veredicto: **PARTIALLY TRUE**

| Pregunta | Respuesta medida | Clasificación |
|---|---|---|
| ¿Qué modelo usa el edificio? | **Dos, en paralelo.** El número (`ingredients.stock`, `products.stock`, `product_variants.stock`) y el libro (`inventory_movements` + `inventory_balances`). El que se muestra es **el número** | CONFIRMED CURRENT |
| ¿Hay movimientos/asientos? | Sí: tabla `inventory_movements` con `kind`, `qty` firmada, `unit_cost`, `reference_type`/`reference_id`, `client_request_id` | CONFIRMED CURRENT |
| ¿Es inmutable? | **Sí, y es real.** Trigger `trg_libro_inmutable` sobre UPDATE y DELETE. Probado **con service role**: los dos rechazados con *"el libro de inventario no se edita ni se borra"* | **CONFIRMED** |
| ¿La venta descuenta stock? | **NO.** 0 movimientos y 0 cambio de stock tras vender. No existe ningún escritor de `kind='sale'` | **NOT IMPLEMENTED** |
| ¿Una receta descuenta insumos? | **NO.** La receta se usa sólo para **costear** (`unit_cost`), nunca para consumir | **NOT IMPLEMENTED** |
| ¿La compra asienta en el libro? | **En el repo, NO.** `register_purchase` mueve `ingredients.stock` y nada más: 0 movimientos tras la compra. `0042` dice que el enganche se aplicó en una migración llamada `merma_y_compra_asientan_en_el_libro` **que no existe como archivo** | **PARTIAL / DRIFT** |
| ¿La merma asienta en el libro? | Igual que la compra: **no en el repo** | PARTIAL / DRIFT |
| ¿Qué pasa con stock insuficiente? | Merma de **999** sobre un stock de **13**: **aceptada sin error**. `ingredients.stock` quedó en **0** (clamp), pero `waste_log` registró **999** | **defecto** |
| ¿Puede quedar negativo? | **No.** Se clampea en 0 | CONFIRMED |
| ¿Compra y merma dejan trazabilidad? | Sí, pero **en sus propias tablas** (`expenses`, `waste_log`), no en el libro | PARTIAL |

### Los dos sistemas se contradicen, medido

Un ajuste por el libro (`register_stock_movement`, `adjustment −1`) dejó:

```
inventory_balances.qty   = -1
ingredients.stock        =  0   ← este es el que ve el usuario
```

**El ajuste del libro no toca el número que se muestra.** Son dos verdades.

### Lo que esto significa para el veredicto

El libro existe, es correcto y es inmutable — pero hoy es **un adorno con un
solo escritor** (el ajuste manual). La frase de Sintra "cada venta debe
decrementar stock en transacción atómica" describe algo que **no está
implementado en ninguna forma**.

---

## 5. Roles y aislamiento

Owner + un rol operativo real de gastronomía (`attendant` / Mozo), medidos
contra la base con RLS real, no simulados.

### Lo que está bien — **PASS**

| Prueba | Resultado |
|---|---|
| Mozo lee `expenses` | **0 filas** ✔ |
| Mozo lee `sales` | **0 filas** ✔ (había 1) |
| Mozo lee `settings`, `suppliers`, `ingredients`, `staff`, `audit_log`, `payment_integrations` | **0 filas** ✔ |
| Mozo lee `cash_sessions` | **0 filas** ✔ |
| Mozo inserta un gasto | **RECHAZADO (42501)** ✔ |
| Mozo se auto-asciende a owner | **0 filas cambiadas** ✔ |
| Mozo lee productos de **otro negocio** | **0 filas** ✔ |
| Mozo lee pedidos de **otro negocio** | **0 filas** ✔ |
| Mozo **inserta** en otro negocio | **RECHAZADO (42501)** ✔ |
| Anónimo sin sesión sobre 6 tablas | 0 filas o bloqueado en las 6 ✔ |

**El aislamiento entre negocios no tiene fugas** — ni de lectura ni de escritura.

### Lo que está mal — **FAIL**

**El mozo puede cambiar precios y borrar productos.**
`await mozo.from('products').update({ price: 1 })` → **3 filas cambiadas.**

Las policies de `products` (`0001`/`0002`) son **por membresía, no por rol**:
`tenant_id in (select private.current_user_tenants())` para SELECT, INSERT,
UPDATE **y DELETE**. La migración `0050` (roles con alcance) cubrió `expenses`,
`suppliers`, `sales`, `settings`, `staff`, `audit_log` y `cash_sessions` —
**`products` no está en la lista**.

El panel lo esconde (`puedeVer` filtra la navegación) y el propio código lo dice:
*"esto es NAVEGACIÓN, no seguridad"*. Contra la API, cualquier empleado del
negocio puede editar el catálogo entero. **Severity: P1.**

---

## 6. Medios de pago manuales — inventario real del runtime

| Medio | Estado |
|---|---|
| **EFECTIVO** | **AVAILABLE.** Sembrado en todo tenant nuevo, cobrado de punta a punta en el smoke, entra al arqueo |
| **TRANSFERENCIA** | **NOT AVAILABLE para un negocio nuevo.** `kind='transfer'` está permitido por el `CHECK` de la tabla, pero **el trigger no la siembra** (sólo Efectivo, Tarjeta, MercadoPago) y **no hay ninguna pantalla para crearla**: `grep` sobre `src/` da lectura (`fetchMediosDePago`) y ningún insert/update/delete. El fixture de QA la tiene porque su seed la incluye a mano — por eso aparece en la captura del diálogo de cobro y **eso engaña** |
| **TARJETA** | **AVAILABLE** (sembrada). Es un registro de cobro, no una integración |
| Otros manuales | ninguno |

**Matiz importante, para no exagerar el hallazgo:** el **catálogo público** sí
sabe de transferencia — `submit-order` acepta `payment: "transferencia"` cuando
el negocio tiene cuentas cargadas en `settings.payment_accounts`, y existe
`PaymentAccountsEditor` para cargarlas. Pero ese editor vive **dentro de
Configuración**, que es lo que el P0 de §1.2 deja inalcanzable.

O sea: hoy un negocio nuevo **no puede cobrar por transferencia ni en el POS ni
en el catálogo**, por dos causas distintas que se suman.

### Cobro manual ejecutado

Hecho en la base local, sin dinero real. Resultados en §1.8:
importe correcto ✔, sin doble cobro con reintento ✔, caja y venta correctas ✔,
**sin tope contra el saldo ✘**.

### MercadoPago

- **No se usó dinero real y no se intentó.**
- Estado: implementado (`platform/functions/mp-*`, `payment_integrations` con
  RLS y **cero policies** a propósito — el token no sale de las edge functions).
  `CobrosOnline.jsx` es una pantalla cuidada, con aviso explícito sobre tokens
  `TEST-`.
- **Hallazgo nuevo:** hoy **no se puede conectar** desde la UI, porque
  `CobrosOnline` sólo se alcanza desde Configuración (§1.2).
- Para un smoke de MP autorizado aparte haría falta: cuenta real de Grupo
  Divianco, resolver §1.2, desplegar las functions del edificio, y un pedido de
  monto mínimo con reverso posterior.

---

## 7. Caja

Cubierto en §1.9. **PASS.** Turno idempotente, esperado calculado sólo sobre
efectivo, faltante registrado y no corregido, sin doble cobro por reintento.

El único riesgo de dinero en la caja es el **sobrecobro sin tope** (§1.8), y el
arqueo lo hace visible como sobrante — no lo esconde.

---

## 8. Phase 4 — evidencia visual, sin tocar nada

Capturas en `.qa-lite/artifacts/phase4-golden/smoke-despues/`:
10 PNG (2 temas × 5 anchos) + 4 de la burbuja + `medicion.json`.

Medido en Chromium real sobre el árbol actual:

| Caso | Desborde | Contraste que falla | Targets < 44 en pantalla |
|---|---|---|---|
| light 1440 / 1024 / 769 / 768 / 390 | **0** | **0** | **0** |
| dark 1440 / 1024 / 769 / 768 / 390 | **0** | **0** | **0** |

Lo único por debajo de 44 px sigue estando **en el shell**, no en la pantalla:
"Cambiar a oscuro" 36×36, "Configuración" 36×36, "Salir" 44,4×34 — la deuda que
Phase 4 ya declaró fuera de alcance.

Verificado además en el navegador: escritorio claro, escritorio oscuro y mobile
375×812 (Dico 2D viaja a la barra superior con su contador, bottom nav de 4 +
Más). **No se modificó la pantalla.** La aprobación visual es de Ricardo.

**Phase 4 NO es blocker comercial.** El panel opera igual sin la aprobación.

---

## 9. Logo

Contrato actual respetado y verificado: `DIRECTION = LOCKED`,
`MASTER ASSET = PENDING`, `RUNTIME = texto DICO`.

En el navegador, con el riel abierto, el wordmark "DICO" renderiza como texto en
su lugar. **No hay imagen rota, ni hueco, ni layout corrido, ni error de
consola** por la ausencia del master. La pantalla de login del panel todavía
muestra el splash **HERMES GASTRO** — es marca anterior, no un defecto de
layout.

**No se creó ningún logo ni placeholder.**

---

## 10. Facturación electrónica — estado técnico

| Dónde | Estado |
|---|---|
| Legacy (`hermes-gastro`) | **existe**: `supabase/functions/afip-invoice/` + `src/components/admin/Invoicing.jsx`, montado en `src/pages/Admin.jsx` |
| Edificio (plataforma) | **no existe**: nada en `platform/functions/`, ningún panel de facturación en `PlatformAdmin.jsx` |
| Plan asociado | **"Total"**, declarado `disponible: false` a propósito, con `pendiente: ['facturacion-electronica', 'soporte-24h-ia']` |

**Qué puede hacer DICO hoy:** registrar la venta, el medio de pago, el turno de
caja y el arqueo; emitir el ticket interno del pedido; llevar ventas, gastos y
resultado.

**Qué NO puede hacer:** emitir comprobante fiscal electrónico de ningún tipo.

**Qué hay que declararle al prospecto, textual:** *DICO no emite factura
electrónica. La facturación fiscal la seguís haciendo con tu sistema o tu
contador, como hasta ahora.* Si el prospecto necesita que el sistema facture,
DICO no le sirve todavía y decirlo antes cuesta menos que después.

---

## 11. CLASIFICACIÓN FINAL

### P0 — NO VENDER HASTA RESOLVER

**P0-1 · La configuración del negocio es inalcanzable desde la UI.**
Reproducción: entrar al panel como dueño → clic en el engranaje "Configuración"
→ no pasa nada. Confirmado con click real y con `element.click()`, en dos
sesiones. Causa leída: `PlatformAdmin.jsx:625` rebota cualquier `tab` que no sea
un módulo, y `config`/`cobros`/`usuarios` no lo son.
Bloquea: configurar horarios, dirección, delivery y marca; cargar cuentas de
pago; **conectar MercadoPago**; gestionar usuarios.
Cae en el criterio *"impedir operar el flujo vendido"*.

**P0-2 · Se puede cobrar más que el saldo del pedido, sin tope en ninguna capa.**
Reproducción: pedido de $29.000 → `register_payment` por $29.000 → segundo
`register_payment` por $29.000 con otra clave → **aceptado**, `payments` suma
$58.000. El servidor no compara contra `order_balance`; el cliente sólo exige
`monto > 0`.
Cae en el criterio *"perder dinero"*. La idempotencia por reintento **sí**
funciona: esto no es doble click, es un importe mal tipeado que nada rechaza.
*Si Ricardo evalúa que un error de tipeo del cajero es riesgo aceptable para un
solo cliente, esto baja a P1 — pero es una decisión de producto, no un dato.*

### P1 — VENDER SÓLO CON LIMITACIÓN EXPLÍCITA

1. **No se puede tomar un pedido desde el panel.** El único alta de `orders` es
   la edge function del catálogo público. Un local de mostrador o mesas tiene que
   operar cargando el pedido desde el catálogo. **Declararlo.**
2. **El Salón no toma comandas.** El plano existe y se dibuja, pero tocar una
   mesa abre su **editor**, no una cuenta. La prueba que Sintra propone —"tomá
   una orden en mesa 1"— **no es ejecutable**.
3. **Transferencia no es cobrable por un negocio nuevo** (§6), y no hay pantalla
   para dar de alta medios de pago.
4. **La venta no descuenta stock**, ni directo ni por receta. No prometer control
   de inventario ligado a las ventas.
5. **El libro de inventario y el número de stock divergen**: un ajuste por el
   libro no cambia lo que ve el usuario.
6. **La merma acepta más que el stock disponible** y lo registra completo:
   `waste_log` 999 con stock 13. El reporte de merma va a mentir.
7. **Cualquier empleado puede editar y borrar productos por API** (§5).
8. **MercadoPago sin probar con dinero real**, y hoy además no conectable (P0-1).
9. **Sin facturación electrónica** en el edificio (§10).
10. **El tenant nace con `plan_id = null`**: el alta no asigna plan ni fecha de
    pago. Hoy no bloquea nada, pero el cobro de suscripción no tiene de dónde
    colgarse.

### P2 — NO BLOQUEA PRIMER CLIENTE

- Aprobación visual de Phase 4 (la pantalla mide 0 fallos en 10/10 superficies).
- Logo master vectorial y favicon.
- Targets de la barra superior a 36×36 y "Salir" a 44,4×34.
- Las filas de pedido son botones **sin nombre accesible**.
- La base no valida `price` ni `name` (el cliente sí).
- `orders.paid_at` / `payment_status` sin escribir en cobros que no son MP.
- Panel Hoy sin verificar con datos reales.
- El pack 3D usa 2 de sus 8 poses; `DicoPulso` sin montar.
- Splash "Hermes Gastro" en el login del panel.
- Agenda (barbería) y variantes (retail) sin interfaz — otra vertical.

---

## 12. Auditoría de las afirmaciones de Sintra

| SINTRA CLAIM | VERDICT | EVIDENCE | ACTION |
|---|---|---|---|
| MercadoPago puede esperar al segundo cliente | **TRUE, por otra razón** | MP está implementado y sin probar con dinero real; pero además **hoy no se puede conectar** porque su pantalla vive detrás del P0-1 | Mantener la decisión. Resolver P0-1 igual |
| Efectivo funciona | **CONFIRMED** | Cobro end-to-end, idempotente, entra al arqueo y a `sales` | Ninguna |
| Transferencia funciona | **FALSE** | El trigger siembra Efectivo/Tarjeta/MercadoPago. `transfer` no se siembra y no hay UI para crearla. En el catálogo depende de `payment_accounts`, editable sólo desde Configuración (P0-1) | No prometer transferencia hasta sembrarla o exponer el alta |
| Faltan validaciones de alta (nombre, medio de pago) | **NOT REPRODUCED** | `bizName.trim().length >= 2` + botón deshabilitado + `sin_slug` server-side; tres medios sembrados por trigger `0049` | **No implementar.** Sumaría fricción sin cubrir nada |
| Producto con stock 0 queda invisible | **FALSE** | `get_catalog` filtra sólo por `active`. Producto con `stock: 0` **visible**, medido como anónimo | **No implementar el aviso.** Diría algo falso |
| Ledger MOVIMIENTOS inmutable | **PARTIALLY TRUE** | La tabla es `inventory_movements` y **sí es inmutable** (UPDATE y DELETE rechazados incluso con service role). Pero hoy sólo la escribe el ajuste manual | Decidir si el libro pasa a ser la verdad o se acepta que es auxiliar |
| La venta descuenta stock atómicamente | **FALSE** | 0 movimientos y 0 cambio de stock tras vender. Ningún escritor de `kind='sale'` en el repo | No prometerlo |
| Compras ingresan stock correctamente | **TRUE** (con matiz) | Compra +5 kg, idempotente, gasto asentado. **No** asienta en el libro en el repo; producción puede diferir por drift no versionado | Correr `check-functions-drift.mjs` contra producción |
| Salón está listo | **PARTIALLY TRUE** | Plano, zonas y edición de mesas: sí. **Tomar una comanda en una mesa: no existe** | Declarar el salón como plano, no como servicio de mesa |
| KDS puede omitirse | **TRUE** | La comanda de cocina es parcial y no hay entrada de pedidos desde el panel; el papel es coherente con lo que el producto hace hoy | Mantener |
| P&L puede mostrar la primera operación | **TRUE, con límite** | Ingresos, gastos y resultado se calculan sobre datos reales. El **CMV da 0** si el producto no tenía receta al vender | Cargar recetas antes de la primera venta si se quiere margen |
| Phase 4 bloquea la demo | **FALSE** | 0 fallos de contraste, 0 targets chicos y 0 desborde en 10/10 superficies, medido hoy. La pantalla se ve terminada en claro, oscuro y mobile | Aprobar o no, pero no bloquea vender |
| El logo bloquea la demo | **FALSE** | Sin master, el wordmark renderiza como texto; sin imágenes rotas ni layout corrido | **No crear placeholder.** Contradice el manual (`LOCKED` + master pendiente) |
| DICO puede venderse hoy | **FALSE hoy, TRUE tras dos arreglos chicos** | P0-1 y P0-2, los dos reproducidos y los dos acotados | Ver §13 |

---

## 13. Resultado final

### `FIRST CUSTOMER TECHNICAL VERDICT = NO-GO`

No por el producto, que aguanta el camino crítico mejor de lo que la
documentación sugiere: el alta funciona y guarda bien, el catálogo publica, el
cobro es idempotente, la caja arquea, la venta se asienta sin duplicar y el
aislamiento entre negocios no tiene una sola fuga.

Es NO-GO por **dos defectos reproducidos**: el dueño **no puede abrir la
configuración de su negocio**, y el sistema **acepta cobrar más de lo que se
debe sin que nada lo frene**. Los dos son chicos y están localizados.

### `SHORTEST PATH TO GO =`

Sólo lo que sale de fallos realmente reproducidos. **Ninguna implementada.**

1. **Dejar pasar los tabs que no son módulos** en el guard de
   `PlatformAdmin.jsx:625` (`config`, `cobros`, `usuarios`), y verificar en el
   navegador que Configuración, Cuentas de pago y Cobros Online abren. → P0-1
2. **Poner tope al cobro contra el saldo**, en `register_payment` (servidor, que
   es donde no se puede esquivar) y reflejarlo en `PantallaDeCobro`. → P0-2
3. **Decidir y declarar cómo entra un pedido** en un local de mostrador: o se
   asume el catálogo público como entrada, y se dice en la venta, o se abre un
   alta mínima desde el panel. → P1-1 y P1-2
4. **Sembrar "Transferencia"** en los tenants nuevos, o exponer el alta de medios
   de pago. Es la condición del plan comercial de vender cobrando sin MP. → P1-3
5. **Re-correr este smoke completo sobre un tenant nuevo** después de 1-4, y
   correr `check-functions-drift.mjs` contra producción para saber si el
   enganche compra/merma → libro existe allá y no en el repo.

---

## Anexo — cómo reproducir

```powershell
npm run qa:lite:setup                                   # Supabase local + seed
node .qa-lite/smoke-2026-09-04/probe-02-alta.mjs         # alta de negocio
node .qa-lite/smoke-2026-09-04/probe-03-producto-catalogo.mjs
node .qa-lite/smoke-2026-09-04/probe-04-dinero.mjs       # pedido/caja/cobro/venta
node .qa-lite/smoke-2026-09-04/probe-05-roles.mjs        # roles y aislamiento
node .qa-lite/smoke-2026-09-04/probe-06-restaurar-y-resultado.mjs
node .qa-lite/smoke-2026-09-04/probe-07-inventario.mjs
node .qa-lite/smoke-2026-09-04/probe-99-limpiar.mjs      # deja el fixture limpio
node scripts/qa-lite/revision-phase4.mjs                 # navegador, HMR
node scripts/qa-lite/capturar-phase4.mjs --lote=smoke-despues
```

Las sondas viven en `.qa-lite/`, que está gitignoreado: son instrumento, no
producto. Corren **sólo** contra `127.0.0.1`.
