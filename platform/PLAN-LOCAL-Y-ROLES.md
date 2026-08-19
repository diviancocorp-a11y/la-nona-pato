# PLAN — El local fisico y el ecosistema de roles (Etapa 6)

> **v2, 19/ago/2026.** La v1 fue revisada contra Square, Toast, Fresha, Shopify
> y 7shifts. Esa revision corrigio siete cosas y agrego cinco; casi todo se
> acepto. La seccion 9 registra que se acepto, que no, y por que.
>
> Continua `PLAN-ERP.md`. `PLAN-MULTI-RUBRO.md` (9/jul) quedo historico:
> afirma que no existe `src/modules/registry.js` y hoy existe.

---

## 0. TL;DR

**El edificio tiene mas tablas que pantallas.** `appointments`, `staff`,
`product_variants`, `product_returns`, `cash_sessions`, `payments` y
`payment_methods` existen desde las migraciones 0004-0007 y sus modulos siguen
en `implementado: false`. El cuello de botella no son ideas: es UI sobre modelo
que ya esta.

### El criterio que ordena todo este plan

La revision propuso agregar canales, waitlist, ledger de inventario, audit log,
idempotencia, forecast de personal, memberships, gift cards, endless aisle,
adaptadores fiscales por pais y un motor de oportunidades. **Cada una es
correcta por separado. Sumadas son mas trabajo que todo lo construido hasta
hoy, y el edificio todavia no tiene un solo cliente real usandolo.**

Asi que la pregunta no es "¿esto es buena idea?" —casi todo lo es— sino:

> **¿Es barato ahora y caro despues, o cuesta lo mismo siempre?**

- **Barato ahora, caro despues** -> entra YA, aunque no tenga pantalla.
  Todo lo que cambia la forma del dato: `branch_id`, ledger de inventario,
  `business_date`, audit log, claves de idempotencia, columnas de deposito,
  scope de roles. Migrar esto con datos reales cargados es reescribir.
- **Cuesta lo mismo siempre** -> espera al cliente que lo pida.
  Todo lo que es pantalla o algoritmo sobre datos que ya guardamos: UI de
  waitlist, forecast de staffing, memberships, endless aisle, pricing.

### Modelar no es construir

| Tipo de cambio | Ahora | Espera cliente |
|---|:--:|:--:|
| Cambia la estructura del dato | ✅ | |
| Despues exige una migracion cara | ✅ | |
| Afecta integridad financiera | ✅ | |
| Afecta historial o auditoria | ✅ | |
| Habilita multi-sucursal futuro | ✅ | |
| UI nueva sobre datos que ya guardamos | | ✅ |
| Algoritmo avanzado / forecasting | | ✅ |
| Memberships, endless aisle, waitlist UX | | ✅ |
| Automatizacion de campanas | | ✅ |

**Salvedad que decide los casos dudosos:** si una funcionalidad futura exige una
columna o entidad barata hoy que despues seria cara de introducir, **se modela
ahora aunque la pantalla espere**.

Este criterio importa mas que cualquier lista de features. La pregunta correcta
para esta etapa no es "que tiene el mercado que Dico no tiene" —esa produce mas
features, siempre— sino **"que estructura necesita Dico para construir eso
despues sin rehacer el edificio"**.

---

## Etapa 0 — Transversal, antes que las features

La revision la propuso y es correcta, con una correccion: **parte ya esta
hecha.**

### 0.1 Idempotencia — el estado real, verificado

| Operacion | Estado |
|---|---|
| `complete_order` | **Ya es idempotente.** `for update` + guard de estado + corta si el pedido ya tiene ventas |
| `signup_tenant` | **Ya** (migracion 0019) |
| `mp-webhook` (legacy) | **Ya** |
| `submit-order` | **No.** Doble click o reintento de red = dos pedidos |
| `register_waste`, `registerPurchase` | **No.** Reintento = descuento doble |

O sea: el patron esta aprendido y aplicado donde dolio, y **no se porto al
resto**. Es exactamente el "portar no es copiar" del handoff del 18/ago.

