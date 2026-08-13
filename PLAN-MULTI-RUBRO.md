# Plan de gestion multi-rubro — hermes a plataforma (gastro / barberia / ropa)

> 9/jul/2026. Continua ARQUITECTURA-MODULAR.md (6/jul). Ese doc definio el QUE
> (un codebase, packs por vertical). Este define el COMO empezamos hoy, con que
> orden, y donde vamos a flaquear. Basado en verificacion del estado real del
> repo + tus 4 decisiones (abajo).

---

## 0. TL;DR honesto (leer primero)

**Si, vale la pena mantener lo que hay. Reescribir seria tirar meses de trabajo
probado en produccion. Pero hay que separar dos cosas que hoy estas mezclando en
una sola frase ("operativo hoy con los 3 rubros"): la DEMO para vender y la
PLATAFORMA para entregar. No son lo mismo y no entran en la misma semana.**

Tres verdades que ordenan todo:

1. **De la arquitectura modular no hay NADA construido.** Lo verifique en el
   repo: no existe `src/modules/registry.js`, ni columna `vertical`, ni
   `products.type`, ni `product_variants`, ni tablas `appointments/staff/services`,
   ni pagina de registro. `clients/` tiene solo los 3 gastro. Una sola branch.
   Barberia y ropa **no estan "menos desarrolladas": no existen en codigo.** Hoy
   el sistema es 100% gastro.

2. **Tus 4 respuestas tienen una tension interna que hay que resolver, no
   ignorar:** elegiste "1 DB multi-tenant" + "demo vendible ya" + "ambos rubros
   tienen cliente" + "POS core en la base". La migracion multi-tenant sola son
   semanas; la demo vendible son dias. Meterlas en el mismo carril = no terminas
   ninguna. La solucion es dos tracks paralelos con objetivos distintos
   (seccion 1).

3. **Los 3 gastro estan dormidos: se consolidan en el edificio unico.** No tienen
   operaciones (solo ocupan espacio en Supabase), asi que **no hay caja que romper**
   y no hay razon para mantenerlos aislados. Se recrean como 3 tenants del edificio
   multi-tenant nuevo, con gastro funcionando de verdad adentro (esa es la prueba
   de que el edificio es funcional). Simplifica todo: no hay modo dual ni
   grandfathering. Y sigue esquivando el refactor riesgoso `recipes -> products`
   (tus 4 bugs historicos de schema-sync): el edificio nace con `products` limpio
   desde el dia 0 y gastro entra como `type='composite'`. _(Corrige mi
   recomendacion previa, que asumia gastro vivo.)_

---

## 1. Decisiones tomadas (tus respuestas del 9/jul)

| # | Pregunta | Tu respuesta | Consecuencia |
|---|----------|--------------|--------------|
| 1 | Modelo de tenancy | **1 DB compartida (multi-tenant, RLS)** | Habilita signup instantaneo. Un solo edificio para todos: los 3 gastro (dormidos) se recrean como tenants ahi. |
| 2 | Que es "operativo hoy" | **Demo vendible ya** | Prioridad = algo presentable esta semana para cerrar. No production-hardened. |
| 3 | Rubro primero | **Ambos tienen cliente** | No puedo puntear uno. Barberia primero por esfuerzo (pack mas chico), ropa pegada atras. |
| 4 | POS + Caja core | **"Decidi vos, pero me parece importante para la base"** | POS entra en el kernel core. Sirve a los 3 rubros y a tus gastro en mostrador. |

---

## 2. Las dos pistas (esto resuelve la tension)

### Track A — DEMO vendible (dias, arranca ya)

Objetivo unico: **cerrar la venta.** Algo que le mostras a un prospecto de
barberia o de ropa y dice "si". No toca la migracion multi-tenant, no promete
features que no existen.

Forma recomendada: **prototipo interactivo standalone** (front-end, data
sembrada, sin backend real). Es lo mas rapido, riesgo cero sobre el sistema
vivo, y alcanza de sobra para vender. Tres pantallas por rubro con el
vocabulario cambiado y el flujo ancla mockeado:

- **Barberia:** agenda con turnos + ficha de cliente + POS con propina.
- **Ropa:** grilla de variantes (talle/color) + stock por SKU + POS con codigo de barras.
- **Gastro:** lo que ya tenes, para mostrar que la plataforma es una sola.

