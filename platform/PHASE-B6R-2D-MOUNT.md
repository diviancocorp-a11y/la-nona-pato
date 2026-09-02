# Stage B6R.2 — Dico 2D final, montado

Los siete assets finales reemplazan al Native SVG en el panel. Nada se
recrea en vector, nada se recolorea: **el arte manda y el overlay se adapta**.

---

## 0. Base

| | |
|---|---|
| Rama | `feat/dico-panorama-v1` |
| Assets | `platform/brand/dico-2d-masters/` (masters intactos) → `public/brand/dico/` (derivados normalizados, 256px) |
| Vocabulario | tres ejes independientes en `src/components/dico/vocabulario.js` |

Sin push, sin deploy, sin DB/RLS/auth. React Router sigue en `7.18.3`.

---

## 1. Tamaño visual: 40px

**Decidido midiendo, no eligiendo.** Las cejas son la única diferencia entre
los siete estados —no hay boca—, así que la pregunta es a partir de qué
tamaño el trazo de la ceja sobrevive a la trama de píxeles.

Dos métricas no alcanzaron para decidir y conviene decir por qué:

| Métrica | Resultado | Por qué no decide |
|---|---|---|
| Píxeles que cambian vs `neutral` | 1,1 % – 2,0 % del arte, plano en 32/36/40/44 | Las cejas escalan con el arte: la proporción no mejora con el tamaño |
| Filas de píxel que ocupa la ceja | 6 (32px) → 16 (48px), con 44px **por debajo** de 40px | Contaminada por el resampling: 256/44 no es una razón limpia |

Lo que sí decide es mirar el render real ampliado con nearest-neighbour
(`capturas/zoom-tamanios.png`, `capturas/zoom-par-dificil.png`):

- **32px** — `alert` no tiene cejas visibles: se lee igual que `neutral`. Un
  estado de alerta que parece neutro es un error semántico, no una cuestión
  de gusto.
- **36px** — las cejas aparecen pero finas; `question` (el asimétrico) sigue
  siendo un borrón.
- **40px** — los tres difíciles se leen: `alert` baja hacia el centro,
  `concerned` sube, `question` muestra la asimetría. **Elegido.**
- **44px** — mejor, y no hace falta: la barra se vuelve menos sobria.

El **área clickeable sigue siendo 44×44** y no depende del tamaño visual: la
pone el CSS del botón con `min-width/height` y centrado, no el `size`. Hay un
contrato que lo fija (`el tamanio visual no arrastra al area clickeable`).

## 2. Los tres ejes, decididos por separado

`DicoAvisos` es la capa que decide, y decide dos cosas distintas:

| Eje | De dónde sale | Valores |
|---|---|---|
| `nativeState` | el **nivel** del aviso más grave | `alerta`→`alert` · `aviso`→`concerned` · `sugerencia`→`curious` |
| `activity` | lo que hace **el sistema** | `listo === false`→`processing` · aviso abierto→`active` · hay avisos→`attention` · si no→`idle` |

Los tres niveles son una escala de gravedad y el vocabulario tiene tres caras
que forman la misma escala: se corresponden una a una, sin traducción.

**Lo que esto arregla.** Antes las dos salían de la misma tabla, y por eso
`esperando` —el panel cargando— terminaba siendo una expresión facial. Ahora
mientras carga la cara queda `neutral` y el trabajo lo cuenta el pulso, que es
el eje que le corresponde.

## 3. El pulso cae sobre el aro del arte

Medido sobre la captura real del gate, ampliada ×12
(`capturas/app-dico-zoom.png`): el segmento Volt pisa exactamente el aro navy
del PNG, y el resto del aro queda como lo pintó el arte. No es un spinner
alrededor del personaje.

El token `--dico-blue-base` describe el arte (`#192B6C`, 93 % de sus píxeles
azules), no al revés. `--dico-blue-render` (`#2A3369`) y `--dico-blue-flat`
(`#0957E6`) quedan documentados y **no** son la base.

Hay una separación que esto obligó a hacer: `.dico-pulso-aro` dibuja el aro
base y sólo se enciende donde **no** hay arte debajo; `.dico-pulso-brillo` es
la señal de `idle`/`active` y va **encima** del aro que ya existe. Sin esa
separación, `idle` habría repintado el aro del PNG con otro color.

## 4. Un solo target, dos gestos — DECISIÓN ABIERTA

Sobre Dico 2D conviven dos acciones y hoy se resuelven por estado:

| Estado | Click |
|---|---|
| sin avisos | invoca a Physical (antes no hacía nada: afordancia muerta) |
| con avisos, cerrado | abre el aviso |
| con avisos, abierto | lo cierra |

**Consecuencia que hay que mirar:** en el panel sembrado del QA *siempre* hay
avisos, así que ahí el click sobre Dico abre el aviso y Physical se invoca
desde la ranura (`.dico-slot-control`). Si Physical tiene que ser invocable
**siempre** desde el personaje, hace falta un segundo target para el aviso
—el badge— y eso es diseño, no implementación: un badge de 16px no llega a
44 de área sin pisar el área de Dico.

### Limitacion conocida de `attention`

`attention` es finito a proposito (dos vueltas y para: es un aviso, no un
loop). El efecto lateral es que **un aviso nuevo que llega mientras ya habia
avisos no vuelve a pulsar**: la clase no cambia, asi que la animacion no se
reinicia. Hoy el cambio lo comunica el contador del badge. Si se quiere que
cada aviso nuevo llame de nuevo, hay que forzar el reinicio con una `key` que
incluya la firma de los avisos — no se hizo porque agrega parpadeo cada vez
que la lista se recalcula.

