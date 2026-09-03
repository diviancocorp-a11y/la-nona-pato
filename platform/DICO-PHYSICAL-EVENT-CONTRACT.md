# Dico Physical — auditoría de señales y contrato de eventos

> Fase de auditoría. **No se conectó ningún evento, no se tocó UI, no se agregó
> API.** Base: `feat/dico-panorama-v1` en `6c7c208`.

---

## 0. El hallazgo que ordena todo lo demás

**Casi todas las señales del runtime ya tienen a Dico encima.** El aviso (Dico
2D + burbuja) cubre nueve reglas de higiene con su CTA; las oportunidades
cubren seis lecturas de negocio en tarjetas; los toasts cubren ~20
confirmaciones y fallos.

Sacar a Physical para cualquiera de esas sería **decir lo mismo dos veces, más
grande**. La pregunta útil no es "qué evento puedo mapear a una pose" sino
"qué momento no está bien resuelto hoy y mejoraría con el personaje presente".
Con ese filtro quedan **tres**, y uno de ellos ya tiene la decisión editorial
tomada.

---

## 1. Inventario de señales reales

### 1.1 Avisos — `src/modules/dico/reglas.js` → `DicoAvisos`

Nueve reglas, tres niveles, casi todas con un CTA que navega a una pestaña.
Hoy el usuario ve el contador junto a Dico 2D y, al tocarlo, una burbuja con
typewriter y el botón de acción.

| nivel | id | CTA | ¿Physical aporta? |
|---|---|---|---|
| alerta | `catalogo-vacio` | products / "Agregar…" | **sí** — es onboarding, ver §1.4 |
| alerta | `nada-visible` | products / "Revisar" | **sí, candidato** — falla silenciosa y grave |
| alerta | `sin-precio` | products / "Poner precio" | no — el aviso lo dice bien |
| alerta | `margen-negativo` | products / "Ver costos" | **sí, candidato** — necesita explicación |
| aviso | `insumo-sin-costo` | *(sin CTA)* | no |
| aviso | `stock-bajo` | finanzas / "Registrar compra" | no |
| aviso | `mes-sin-gastos` | finanzas / "Registrar gasto" | no |
| sugerencia | `sin-receta` | products / "Cargar receta" | no |
| sugerencia | `insumo-sin-clasificar` | stock / "Clasificar" | no |

**Riesgo de conectar el nivel entero:** el aviso se abre a demanda y el usuario
elige cuándo mirarlo. Si `alerta` sacara a Physical automáticamente, un negocio
con tres alertas abriría el panel con el personaje encima del workspace sin
haberlo pedido. Eso es exactamente el mascot event bus.

### 1.2 Oportunidades — `src/modules/dico/oportunidades.js` → `DicoOportunidades`

Seis lecturas (`no-rota`, `capital-inmovilizado`, `fuera-de-frecuencia`,
`ocupacion-baja`, `demanda-perdida`, `margen-flaco`), en tarjetas dentro del
workspace, **sólo en la pestaña de productos** y sólo para quien puede ver
números.

El propio componente documenta por qué no van con los avisos: *"un aviso de
higiene se atiende y se tacha; una oportunidad no se tacha, se piensa"*.

**¿Physical aporta?** No. Son lecturas para pensar, no intervenciones. Y ya
tienen su número a la vista, que era el punto.

### 1.3 Toasts — `PlatformAdmin.msg()` y `showToast` en los paneles

~20 puntos de llamada, 2400 ms, esquina de la pantalla. Mezclan éxito y error
en el mismo canal:

| origen | éxito | fallo |
|---|---|---|
| `OrdersPanel` | `Pedido → {estado}`, `Pedido cancelado` | `No se pudo actualizar/cancelar` |
| `ProductsPanel` | `{producto} creado/actualizado`, `Producto eliminado` | `No se pudo guardar` |
| `EquipoDelNegocio` | `Permisos actualizados`, `Ya no tiene acceso` | `No se pudo sumar/guardar/quitar` |
| `CobrosOnline` | `Conectado a MercadoPago` | *(usa `r.aviso`)* |
| `PlatformAdmin` | `Caja abierta`, `Caja cerrada…`, `Entrada/Salida registrada`, `Mesa guardada` | `No se pudo dar de baja`, `No se pudo guardar la posición` |