Alternativa (mas lenta, reusable): un 4to y 5to "client" sembrado sobre la
arquitectura actual (`clients/barberia-demo`, `clients/ropa-demo`) con
vocabulario y data fake. Se parece mas al admin real pero cuesta mas y sigue
siendo fachada. **Recomiendo el prototipo standalone**: "vendible ya" = velocidad,
y los packs de verdad conviene construirlos recien cuando hay un cliente pago.

Honestidad: la demo es un Potemkin controlado. Vende. **No la confundas con el
producto** y no le pongas fecha de entrega a lo que en la demo es un dibujo.

### Track B — PLATAFORMA real (semanas, arranca al cerrar 1 venta)

Objetivo: entregar de verdad. Shared DB multi-tenant, module registry, POS core,
packs por rubro dimensionados **al cliente que efectivamente pago**. Orden en la
seccion 7.

Regla de oro (ajustada al gastro dormido): el **edificio** arranca ya — recrear
gastro real adentro es la prueba de que es funcional, y no dependes de una venta
para eso. Lo que SI espera al cliente que pague son los **packs pesados** (agenda
de barberia, variantes de ropa): no los construyas completos para 0 clientes.

---

## 3. Estructura tecnica de la plataforma (Track B)

### 3.1 Modelo de datos multi-tenant

Un proyecto Supabase "plataforma" nuevo. Cada tabla de negocio lleva `tenant_id`
+ RLS. La DB nueva nace limpia (no arrastra el legado gastro).

```
tenants        { id, slug, vertical('gastro'|'barber'|'retail'), plan,
                 owner_user_id, settings jsonb, created_at }
profiles       { id, tenant_id, role, ... }         -- ya existe, + tenant_id
products       { id, tenant_id, type, name, price, ... }
                 type: 'composite' | 'simple' | 'variant_parent' | 'service'
product_variants { id, product_id, tenant_id, talle, color, sku, barcode, stock }
orders / order_items / payments / ...  -- todas + tenant_id + RLS
```

- `current_tenant()` sale del JWT claim o de `profiles.tenant_id`. RLS en TODAS
  las tablas: `USING (tenant_id = current_tenant())`. Sin excepcion.
- `products.type` nace bien de entrada: no hay rename `recipes -> products`
  porque en la DB nueva la tabla ya se llama `products`. El pack gastro usa
  `type='composite'` con su BOM. **Asi esquivas el nudo de acoplamiento de la
  seccion 2 del doc de arquitectura sin tocar tenants vivos.**
- Los 3 gastro (dormidos, sin data transaccional que valga migrar) se recrean
  como tenants del edificio nuevo. Un solo proyecto Supabase para todos. Antes de
  vaciar los 3 proyectos viejos: snapshot por si hay config/catalogo/branding que
  quieras conservar (ver checkpoint en seccion 7, B1).

### 3.2 Module registry (el corazon del codigo)

`src/modules/registry.js`: cada modulo se declara, no se hardcodea.

```js
{ id: 'agenda', navItem: {...}, routes: [...], requiredFlags: ['AGENDA'],
  verticals: ['barber'] }
```

BottomNav, AdminDrawer y las rutas lazy del admin se **generan** del registry
segun `tenant.vertical` + flags. Es refactor de UI, no de datos.

- **Kernel (todos los rubros):** Auth, Settings, Branding, Productos, POS/Pedidos, Pagos, Ventas.
- **Opcionales activables:** Stock, Compras, Gastos, CRM, Push, Cupones, Facturacion.
- **Pack gastro:** Recetas/BOM, Menu Engineering, Food Cost, delivery, combos.
- **Pack barberia:** Agenda, Staff+comisiones, ficha de visita, memberships.
- **Pack ropa:** Variantes+barcode, Devoluciones/nota de credito, etiquetas, temporadas.

Vocabulario por vertical via namespace en `src/locales/es-AR` (gastro="Recetas",
barber="Servicios", retail="Productos"). Cero renombres en codigo.

### 3.3 POS + Caja core (tu instinto es correcto)

Va en el kernel porque barberia y ropa cobran en el local si o si, y ademas le
sirve a tus 3 gastro en mostrador. Es el modulo transversal de mas palanca.

- **Scope demo:** carrito, busqueda por nombre/barcode, venta rapida, cobro
  (efectivo / MP QR), ticket.
- **Scope real:** apertura/cierre de caja + arqueo, pago mixto (split),
  recargo tarjeta / descuento efectivo, cuenta corriente (fiado), datos de
  posnet, impresion termica de ticket y etiquetas.