## 5. Lo que no existe: la sidebar

**No hay sidebar en el repo.** El admin navega con `NavInferior` (bottom nav)
diseñada en la fase 3A, más el menú hamburguesa. Dico 2D vive hoy en el slot
del encabezado, centrado (medido: x=700 en 1440, o sea 720 = el medio exacto).

Los ítems de evidencia *collapsed/expanded* no se pueden capturar porque no
hay nada que colapsar. Construir una sidebar es una decisión de producto que
cambia la navegación entera del panel, no un paso de este lote.

## 6. Contratos agregados

| Contrato | Qué fija | Mutación que lo prueba |
|---|---|---|
| `los siete estados intercambian el asset y NADA mas` | cambiar de cara no mueve un píxel | radio del pulso distinto en `happy` → falla |
| (el mismo) | los siete apuntan a archivos distintos | `celebrate` cargando el PNG de `happy` → falla |
| `el click en Dico 2D lo trae al plano y despues lo devuelve` | la secuencia entera, y que Dico 2D **no** conviva con Physical | — |
| `cara y actividad son ejes independientes` | cargando = cara neutral + pulso `processing` | — |
| `sobre el arte final NUNCA repinta el aro` | `idle`/`active` no encienden el aro base | — |

## 7. QA Lite

El contrato de movimiento de Dico **cambió de naturaleza**. Describía cinco
animaciones infinitas del SVG (piso, boya, bamboleo, parpadeo, sacada); medido
sobre el admin real encontraba **0 de las cinco**.

Con el asset final no queda movimiento infinito propio del personaje: la
entrada corre una vez y el pulso en `attention` dos vueltas. Lo único continuo
es el brillo Volt de `active`, porque `settleAdmin` deja el aviso abierto: ese
se registra y se congela en 0.

Tres arreglos que el cambio dejó a la vista:

1. El observer decía «el predicado expiró» sin decir qué faltó. Ahora informa
   selector por selector cuántos esperaba y cuántos encontró, **y además qué
   animaciones sí están corriendo**.
2. Convergía con que los nodos existieran, y el pulso existe desde el primer
   frame: fotografiaba el estado de carga (`processing`, infinito) en vez del
   asentado. Ahora exige que la animación coincida.
3. `remainingAnimations` exigía cero animaciones sobre Dico; con el pulso
   registrado queda una congelada. Pasa a exigir que ninguna siga en
   `running`, que es lo que se quería decir.

El registro del pulso declara `whenActivity: 'active'` y el chequeo exige las
**dos** mitades: con esa actividad tiene que latir con nombre y duración
exactos, con cualquier otra tiene que estar quieto. Aceptar «cero animaciones»
a secas habría dejado pasar un pulso que dejó de funcionar.

---

## 8. Propuesta mobile — para decidir, no aplicada

Medido antes de proponer, sobre las capturas del gate:

| Viewport | Dico (caja 44) | Centrado | Burbuja |
|---|---|---|---|
| 320x800 | x 138 | 160 = 320/2 ✔ | 18..302 |
| 375x812 | x 165,5 | 187,5 = 375/2 ✔ | 18..357 |
| 768x900 | x 362 | 384 = 768/2 ✔ | 214..554 |
| 1440x1000 | x 698 | 720 = 1440/2 ✔ | 550..890 |

**La geometria ya funciona en mobile y no hay que rehacerla.** Dico queda
centrado en los cuatro anchos y la burbuja se estira al ancho util. El recorte
del aviso a 390px que aparecio en el lote anterior esta resuelto por
`.ag-slot:has(.dico-avisos--abierto) { max-height: 70vh }`.

Tampoco hay que achicar Dico: el arte es el mismo y el area ya es 44, que es
justo el minimo tactil. Bajar a 36 para "que entre" perderia `alert` (§1) sin
ganar espacio real.

**Lo que falta no es tamaño, es el gesto.** Hoy el unico feedback de que la
ranura es invocable es `:hover` (`.dico-slot-control:hover .dico-slot-luz`),
que en touch no ocurre nunca. Y no hay un solo `@media (hover: hover)` en
`src/`, asi que en touch ese hover queda pegado despues del tap.

Tres propuestas, en orden de lo que rinde:

1. **Guardar los hover detras de `@media (hover: hover)` y darle a touch su
   propio estado `:active`.** No es copiar el hover: es que el dedo tenga una
   respuesta inmediata donde el mouse tenia una anticipada. Barato y arregla
   el hover pegado.
2. **Que el tap sobre la ranura encienda el pulso en `active` antes de que
   Physical termine de salir.** La firma visual ya existe y comunica
   "te escuche" durante los ~700 ms de la animacion, que en mobile se sienten.
3. **Si se adopta "Dico 2D invoca a Physical siempre" (§4), en mobile el
   aviso tiene lugar para su propio target y en desktop no.** La burbuja ya
   ocupa el ancho util: el disparador puede ser una fila tocable de ancho
   completo en vez de un badge de 16px. O sea que la decision de §4 puede
   resolverse distinto por viewport sin que sea una inconsistencia.

**Lo que NO propongo:** long-press, swipe ni gestos nuevos. No hay ninguno hoy
en el panel y agregarlos sobre el unico elemento de marca es donde peor se
descubren.
