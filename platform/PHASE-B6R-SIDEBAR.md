# Stage B6R.3 — Desktop Sidebar + Dico 2D + Volt

Riel de navegación desktop con Dico arriba. `NavInferior` no se toca: se
oculta donde la sidebar la sustituye.

---

## 1. Breakpoint: 769px, y no es nuevo

El shell **no tenía** ninguna frontera desktop propia. Inventario completo de
breakpoints antes de tocar nada:

| Frontera | Dónde vive | Para qué |
|---|---|---|
| 460 / 480 / 520 / 620 | `src/styles/*`, componentes | ajustes de tipografía y grillas |
| **768 / 769** | `dev-phone-preview.css` | **teléfono vs no-teléfono** |
| 980 | `signup.css` | landing |

`min-width: 769px` es la única división que ya expresaba "esto es un teléfono".
Inventar 1024 habría dejado la tablet apaisada sin sidebar y con una tercera
frontera para mantener.

Medido en los seis anchos del brief, sobre el panel real:

| Ancho | Chasis | Overflow | Iconos movidos al expandir | Targets |
|---|---|---|---|---|
| 1440 | sidebar | no | 0 de 8 | 44×44 |
| 1280 | sidebar | no | 0 de 8 | 44×44 |
| 1024 | sidebar | no | 0 de 8 | 44×44 |
| 900 | sidebar | no | 0 de 8 | 44×44 |
| 768 | nav inferior | no | — | 44×44 (5 items) |
| 390 | nav inferior | no | — | 44×44 (5 items) |

Hay **una y sólo una** navegación viva en cada ancho — que convivan sería
ruido, que no haya ninguna dejaría al usuario sin forma de moverse.

Un dato lateral que conviene saber: la sidebar muestra **las 8 secciones** sin
menú de desborde. La nav inferior sigue con 4 + "Más" porque a 390px no
entran; en desktop esa restricción no existe.

## 2. Collapsed / expanded

| | Colapsada | Expandida |
|---|---|---|
| Ancho | 64px | 224px |
| Se activa por | — | hover **y** `focus-within` |
| Dico | sí | sí, en el mismo lugar |
| Wordmark | no | **a la derecha** de Dico |
| Rótulos | no | sí |
| Estado activo | sí (riel de oro) | sí |

**Tres propiedades estructurales, medidas, no supuestas:**

1. **Los iconos no se mueven** (dx 0, dy 0 en los 8, a los cuatro anchos).
   Cada item es una grilla cuya primera columna mide exactamente el riel; el
   icono vive ahí y el rótulo en la segunda. Si el rótulo estuviera en el
   mismo bloque, aparecer lo empujaría.
2. **El workspace no salta** (dx 0, dw 0). La sidebar crece *por encima* del
   contenido y el `padding-left` del root es siempre el riel, nunca el ancho
   abierto. Empujar significaría re-maquetar la pantalla de trabajo cada vez
   que el mouse roza el borde izquierdo.
3. **Los targets miden 44×44 colapsada**, que es el estado normal.

Salir hacia el workspace la vuelve a colapsar (verificado moviendo el mouse a
la esquina opuesta y midiendo el ancho).

## 3. El wordmark no reemplaza a Dico

`[ Dico 2D ]` → `[ Dico 2D + DICO ]`. El wordmark aparece **a su derecha** y es
`aria-hidden`: el nombre accesible del control lo pone Dico. Reemplazar la
moneda por el wordmark haría que el mismo pixel sea dos controles distintos
según el estado.

## 4. Dos gestos, dos targets

Esta es la decisión que el brief cerró y que yo había dejado abierta.

| Control | Qué hace |
|---|---|
| **Dico 2D** | invoca a Physical, **siempre** |
| **Contador** | abre / cierra el aviso |

Antes el mismo pixel hacía una cosa u otra según cuántos avisos hubiera: el
usuario tenía que saber el estado del sistema antes de tocar. El contador deja
de ser una calcomanía sobre el arte —el solape medido era de **15,3px**, le
comía el aro al personaje— y pasa a ser un botón de 44×44 con su propio nombre
accesible. En el riel va debajo de Dico, porque 40 + 44 = 84 contra 64 de
ancho.