El mismo POS, cambiando `products.type`, sirve a los 3 rubros.

---

## 4. Los 2 rubros nuevos (el foco que pediste)

### 4.1 Barberia — el ancla es la AGENDA, no el POS

Research USA (Squire, Booksy, Boulevard): el rubro paga por la agenda + comisiones,
no por el stock. Todo orbita el turno.

- **Agenda:** turnos, staff asignable, duracion por servicio, buffers,
  recordatorios push/SMS (bajan no-shows), walk-in queue.
- **Servicios** = `products type='service'` (`duration_min`, staff). "Recetas"
  desaparece del nav.
- **Staff:** comisiones por servicio/producto, login por empleado, permisos
  granulares, opcional booth rent (alquiler de silla).
- **Ficha de visita:** historial de cortes, fotos, notas del barbero. Es TU CRM
  + un historial por visita — el dato que retiene al cliente.
- **Memberships/paquetes:** x cortes prepagos, suscripcion mensual.

Honestidad: la agenda parece un CRUD y no lo es. Solapamientos, buffers,
recurrencia, no-shows, zonas horarias. **Es EL producto del rubro (Squire vive
de eso a USD 100+/mes). Presupuestala como modulo grande, no como pantalla.**

### 4.2 Ropa/tienda — el ancla es el INVENTARIO POR VARIANTE

- **Matrix:** producto padre + atributos (talle/color, max 3), cada combinacion
  = SKU con stock/precio/barcode propios (`product_variants`).
- **Barcode end-to-end:** etiquetas, scan para vender, scan para recibir compra.
- **Devoluciones/cambios/nota de credito (store credit):** en ropa el cambio de
  talle es flujo DIARIO, no excepcion. Es requisito, no lujo.
- **Compras/PO** con recepcion parcial y reorder por variante; temporadas/markdowns.
- **E-com sincronizado con el local:** tu catalogo-pro + stock unificado ya
  apunta ahi.

Media cancha ya la tenes: Compras + Proveedores + Merma cubren la mitad del
rubro. Falta variantes + barcode + devoluciones.

---

## 5. La pagina de registro (signup)

- **Track A (demo):** landing por rubro + form que captura el lead (negocio,
  rubro, whatsapp) y te avisa. NO provisiona nada. Sirve para vender y medir
  demanda real antes de construir.
- **Track B (real):** signup -> crea row en `tenants` con el vertical elegido en
  la shared DB -> el user queda owner -> se activan los modulos del pack de ese
  vertical -> wizard de onboarding (branding, primeros productos/servicios).
  Onboarding instantaneo: **esto es exactamente lo que habilita la DB compartida
  que elegiste** (con 1-proyecto-por-tenant era imposible hacerlo instantaneo).

Flujo: elegir rubro -> datos del negocio -> slug/subdominio -> entra al admin ya
con su pack montado.

---

## 6. Donde vamos a flaquear (honesto) y como lo arreglamos

| # | Riesgo | Por que duele | Fix |
|---|--------|---------------|-----|
| 1 | Confundir demo con producto | Vendes algo que en la demo es dibujo y no lo podes entregar en el plazo prometido | 2 tracks separados; la demo captura lead, no promete fechas de features inexistentes; **hoja REAL HOY / MOCK abierta en cada demo (ver DEMO-REAL-VS-MOCK.md)** |
| 2 | Vaciar los 3 Supabase viejos sin backup | Perder config/catalogo/branding reusable (aunque esten dormidos, rehacerlo a mano es tiempo) | Snapshot/export de los 3 antes de pausar o borrar; recrearlos como tenants en el edificio nuevo |
| 3 | **RLS mal hecho = fuga entre tenants** | Un cliente ve la data de otro. Es el bug mas caro y mas letal de un multi-tenant | RLS obligatorio en TODAS las tablas desde el commit 1 + test automatico de aislamiento (un tenant no puede leer otro). Innegociable |
| 4 | Subestimar la agenda | Parece CRUD, es el 80% del valor de barberia | Presupuestarla como modulo grande; en la demo es un mock, no una promesa |
| 5 | products.type / packs / Zod | Es la zona exacta de tus 4 bugs de schema-sync historicos | En DB nueva nace con `products` (sin rename); manifest + Zod + pre-commit desde el commit 1 |
| 6 | Escala de soporte | Vender de a muchos multiplica soporte y onboarding, no solo codigo | Definir planes/pricing y limites por plan ANTES de abrir el signup; feature flags por plan |
| 7 | Falta de foco | 2 rubros + POS + multi-tenant + signup a la vez = nada terminado | Orden estricto (seccion 7). Una fase, un entregable, se cierra y recien sigue |
| 8 | Bugs recurrentes del repo | UTF-8 cortado, corrupcion del mount, chunks viejos (ya documentados en CLAUDE.md) | Aplican igual. Escribir codigo/docs solo con herramientas del lado Windows; nunca via el mount Linux |