**Que se hace:** clave de idempotencia por operacion (`client_request_id` que
manda el cliente) en las RPC y functions publicas que crean plata o mueven
stock. Barato, y es la unica de la lista que si sale mal cuesta dinero real de
un cliente.

### 0.2 `business_date` — el dia operativo no es el dia UTC

Un turno de caja que cruza medianoche pertenece al dia anterior. Hoy `sales.date`
es `current_date` (UTC) y el P&L se corta a medianoche UTC. Con un pais nadie lo
nota; con dos, el dia de un tenant no coincide con su dia.

`business_date` se calcula en la zona de la sucursal, con hora de corte
configurable. Es una columna y una funcion, no un proyecto.

### 0.3 Audit log

Quien, que, cuando, valor anterior, valor nuevo. Sobre: anulacion de venta,
cambio de precio, ajuste de stock, apertura y cierre de caja, cambio de
comision, cambio de rol, propina.

No es una feature: es lo que hace defendible tener un contador externo, varias
sucursales y siete roles. Una tabla y triggers.

---

## 1. Los ejes del alta

Hoy el registry tiene UNO: `vertical`. Necesita cuatro dimensiones.

### 1.1 Rubro — `vertical`
gastro | barber | retail. Sin cambios.

### 1.2 Modelo operativo + **canales**

La v1 decia `operation_mode = fisico | virtual | hibrido` y la revision tiene
razon: mezcla dos cosas. El modo dice **si hay salon**; los canales dicen **por
donde entra la demanda**, y son varios a la vez.

    operation_mode  fisico | virtual | hibrido
    channels[]      walk_in, counter, table_service, appointment,
                    online_booking, delivery, pickup, ecommerce,
                    whatsapp, marketplace

Una barberia es `fisico` + `appointment, walk_in, online_booking`.
Una dark kitchen es `virtual` + `delivery, pickup`.

**Dato que refuerza la correccion: `orders.channel` YA EXISTE.** El edificio ya
etiqueta por donde entro cada pedido; lo que falta es declararlo a nivel de
tenant para que el registry sepa que encender.

**Override de canal por sucursal: se modela, no se construye.** La columna
admite que una sucursal difiera; la UI para editarlo espera al primer tenant con
dos locales de canales distintos.

### 1.3 Pais

Define moneda, formato, zona horaria, identificador fiscal (CUIT / RUT / RFC /
NIT), impuestos y pasarela por defecto.

- **Barato, entra en 6a:** constantes por pais.
- **Caro, uno por uno:** la facturacion electronica. Va detras de un
  **`fiscal_adapter`** —`FiscalService.issueInvoice()` y el nucleo no sabe como
  factura cada pais— con AR (ARCA) como unico adaptador real al principio.
  **Ofrecer multi-pais sin esto es vender un sistema que no factura.**

**La moneda es campo propio, no derivado.** El pais la propone; hay rubros que
costean en dolares y venden en pesos.

### 1.4 La formula

    visible = modulos(vertical, modo, canales) ∩ permisos(rol, scope)

**Ningun componente pregunta `if (modo === 'fisico')`.** Le pregunta al registry.

---

## 2. Scheduling: un algebra, dos modelos

La v1 decia "mesa, silla y turno de empleado son el mismo motor". **La revision
corrige bien y se acepta.** La intuicion era correcta y la conclusion demasiado
literal: comparten la matematica, no la entidad.

    Scheduling
    ├── Resource booking      mesa, silla, estacion, sala
    │     appointments, reservations, waitlist
    └── Workforce scheduling  persona
          shifts, availability, absences, attendance

**Comparten** —y esto si es una sola implementacion— el algebra de intervalos:
disponibilidad, solapamiento, deteccion de conflictos, capacidad en una ventana.
Es una libreria, no una tabla comun.

**No comparten** el ciclo de vida: una mesa no pide vacaciones y un empleado no
se combina con otro para sentar a seis.

### 2.1 `appointments` necesita cinco campos mas

Ya tiene `staff_id`, `service_id`, `starts_at`, `ends_at`, `status`. Le faltan:

    resource_id          mesa o silla
    source / channel     de donde vino la reserva
    party_size           cuantos son (gastro)
    deposit + policy     seña y politica de cancelacion
    confirmation_status  confirmado, llego, no-show