Su lugar está **reservado siempre**, haya avisos o no: si apareciera y
desapareciera con los datos, los iconos de navegación subirían y bajarían
solos mientras el usuario mira otra cosa.

## 5. B1 intacto

`click en Dico → cierra el aviso → physical_opening → el 2D desaparece →
Physical → physical_closing → recién al final vuelve el 2D`. Nunca hay
coexistencia, y hay un contrato que lo verifica paso por paso, incluido que el
globo no sobreviva a la entrada de Physical.

## 6. Aviso anclado a la sidebar

Se abre **hacia el workspace**: a la derecha del riel y debajo de la topbar.

El globo aprendió a sacar la cola por el **costado**. Con Dico en la sidebar,
una cola que baje apunta al vacío en vez de a quien habla. Qué cola usar no se
deduce del ancho de pantalla: lo declara el shell, que es quien decide dónde
monta a Dico.

Se conserva el typewriter, la fuente accesible única y la reserva de geometría
(no hay reflow mientras escribe).

**Tres choques resueltos, todos medidos:**

- Con la sidebar expandida, el globo (desde x=109) y Physical (x 44..228)
  tapaban los rótulos. **Se corre Dico, no se recorta la navegación** — ver
  §9.
- El globo estaba en y=26, encima de una topbar de 57px: tapaba el nombre del
  negocio. Bajó a 64.
- La ranura vacía del Slot flotaba sobre los iconos de navegación. En desktop
  el invocador es Dico 2D, así que la ranura sólo hace falta cuando el
  personaje está afuera —ahí es el control para guardarlo—.

Y uno que salió de medir en vez de mirar: **Physical salía en y=-79**, fuera de
la pantalla. Su escenario mide 184px y crece *hacia arriba* desde el piso del
Slot.

## 7. Los azules son una familia

`Blue Base` no es un RGB único: es un material que cada soporte rinde distinto.

| Token | Valor | Qué es |
|---|---|---|
| `--dico-blue-2d-base` | `#192B6C` | medido sobre el asset 2D final (93% de sus píxeles azules) |
| `--dico-blue-3d-base` | `#2A3369` | el mismo aro, sombreado por el render |
| `--dico-blue-flat` | `#0957E6` | la versión vectorial del isologo |
| `--dico-blue-volt` | `#3D6BFF` | **la señal** |

El único que tiene que ser sistemático es Volt, y hay un contrato que lo
exige: verifica el contraste contra **cada** base de soporte, no contra uno
elegido. Si algún día un base se aclara, falla antes de que el pulso
desaparezca sobre ese soporte.

`--dico-blue-flat` da 1,35:1 contra el Volt: por eso está documentado como lo
que **no** sirve de base. El aro base del pulso es parametrizable
(`--dico-pulso-base`) con el 2D como default, para que un montaje sobre 3D no
herede el azul equivocado.

**Ningún PNG se recoloreó.** El overlay se adapta al arte.

---

## 8. Mobile — propuesta, no aplicada

**Lo que YA quedó y funciona**, medido en el panel real a 375 y 320:

- `NavInferior` intacta: 5 items (4 + "Más"), todos 44×44, sin overflow.
- Dico sigue en el slot del main, y el par *moneda + contador* queda centrado
  (a 375: la moneda en 165,5 y el contador a su derecha, centro del par
  187,5 = 375/2).
- El globo se abre **encima** de Dico con la cola centrada, como siempre: la
  cola lateral es sólo para desktop.
- El aviso ya no se recorta a 390px — eso lo resolvió
  `.ag-slot:has(.dico-avisos--abierto) { max-height: 70vh }` en el lote
  anterior.

O sea: **no hace falta ningún cambio importante en mobile**, y por eso no
hice ninguno.

**Lo que propongo, para decidir:**

1. ~~Dico como único invocador, también en mobile.~~ **Hecho.** La ranura del
   Slot se ve solamente cuando Physical está afuera —ahí es el control para
   guardarlo—, en desktop y en mobile. El modelo queda igual en los dos:
   *tap en Dico → Physical*, *tap en el contador → aviso*.