---

## 7. Orden de construccion

### Track A — esta semana (demo vendible)
- **A1.** Prototipo barberia: agenda + ficha + POS con propina (mock, data sembrada).
- **A2.** Prototipo ropa: grilla de variantes + stock por SKU + POS con barcode (mock).
- **A3.** Landing + signup-lead por rubro (captura, no provisiona).

### Track B — el edificio unico (arranca ya; packs pesados al cerrar venta)
- **B1.** Edificio multi-tenant: `tenants` + `tenant_id` + RLS + **test de aislamiento** + **recrear los 3 gastro como tenants (gastro REAL, no mock: es la prueba de que el edificio funciona).** Checkpoint: snapshot de los 3 Supabase viejos antes de vaciarlos.
  - _[HECHO 9/jul] Proyecto `hermes-platform` (sa-east-1) creado. Fundacion (tenants, tenant_members, products type, RLS) aplicada. Test de aislamiento 4/4 en verde. Advisors de seguridad limpio. SQL versionado en `platform/`. Falta: recrear los 3 gastro como tenants + portar schema gastro._
- **B2.** Module registry + nav por vertical + vocabulario (refactor sin features nuevas).
- **B3.** POS + Caja core.
- **B4.** Pack del rubro que pago primero (si es barberia: agenda+staff; si es ropa: variantes+devoluciones).
- **B5.** El otro pack.
- **B6.** Signup real (provisioning en shared DB + wizard de onboarding).

Barberia antes que ropa **solo si empatan**: su pack es mas chico (agenda+staff
vs variantes+barcode+devoluciones). Si el primer "si" es de ropa, ropa va primero.

---

## 8. Vale la pena mantener lo que hay? (respuesta directa)

**Si. Mantener, no reescribir.** Reescribir seria tirar: catalogo-pro, pagos MP,
auth+roles, CRM, push, facturacion AFIP, 3 tenants facturando y todos los
guardrails (pre-commit, schema-sync, integridad de archivos). Eso es trabajo
hecho y probado en produccion.

Lo unico verdaderamente nuevo es la **DB multi-tenant** y los **2 packs**
(barberia, ropa). El core se reusa ~80%. El POS core te faltaba igual, con o sin
verticales nuevos.

**El riesgo real no es el codigo: es el foco y la venta. El codigo esta.**

---

## 9. Mejora al proceso (siempre una)

1. **Validar la venta antes de construir la plataforma.** Que Track A consiga
   un "si" firmado, y recien ahi arranca Track B, dimensionado a ese cliente. No
   inviertas semanas de multi-tenant para cero clientes. Ordena la plata y el
   tiempo, y te evita construir para nadie.
2. **Definir planes/pricing por rubro ahora** (aunque sea borrador). El registry
   y los feature flags se disenan alrededor de que incluye cada plan. Si lo
   dejas para despues, rehaces los flags. Media hora ahora, dias ahorrados luego.
3. **Hoja REAL HOY / MOCK antes de cada demo (una pagina, dos columnas).** Antes
   de mostrar, escribi que esta REAL HOY y que es MOCK. Cuando el prospecto
   pregunte "y esto cuando lo tengo?", la respuesta sale de esa hoja, no del
   entusiasmo del momento. Es la vacuna concreta contra el riesgo #1 — el unico
   que puede convertir una venta en un problema. Vive en `DEMO-REAL-VS-MOCK.md`
   y se actualiza en cada demo: una fila pasa de MOCK a REAL HOY solo cuando
   esta en produccion y probada.

---

## 10. Proximo paso concreto

Arrancar **A1 (prototipo barberia)** como primer entregable de la demo: es el
pack ancla mas vendible y valida el vocabulario del registry. Con eso en mano,
salis a mostrar y el primer "si" define el orden de Track B.