Y el estado deja de ser una fila de calendario para ser un flujo real:
`reservado -> confirmado -> llego -> atendiendo -> terminado`, con `no_show` y
`cancellation_reason`.

**Las señas se modelan ahora aunque MercadoPago venga despues.** Son columnas;
el gateway se enchufa cuando exista. La v1 las difirio de mas.

### 2.2 Waitlist entra como entidad

"Quiero corte hoy a las 18" y "somos 4 esperando mesa" son el mismo problema:
**demanda > capacidad ahora**. Es la cola de walk-in que ya habiamos
identificado, y es la puerta de la demanda perdida (seccion 5.2).

Entidad ahora, pantalla cuando haya local.

---

## 3. Sucursales e inventario

### 3.1 `branch_id` entra ahora

No es "solo para caja": es contexto operativo de casi todo.

    Con sucursal:  orders, sales, cash_sessions, appointments, expenses,
                   purchases, inventory_movements, staff_assignments
    Globales:      customers, products, services, employees
                   (se relacionan con sucursal, no viven en una)

Todo tenant nace con una sucursal implicita y la UI no muestra selector hasta
que exista la segunda.

### 3.2 El stock pasa a ser un libro, no un numero

**Esta es la correccion mas valiosa de la revision.** La v1 iba a resolver
multi-sucursal agregando `branch_id` al numero de stock. Eso deja la deuda
intacta.

Hoy el stock del edificio se muta desde tres lugares (compra en 0030, compra v2
en 0031, merma en 0033), cada uno haciendo `set stock = stock ± qty`. **No hay
forma de responder por que el stock dice 7.** Con sucursales y transferencias
eso se multiplica.

    inventory_movements
      id, tenant_id, branch_id, product_variant_id / ingredient_id,
      type, quantity, reference_type, reference_id, created_by, created_at

    type: purchase +, sale -, waste -, return +,
          transfer_out -, transfer_in +, adjustment +/-

    inventory_balance    saldo derivado (cacheado por rendimiento)

`reference_type` + `reference_id` es lo que cierra el circulo: cada movimiento
apunta a la compra, venta, merma o transferencia que lo genero.

**El objetivo no es saber que hay 7. Es poder contestar por que hay 7:**

    +20 compra   -5 ventas   -3 merma   -4 transferencia   -1 ajuste  =  7

Y hay una razon extra para hacerlo aca: **el patron ya existe y funciona.**
`complete_order` y `register_waste` ya asientan y descuentan en una transaccion.
Falta la tabla de asientos.

Habilita, sin trabajo adicional despues: transferencias, stock reservado,
auditoria, costeo, ecommerce, compras distribuidas.

---

## 4. Roles

### 4.1 Rol no alcanza: hacen falta scope y jobs

La v1 proponia siete roles planos. **La revision tiene razon**: una persona es
barbero *y* cajero, o encargado en una sucursal y vendedor en otra.

**Pero no construyo un motor de permisos configurable.** Es de las cosas que mas
tiempo consumen y menos piden los primeros veinte clientes. La version que
resuelve el caso real con una migracion chica:

    tenant_members  (tenant_id, user_id, branch_id, roles[])

Una fila por persona y sucursal, con varios roles. Eso cubre multi-rol y
multi-sucursal. **Los permisos siguen derivando del rol en el registry**
—declarativos, versionados con el codigo— y no de una tabla que el usuario
edita. La tabla de permisos custom se hace cuando aparezca el cliente que la
pida, y para entonces el scope ya va a estar en su lugar.

### 4.2 Los siete roles

| id | Se muestra como | Abre en | Alcance |
|---|---|---|---|
| `owner` | Dueno | **Dico** | Todo, todas las sucursales |
| `manager` | Encargado | El turno de hoy | Su sucursal, sin fiscal |
| `cashier` | Cajero | Su caja | Su turno |
| `attendant` | Mozo / Barbero / Vendedor | Sus mesas o turnos | Lo suyo |
| `kitchen` | Cocina | Comandas | Preparar. Sin precios |
| `marketer` | Marketing | Campanas | Audiencias, no personas |
| `accountant` | Contador | Sus negocios | Fiscal y financiero |