2. **Guardar los hover detrás de `@media (hover: hover)`.** No hay ni uno en
   `src/`, así que en touch el hover de la ranura
   (`.dico-slot-control:hover .dico-slot-luz`) queda pegado después del tap.
   No es copiar el hover: es que el dedo tenga una respuesta inmediata
   (`:active`) donde el mouse tenía una anticipada.
3. ~~El tap enciende el pulso en `active`.~~ **Descartado.** `activity`
   describe el estado de Dico, no el estado del dedo: usar la señal del
   sistema como feedback de presión la vacía de significado. Si hace falta
   respuesta táctil inmediata, va por `:active` en CSS y se acabó.

**Lo que NO propongo:** long-press, swipe ni gestos nuevos. No hay ninguno hoy
en el panel y agregarlos sobre el único elemento de marca es donde peor se
descubren.

---

## 9. REVIEW A — Dico se corre, la navegación no se recorta

La primera versión resolvió la colisión al revés: cuando Physical estaba
afuera o el aviso abierto, la sidebar **dejaba de expandirse** y apagaba los
rótulos. La interfaz perdía capacidad por culpa de una presencia de IA, que es
exactamente lo contrario de la regla.

**Ahora la sidebar se expande siempre** —hover, teclado, con Dico activo o
no— y lo que se mueve es Dico.

### Una sola geometría

`--ag-sidebar-ancho` es *el* ancho actual, y de él derivan las tres cosas que
dependen de él:

| Qué | De dónde sale |
|---|---|
| ancho de la sidebar | `width: var(--ag-sidebar-ancho)` |
| dónde arranca el aviso | `left: var(--ag-sidebar-ancho)` |
| dónde se para Physical | `left: calc(var(--ag-sidebar-ancho) + 8px)` |

y el propio ancho sale de las dos medidas declaradas
(`--ag-sidebar-riel: 64px`, `--ag-sidebar-abierta: 224px`). Antes el aviso y
Physical repetían el riel por su cuenta, así que al expandirse la sidebar les
pasaba por encima. Se mueven **sólo en X** y con la misma duración: sin salto
vertical y sin reflow del workspace, que sigue corriéndose el riel y nada más.

Medido en el panel real, los cuatro anchos de sidebar:

| | 1440 | 1280 | 1024 | 900 |
|---|---|---|---|---|
| expande con el aviso abierto | 224 | 224 | 224 | 224 |
| expande con Physical afuera | 224 | 224 | 224 | 224 |
| rótulos visibles con Dico activo | sí | sí | sí | sí |
| Tab llega a la sidebar con Physical afuera | sí | sí | sí | sí |

### Foco de teclado, no de click

Se usa `:has(:focus-visible)` y no `:focus-within`. Con `focus-within`, hacer
click con el mouse en un item deja el foco adentro y la sidebar se quedaba
abierta indefinidamente, aunque el mouse ya estuviera en el workspace —
rompía la regla de que salir al workspace la colapsa. `:focus-visible` es
justo la distinción que hace falta: el navegador sólo lo marca cuando el foco
vino del teclado.

Lo encontró el QA nuevo, midiendo el globo "con la sidebar colapsada" y
obteniendo 224.

### Hover

Las reglas de hover **de esta sidebar** van dentro de
`@media (hover: hover) and (pointer: fine)`; en touch el `:hover` queda pegado
después del tap y la sidebar se quedaría abierta sola. El foco de teclado
queda **afuera** de esa media query a propósito: adentro, quien navega con
teclado en una tablet no vería un solo rótulo.

No se abrió la migración global de los `:hover` del repo.

### Dos contratos que fijan el principio

1. Ninguna regla condicionada al estado de Dico (`:has(.dico…)`) puede tocar
   el `width` de la sidebar ni la `opacity` de sus rótulos.
2. La posición del aviso y de Physical tiene que derivar de
   `--ag-sidebar-ancho`, y no puede transicionar el eje vertical.