**¿Physical aporta?** **No, y conectarlo sería activamente malo.** Son
confirmaciones de rutina en medio de una tarea: guardar un producto, mover un
pedido. Sacar al personaje ahí interrumpe justo cuando el usuario está en
flujo, y en el caso de los errores **taparía el formulario que tiene que
corregir**.

El patrón de error es uniforme (`{ __error, message }`, 14 sitios en
`src/services/`), así que sería técnicamente trivial engancharlo — y esa
facilidad es la trampa.

### 1.4 Empty states

| pantalla | qué ve hoy | ¿Physical? |
|---|---|---|
| **Productos vacío** (`ProductsPanel:160`) | **Ya es una escena de Dico**: `DicoCoreEscena` con `estado="pregunta"`, `lookY={0.65}` (mirando hacia abajo), texto en burbuja y CTA `+ Agregar {producto}` | **Sí — el caso más fuerte** |
| Pedidos vacío (`OrdersPanel:246`) | texto plano: *"Todavía no entró ningún pedido / Cuando alguien compre en tu catálogo, aparece acá"* | no — no hay acción que dirigir; el pedido lo trae el cliente |
| Búsqueda sin resultados | *"Nada coincide con X"* | no |
| Mesas / personal vacíos | texto plano | no |

El empty state de productos **ya tiene la decisión editorial tomada**: alguien
decidió que ahí Dico explica, mira hacia el botón y ofrece la acción. Hoy lo
hace con el Dico 2D en escala grande (188 px) y una cara SVG. Es literalmente
"explicar + dirigir atención a un CTA concreto", que son los puntos 1 y 2 del
principio.

### 1.5 Estados que piden acción

| origen | estado | hoy | ¿Physical? |
|---|---|---|---|
| `AdminPushBanner` | dispositivo sin suscribir a avisos de pedido | banner en Inicio, se calla 7 días si lo descartan | no — ya insiste lo justo |
| `PantallaDeCobro:161` | *"La caja está cerrada. Podés cobrar igual, pero este pago no va a…"* | aviso inline dentro del modal | **no** — Physical taparía el modal en el que está cobrando |
| `PanelDeHoy` | tenants en mora, sin primer valor | cifras con `alerta` | fuera de alcance: vive en `Consola.jsx`, no en el admin del tenant |

### 1.6 Disparadores actuales de `DicoPresence`

**Uno solo:** el click del usuario sobre Dico 2D → `OPEN_PHYSICAL`. Cerrar es
la ranura del Slot. **No existe hoy ninguna invocación de Physical desde el
sistema**, y ese es todo el trabajo de la fase siguiente.

### 1.7 Lo que NO existe (y por eso no se propone)

- **No hay realtime de pedidos en el admin del edificio.** `loadOrders` corre
  una vez al montar (`PlatformAdmin:414`). El realtime que existe es del tema
  (`App.jsx:155`) y del estado de un pedido en el catálogo del cliente
  (`OrderStatusCard.jsx:41`). **"Entró un pedido nuevo" no es una señal
  disponible**, aunque sea el candidato obvio para `success`.
- No hay evento de "primer cobro" en el admin del tenant: `first_value_at`
  vive en la consola de Divianco.
- No hay señal de "fallo repetido" ni de "el usuario está trabado".

---

## 2. Qué conectar y qué no

### Sí — los tres que ganan el lugar

1. **Catálogo vacío / primer producto.** Onboarding, con CTA concreto y
   decisión editorial ya tomada. Es el único caso donde Physical *reemplaza*
   algo en vez de agregarse.
2. **`nada-visible`** — todos los productos apagados. La página se ve vacía
   para el cliente y el dueño no tiene forma de notarlo desde adentro. Falla
   grave, silenciosa y de un click. Merece que alguien salga a decirlo.
3. **`margen-negativo`** — "perdés plata en cada venta". Es el único aviso
   cuya consecuencia no es obvia leyendo el título: necesita explicación, no
   un ítem tachable.

### No — y por qué