**`attendant` es una capacidad, no un puesto.** Internamente
`service_operator`; el registry traduce a Mozo / Barbero / Vendedor. La revision
acierta: el backend no se llena de vocabulario comercial.

`kitchen` existe solo en gastro + fisico. Lo decide el registry.

### 4.3 Que ve cada uno

**+** completo · **~** acotado a lo suyo · **o** solo lectura · vacio = no lo ve.

| | Dueno | Encarg. | Cajero | Atend. | Cocina | Mkt | Contador |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Dico (IA) | **+** | ~ | | | | ~ | |
| Productos | + | + | o | o | o¹ | o | |
| Pedidos / comanda | + | + | + | ~ | ~² | | |
| Mapa de mesas | + | + | o | ~ | | | |
| Agenda / reservas | + | + | o | ~ | | | |
| Caja | + | + | ~ | | | | o |
| Stock | + | + | | o | ~³ | | |
| Compras y gastos | + | ~ | | | | | o |
| Ventas y P&L | + | ~⁴ | | ~⁵ | | o⁶ | **+**⁷ |
| Clientes | + | + | o | ~ | | ~⁸ | |
| Campanas | + | o | | | | **+** | |
| Equipo | + | ~⁹ | | ~¹⁰ | ~¹⁰ | | o¹¹ |
| Fiscal | + | | | | | | **+** |
| Configuracion | + | ~ | | | | ~¹² | |

1. Sin precio ni costo. 2. Preparar y marcar listo; no cobra ni anula.
3. Consumo y faltantes. 4. Su sucursal. 5. Sus ventas, comision y propinas.
6. Agregado por campana. 7. Ver 4.5. 8. Ver 4.4. 9. Turnos y asistencia.
10. Su ficha y disponibilidad. 11. Nomina. 12. Marca y catalogo.

### 4.4 Marketing: audiencias administradas, no listas

La revision matiza bien la regla de la v1. No es "el marketer no ve nada del
cliente": es que **la plataforma administra el targeting**. Ve segmento,
audiencia, consentimiento, canal, ultimo contacto, opt-out, campana y
resultado. No ve la lista de telefonos.

Eso habilita la cadena que importa:

    Segmento -> Campana -> Mensaje -> Conversion -> Ingreso

### 4.5 Contador: fiscal y financiero, no operativo

La v1 decia "solo comprobantes" y era demasiado estrecho. Necesita facturacion,
notas de credito y debito, IVA, ventas, compras, retenciones, percepciones,
cierres y conciliaciones. No necesita mesas, comandas ni empleados.

Es el unico rol que pertenece a varios tenants y no trabaja ahi. Su pantalla es
**la lista de sus negocios** con el estado de cierre de cada uno. Y es canal de
venta: un contador con diez clientes que cierra dos por Dico tiene ocho razones
para recomendarlo.

### 4.6 El permiso de UI no es seguridad

Toda restriccion que importe va tambien en RLS. Esconder el boton no protege la
tabla.

---

## 5. Propinas, recurrencia y demanda

### 5.1 Propinas: dominio propio, no un campo

La v1 planteaba Dicotip como "propina externa por defecto". **La revision tiene
razon en que eso es demasiado pobre**, sobre todo por el marco argentino: desde
2024 hay regulacion de propina electronica, y la propina no integra la
remuneracion.

> **A verificar con contador antes de construir.** Es cumplimiento, no
> arquitectura, y no lo verifique.

    tip
    ├── employee_direct     al alias del mozo (Dicotip)
    ├── employee_pool       repartida por regla
    └── merchant_collected  la cobra el local

    source · payment_method · recipient · distribution_rule · settlement_status

**Y no se ata a gastro.** Un barbero y un vendedor tambien reciben propina: es
una `capability: tips` del registry, que decide donde se habilita.

**Dicotip** es el caso `employee_direct` por QR: `staff.payout_alias`, QR en el
ticket, resena atada al mozo. Barato porque `dynamic_qrs` + `resolve_qr` ya
existen. _(Se llamaba Tipco; ese nombre lo usa una empresa de maquinaria
aceitera. Verificar que "Dicotip" este libre antes de imprimirlo en cada ticket.)_

### 5.2 Recurrencia: de avisarle al dueno a invitar al cliente

Si alguien se corta cada 15 dias, **el dia 13 recibe la invitacion a sacar
turno.** Es el salto de detectar a ejecutar, y es la forma mas directa de
convertir historial en facturacion.

Necesita: `rebook_interval` por cliente (observado, no declarado), el disparo
antes del vencimiento, y **"repetir el ultimo"** en un toque — que se apoya en
la ficha tecnica del corte (5.4).

### 5.3 Demand signal: la demanda perdida es un dato de primera

La v1 lo tenia solo para talles. Generalizarlo es de las mejores ideas de la
revision:

    demanda observada -> cumplida | perdida

Sirve para talle, color, servicio, horario, profesional, mesa y canal. Las
fuentes ya existen o entran en este plan: la solicitud desde el probador, la
waitlist, el turno que se pidio y no habia, el pedido que no se pudo tomar.
**Nadie registra esto, y es mejor senal que "stock bajo".**

### 5.4 Ficha tecnica del corte: sube a diferencial del vertical

    fade, guard, largo arriba, textura, barba, lineup, producto, notas, foto

Vuelve despues de 35 dias, "repetir el ultimo", y el barbero ve exactamente que
hizo. Es lo mas dificil de replicar con un ERP generico y alimenta 5.2. Deja de
ser transversal: es **core del vertical barberia**.

---

## 6. Lo que se suma a las ideas

**Huella dactilar -> WebAuthn, y nada mas por defecto.** La huella es dato
sensible (Ley 25.326) y una PWA no puede identificar por huella: verifica
"este dispositivo + este usuario". La v1 apilaba WebAuthn + geocerca + selfie;
**la revision corrige bien** — es demasiada acumulacion de datos para un
problema simple:

    Nivel 1  passkey / WebAuthn      por defecto
    Nivel 2  geocerca                senal opcional
    Nivel 3  selfie                  solo donde el negocio lo configure

**GPS de proximidad -> "voy en camino".** El navegador no despierta en segundo
plano; eso pide app nativa. El cliente toca "voy en camino" desde el
recordatorio y al llegar escanea el QR de entrada (`resolve_qr` ya existe).

**La joya de esa idea eran las preferencias.** Bebida, musica, barbero habitual.
Una columna en la ficha, y es lo que el cliente despues cuenta.

**Promo al que pasa cerca -> geo-segmentacion.** "A menos de 2 km, sin volver
hace 40 dias, martes 11:30". No detecta la esquina; le habla a la gente
correcta.

**La solicitud de talle desde el probador es dato de compra** (ver 5.3).

**Registradora antigua: si, pero acotada.** Alma en apertura, arqueo y cierre
—dos veces por dia—; grilla rapida para cobrar, que se repite 200 veces y se
mide en segundos.

---

## 7. Lo que no entra ahora

**Try-on de cara o cuerpo.** Caro, calidad inconsistente, y la foto de la cara
de un cliente guardada por un local ajeno es dato personal que el rubro no
necesita. **Reemplazo mejor:** galeria de trabajos reales del local, que en
barberia sale gratis de la ficha tecnica.

**Platos en 3D.** Un modelo por plato es trabajo manual por plato. Foto y video
con `uploadTenantImage`.

**Motor de permisos configurable, forecast de staffing, memberships, gift
cards, endless aisle, pricing dinamico.** Todos correctos y todos "cuestan lo
mismo siempre": esperan cliente. Lo que si entra es el modelo que no los
bloquea (ledger, scope, canales).

---

## 8. Etapas

> **Estado al 19/ago/2026:** Etapa 0, 6a y 6b **hechas y aplicadas**
> (migraciones 0039-0043). Sigue 6c.
>
> Lo que quedo pendiente a proposito: `ingredients.stock` se mantiene y se
> escribe igual que antes — el libro corre en paralelo hasta que se compare
> contra el numero viejo con datos reales. Cambiar la fuente de verdad del
> stock a ciegas es el error caro.