| señal | por qué no |
|---|---|
| toasts de éxito de rutina | interrumpen el flujo; el toast ya confirma |
| toasts de error de guardado | **taparían el formulario a corregir** |
| avisos de higiene (`sin-precio`, `stock-bajo`, `sin-receta`, …) | el aviso 2D ya los resuelve; sacar Physical es repetir más grande |
| oportunidades | son para pensar, no intervenciones |
| caja cerrada al cobrar | taparía el modal de cobro |
| banner de push | ya insiste lo justo |
| carga / `processing` | **se queda en Dico 2D + Volt**, que es exactamente para lo que se construyó |

---

## 3. Evento → pose → burbuja → ciclo de vida

| # | señal (existente) | pose | burbuja | tipo | salida |
|---|---|---|---|---|---|
| 1 | catálogo vacío (`products.length === 0`) | `pointDown` — el CTA está **abajo** de Dico en esa tarjeta | sí: qué es y por qué | **B** espera acción | al usar el CTA, o al guardar a Dico |
| 2 | `nada-visible` | `worried` | sí | **B** espera acción | al usar "Revisar", o al guardar |
| 3 | `margen-negativo` | `explain` — no hay un target direccional | sí | **B** espera acción | al usar "Ver costos", o al guardar |

**Sobre las poses, con el criterio del brief:**

- `pointDown` sólo en el caso 1, porque ahí **existe** un target abajo (el
  botón de la tarjeta). En los otros dos el CTA está en la burbuja, sin
  dirección física: va `explain`.
- `worried` sólo en `nada-visible`: problema recuperable de un click. No se usa
  para cualquier alerta.
- `error` **no se usa todavía**: no hay ningún fallo en el runtime que sea
  suficientemente fuerte y que no esté mejor resuelto por el toast.
- `success` **no se usa todavía**: el candidato natural —entró un pedido, se
  cobró el primero— **no existe como señal** (§1.7). Conectarlo a un toast de
  rutina lo devaluaría.
- `thinking` **no se usa**: no es `processing`. Sin un momento de análisis real
  que mostrar, sería decoración.
- `pointUp` **no se usa**: no hay ningún CTA arriba de donde Physical aparece.
- `idle` **no es un estado de permanencia**: es la pose con la que entra y con
  la que espera dentro de una intervención, nunca un motivo para estar afuera.

**Tipos, como pide el brief:**

- **A — transitorias** (aparecen, comunican, se van): ninguna en el primer
  lote. Se reservan para cuando exista una señal de resultado importante.
- **B — esperan acción**: las tres de arriba.
- **C — no sacan a Physical**: todo lo de la tabla del §2.

---

## 4. Ownership y API mínima

**No hace falta `requestPhysical()` ni un bus.** La máquina que ya existe
resuelve el 80%: `DicoPresence` es dueño de visible/hidden y ya tiene
`OPEN_PHYSICAL` / `CLOSE_PHYSICAL`.

Lo mínimo es **darle carga útil al evento que ya existe**:

```
OPEN_PHYSICAL  →  { pose, mensaje, cta?, anclaje? }
```

| responsabilidad | dueño | ya existe |
|---|---|---|
| visible / hidden | `DicoPresence` (máquina) | ✅ |
| `pose` actual | `DicoPresence`, pasada al Slot | ✅ el Slot ya la acepta |
| pose saliente / cruce | `DicoPhysical`, interno | ✅ |
| mensaje | `BurbujaDico` | ✅ |
| reducedMotion | `DicoPhysical` | ✅ |
| **quién decide** | **`PlatformAdmin`**, que es quien ya calcula `avisos` y `products` | ❌ falta |

El productor sería una sola prop hacia abajo —el mismo camino por el que hoy
baja `onIr`— y **no un bus global**: quien conoce el estado del negocio ya es
`PlatformAdmin`, y ya se lo pasa a `DicoPresence`.

**Regla dura sugerida:** una intervención Physical **sólo puede nacer de una
acción del usuario o de un cambio de estado que el usuario acaba de provocar**.
Nunca de "al entrar al panel había N alertas". Sin esa regla, el caso 1 abre el
personaje encima del workspace en cada login de un negocio nuevo.

---

## 5. Placement, con los casos reales

Medido en la app (`.qa-lite/artifacts/physical-poses/poses.json`):