**0 — Transversal. HECHA (0040, 0043).** Idempotencia homogeneizada en
`submit-order`, `register_waste` y `register_purchase`; `business_date`
por sucursal; audit log con trigger generico.

**6a — Core contextual. HECHA (0039).** `vertical`, `country`, `currency`, `operation_mode`,
`channels[]`. Registry con las cuatro dimensiones. Alta en 3 pasos. Constantes
por pais; solo AR con fiscal.

**6b — Sucursales e inventario. HECHA (0041, 0042).** `branches` (con `timezone`), `branch_id`
donde corresponde, y la transicion del stock a `inventory_movement` +
`inventory_balance`.

**6c — Scheduling.** Algebra de intervalos compartida; resource booking
(mesas, sillas, waitlist, señas) y workforce por separado. Mapa de mesas con
`zone`, `combinable`, `min/max_party`. Enciende `agenda` y estrena utilizacion.

**6d — POS fisico.** Turno de caja sobre `cash_sessions`, comanda con cuenta
abierta, division y transferencia de mesa, propinas (5.1) con Dicotip.

**6e — Workforce.** Turnos, disponibilidad, ausencias, fichaje WebAuthn, costo
laboral. El forecast de staffing queda modelado, no construido.

**6f — Experiencias por rol.** Seccion 4.

**6g — Opportunity engine.** Las reglas de Dico hoy son 9 y **todas son de
higiene** ("te falta el precio"). Esta es la segunda familia: stock muerto,
capital inmovilizado, demanda perdida, clientes fuera de frecuencia, ocupacion
baja, sucursales desbalanceadas, margen anomalo.

    detecta -> explica -> recomienda -> puede ejecutar

**Explica no es opcional**: "recomiendo 120 porque vendio 83 en 4 semanas, lead
time 13 dias, quedan 29". Nadie confia en una caja negra, y el dato de Gartner
—11% acepta que una IA decida por ellos— dice que el producto es el copiloto,
no el piloto.

### Orden

0 -> 6a -> 6b -> 6c es estructura y no se reordena sin pagar migraciones.
6d, 6e, 6f y 6g se mueven segun que cliente aparezca primero.

Las cinco transversales (motivo de devolucion, cobertura en semanas, stock
muerto, radar de recurrencia, ficha tecnica) entran **con la pantalla que las
toca**. Es la unica regla que no se negocia: el diferencial se pone cuando la
pantalla nace, porque despues es un refactor.

---

## 9. Registro de decisiones sobre la revision

**Aceptado tal cual:** canales ademas de modo · separar resource booking de
workforce · ledger de inventario · WebAuthn solo, selfie como excepcion ·
propinas como dominio con distribucion y settlement · propinas no atadas a
gastro · waitlist como entidad · señas modeladas antes del gateway · audit log ·
`business_date` · `fiscal_adapter` por pais · contador fiscal-financiero ·
marketing con audiencias administradas · `attendant` como capacidad interna ·
demand signal generalizado · ficha tecnica como core de barberia · opportunity
engine como etapa propia · campos nuevos de `appointments` · mesas con zona y
combinable.

**Aceptado con recorte:**
- **Roles/permissions/jobs/scope** -> se acepta scope y multi-rol
  (`tenant_members` por sucursal con `roles[]`); **no** se construye motor de
  permisos configurable. Los permisos siguen declarados en el registry.
- **Override de canales por sucursal** -> se modela, no se construye.
- **Forecast de staffing** -> el modelo lo habilita; el algoritmo espera datos.

**Corregido en la revision:**
- **"Falta idempotencia"** -> `complete_order`, `signup_tenant` y `mp-webhook`
  ya la tienen, y bien. Falta en `submit-order`, `register_waste` y compras.

**Lo que la revision no cuestiona y hay que sostener a mano:** el alcance. Su
recomendacion es correcta pieza por pieza y, sumada, es mas trabajo que todo lo
construido hasta hoy — con cero clientes usando el edificio. De ahi el criterio
de la seccion 0: **modelar barato hoy, construir cuando haya quien lo use.**