| | dónde aparece Physical hoy | qué tapa |
|---|---|---|
| desktop 1440 | x 232..522, y 34..247 | la franja superior izquierda del workspace — ahí vive la tarjeta de oportunidades |
| mobile 390 | tinta x 47..338, en el flujo | empuja el contenido, no lo tapa |

**Los tres casos del primer lote, contra ese placement:**

| caso | dónde está el objetivo | ¿sirve el placement actual? |
|---|---|---|
| catálogo vacío | tarjeta centrada en el workspace (~x 700 a 1440) | **no del todo**: Physical queda a la izquierda y `pointDown` señalaría al vacío |
| `nada-visible` | CTA en la burbuja | sí |
| `margen-negativo` | CTA en la burbuja | sí |

**Conclusión:** un único placement alcanza para las intervenciones que se
explican solas (casos 2 y 3), pero **no** para las que señalan un elemento
concreto. Si se quiere `pointDown` de verdad, hacen falta **dos placements
semánticos, no coordenadas libres**:

- `junto-a-la-presencia` — el actual, anclado donde vive Dico 2D. Default.
- `junto-al-objetivo` — anclado a un elemento nombrado, para poses
  direccionales. Se usa **sólo** cuando la pose es `pointDown`/`pointUp`.

Y una prohibición: nunca sobre un modal ni sobre un formulario abierto. Los dos
casos donde eso pasaría —cobro con caja cerrada, error de guardado— ya están
descartados en §2 por esa razón.

---

## 6. Primer lote recomendado

**Dos, no cuatro.** Los tres de §3 son defendibles, pero el tercero
(`margen-negativo`) depende de datos de receta que muchos negocios no cargan, y
conviene ver los dos primeros funcionando antes de sumar.

1. **Catálogo vacío → `pointDown` + burbuja**, reemplazando la escena 2D actual
   de `ProductsPanel`. Reemplaza, no agrega. Requiere el placement
   `junto-al-objetivo`.
2. **`nada-visible` → `worried` + burbuja**, disparado **al detectarse tras una
   acción del usuario** (apagar el último producto visible), no al entrar.

Los dos son tipo **B**: esperan acción y se guardan al usarla.

---

## 7. Archivos que tocaría esa integración

| archivo | qué cambiaría |
|---|---|
| `src/components/dico/dicoPresenceMachine.js` | `OPEN_PHYSICAL` acepta carga útil |
| `src/components/dico/DicoPresence.jsx` | guarda `pose`/`mensaje`; los pasa al Slot y a la burbuja |
| `src/components/dico/DicoSlot.jsx` | ya acepta `pose`; sumaría la burbuja |
| `src/pages/PlatformAdmin.jsx` | el productor: decide y llama |
| `src/components/admin/platform/ProductsPanel.jsx` | el empty state deja de montar su propia escena |
| `src/styles/admin-sidebar.css` + `dico-slot.css` | el segundo placement |
| tests | `dicoPresence`, `dicoSlot`, uno nuevo para el productor |

No tocaría: `DicoPhysical`, los assets, el validator, los thresholds, la
geometría ni `DicoNative`.

---

## 8. Bloqueos arquitectónicos reales

1. **No hay señal de "resultado importante".** Sin realtime de pedidos ni
   marca de primer cobro en el admin del tenant, `success` y `error` **no
   tienen a qué engancharse** que no sea un toast de rutina. Es el bloqueo más
   grande: dos de las ocho poses no tienen caso de uso hoy.
2. **El productor natural es `PlatformAdmin`, que ya es un archivo enorme.**
   Meterle la decisión de intervenciones lo empeora. Convendría un módulo
   `src/modules/dico/intervenciones.js` con la misma forma que `reglas.js`:
   función pura, estado adentro → intervención afuera, testeable sin React.
3. **Cruzar 769 px cierra Physical** (deuda ya reportada). Si una intervención
   está esperando una acción y el usuario rota la tablet, la intervención se
   pierde sin que nadie la haya atendido.
4. **`pointDown`/`pointUp` no son usables sin el segundo placement.** Con el
   anclaje actual señalarían al vacío.
5. **El empty state de productos monta hoy su propia escena de Dico**
   (`DicoCoreEscena`, 188 px, cara SVG). Si Physical lo cubre, hay que sacarla
   — si no, habría dos Dicos en pantalla. Es la única superficie donde eso
   pasa.
