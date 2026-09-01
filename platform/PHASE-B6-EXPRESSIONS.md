# Stage B6 — Canonical expressions + face proportions

**Siete** estados emocionales y **un eje de habla** de tres frames, sobre una
sola anatomía. No son diez emociones: la cara cambia por cejas, pupilas,
párpados y boca.

---

## 0. Base

| | |
|---|---|
| Rama | `feat/dico-panorama-v1` |
| HEAD al empezar | `8965aa2` |
| Snapshot | `DICO_B5_APPROVED_8965aa2.bundle` — 8.808.354 bytes, SHA-256 `81e3ecb73a7b03049af9281f8643191ca2d6d15e347a74f2832648c3135b8a00`, historia completa, excluido por ruta exacta |
| Commits | `f25da40` proporciones · `d6b3b72` expresiones · `24d2e4e` contrato ajustado · `a8fe2a4` vocabulario canónico y `thinking` |

Sin push, sin deploy, sin DB/RLS/auth. React Router sigue en `7.18.3`.

## 1. Inventario inicial

Auditado antes de editar. `CaraDeTinta` recibía sólo `lookX`/`lookY`; el estado
lo aplicaba el ancestro por clase CSS.

| Estado | ¿Existe? | Quién lo usa | Qué cambia hoy | Qué falta |
|---|---|---|---|---|
| **idle** | sí | `DicoCara` default, `DicoSlot` (clavado), `DicoAvisos` sin avisos, vitrina, tests | boca neutra | nada: es la referencia |
| **esperando** (processing) | sí | `DicoAvisos` nivel *sugerencia* y `listo === false` | boca pensando + 3 puntos animados + cejas −1,8 px + pupilas (,8/−,7) + brazos | los puntos se pierden sobre la galera de Physical |
| **pensando** (thinking) | **no** | — | — | **todo**: colapsaba en `esperando` |
| **contento** (success) | sí | sólo vitrina | boca contenta + cejas −1,2 + pupilas −0,4 + brazos 48° | los párpados existían y ningún estado los usaba |
| **preocupado** (worried) | sí | `DicoAvisos` nivel *alerta* | boca tensa + cejas convergentes 3° + brazos | — |
| **pregunta** (question) | sí | `DicoAvisos` nivel *aviso*, `ProductsPanel` | boca pregunta + signo «?» + cejas asimétricas + pupila + brazo al mentón | — |
| **error** | **no** | — | — | **todo** |
| **speaking** | sí (`speakingFrame`) | nadie en producción | oculta todas las bocas y muestra el frame | Physical no lo recibía |

**Dos huecos que la auditoría destapó y el lote usa:**

- **Los párpados (`.dico-parpado`) eran geometría muerta**: existían en el SVG
  con `opacity: 0` y *ninguna* regla los encendía.
- **Physical estaba clavado en `idle`**: literalmente
  `<g className="dico--idle">` en el JSX. No podía expresar nada.

## 1bis. Vocabulario canónico final

**Siete estados emocionales y un eje de habla de tres frames.** No son diez: la
plancha muestra diez columnas porque incluye los frames, y eso es exactamente lo
que este cuadro existe para desambiguar.

| Valor runtime | Estado canónico | ¿Alias? | Native | Physical |
|---|---|---|---|---|
| `idle` | idle | — | sí | sí |
| `processing` | processing | — | sí | sí |
| `thinking` | thinking | — | sí | sí |
| `success` | success | — | sí | sí |
| `worried` | worried | — | sí | sí |
| `question` | question | — | sí | sí |
| `error` | error | — | sí | sí |
| `esperando` | **processing** | alias legacy | sí | sí |
| `pensando` | **thinking** | alias legacy | sí | sí |
| `contento` | **success** | alias legacy | sí | sí |
| `preocupado` | **worried** | alias legacy | sí | sí |
| `pregunta` | **question** | alias legacy | sí | sí |
| cualquier otro | idle | fallback | sí | sí |

**Eje de habla**, aparte del estado: `closed` · `mid` · `open`. Se combina con
cualquier estado — `error` + `open` es válido. No hay una segunda máquina.

Los alias se conservan porque los usan `DicoAvisos`, `ProductsPanel`, la vitrina
y varios tests; sacarlos sería churn sin beneficio. Pero **lo que llega al DOM es
siempre el nombre canónico**: `estadoCanonico()` resuelve, y hay un contrato que
verifica que la clase del alias no sobreviva. Si sobreviviera, el vocabulario
quedaría partido en dos familias de clases.

## 2. Cambios reales

**Nada se reimplementó.** Los cinco estados que ya funcionaban quedaron como
estaban.

| | |
|---|---|
| `CaraDeTinta.jsx` | + `dico-ojo-x` (2 paths por ojo), + `boca--reflexiva`, + `boca--error`; halo de los puntos 1 px → 2,2 px |
| `dico.css` | + bloque `thinking`, + bloque `error`, párpados en `success`, clases de estado al canónico, reduced motion cubre `.dico-physical-cara *` |
| `DicoCara.jsx` | `ESTADOS_DICO` 5 → 7 en inglés + `ALIAS_ESTADO` + `estadoCanonico()` |
| `DicoSlot.jsx` | props `cara` y `habla`, resueltas por `estadoCanonico()`; deja de estar clavado en `idle` |
| `dico-slot.css` | encuadre canónico parametrizado |

### Por qué el canónico pasó a ser el inglés

En la primera pasada se dejaron los nombres en español como canónicos, con el
mapeo escrito en un comentario. La revisión pidió lo contrario: vocabulario
canónico explícito y aliases resueltos de verdad. Ahora `ESTADOS_DICO` declara
los siete en inglés, `ALIAS_ESTADO` mapea los cinco nombres en español y
`estadoCanonico()` resuelve ambos. Nada que ya funcionaba dejó de funcionar y no
quedó una segunda familia de clases CSS.

### `error`: la forma carga el significado, el rojo acompaña

Una **X sobre cada esclera** más una boca corta hacia abajo. Se lee igual en
escala de grises o para quien no distingue el rojo — que es la condición de §13
del brief. El rojo entra sólo en el trazo de la X (`var(--ms-bad)`, de la paleta
existente, con fallback fuera de `.ag-root`): **la cara no se tiñe**. Se apaga el
parpadeo, porque mover una X no comunica.

### `thinking` era `idle` con dos píxeles de diferencia

La primera versión movía las cejas 2,6 px y las rotaba 4°. Puesto al lado de
`idle` en la plancha **no se distinguía**, y a 36 px —el tamaño real en el
panel— directamente no existe.

Lo que se lee de lejos es la **dirección de la mirada**, así que ahí fue la
corrección:

| | pupilas | cejas | símbolo |
|---|---|---|---|
| `processing` | `(+2,1 / 0)` — barre al costado, **nivelado** | ambas apenas arriba | puntos de proceso |
| `thinking` | `(−2,4 / −3,1)` — **arriba** y al costado | `−4,4` / `+1,6`, una sube y la otra baja | ninguno |

El límite lo pone la esclera: la pupila tiene ~3,3 px de juego horizontal y
~4,4 px vertical antes de salirse del ojo.

Un contrato lee las dos transformaciones del CSS y exige que `thinking` mire
hacia arriba, que `processing` no, y que no vayan para el mismo lado.

## 3. Proporciones — antes y después

Normalizado al ancho visible de la moneda de cada cuerpo, medido por pixel.

| Medida (% ancho de moneda) | Native | Physical **antes** | Physical **después** | Δ final |
|---|---|---|---|---|
| Separación entre ojos | 23,24 % | 10,21 % | **20,43 %** | −12,1 % |
| Alto del ojo | 28,01 % | 12,26 % | **24,51 %** | −12,5 % |
| Ancho de boca | 13,44 % | 5,90 % | **11,79 %** | −12,3 % |
| Ancho de cara | 43,33 % | 19,03 % | **38,07 %** | −12,1 % |
| Alto de cara | 42,41 % | 18,56 % | **37,12 %** | −12,5 % |
| Centro dx | −0,08 % | +0,04 % | **−0,00 %** | centrado |
| Centro dy | −2,76 % | −6,61 % | **−2,13 %** | 0,6 pp |
| **Ojos / boca** | **1,730** | **1,732** | **1,732** | idéntico |

**La última fila decidió dónde va el arreglo.** La jerarquía interna ya era
correcta antes de tocar nada: el problema nunca fue la geometría sino el marco.
Por eso la corrección vive en `.dico-physical-cara` —parametrizada en tres
custom properties— y **no se duplicó anatomía**. No existe
`CaraDeTintaPhysical`.

**El factor es 2,0 y no el 2,28 que igualaría el ancho exacto.** Igualarlo
dejaba la cara ocupando el 58 % del alto de una moneda escorzada contra el 45 %
de Native: se corregía una desproporción creando otra. Con 2,0 las cinco medidas
caen dentro del 12,5 %. El criterio es *«el mismo personaje en dos materiales»*,
no dos renders idénticos.

## 4. Contratos

`src/test/dicoExpresiones.test.jsx` — **20 tests**. No se congela el SVG como
snapshot gigante: se afirma lo que cada estado tiene que lograr.

| Mutación | Resultado |
|---|---|
| Se cae `error` del vocabulario | 5 fallan |
| `pensando` usa la boca de `esperando` | 1 falla |
| El rojo se aplica a la cara entera | 1 falla |
| Physical vuelve a quedar clavado en `idle` | 3 fallan |
| Reduced motion deja de cubrir la cara de Physical | 1 falla |
| `error` pasa a depender de una animación | 1 falla |
| Se introduce un amarillo de warning | 1 falla |
| El encuadre se «arregla» con un valor fijo | 1 falla |
| Se borra la parametrización del marco | 1 falla |
| Control: sin mutaciones | 20/20 verde |

### Un contrato que la mutación encontró flojo

El que cuida el encuadre buscaba `--dico-cara-ancho` en el archivo entero y no
probaba nada: al reemplazar la declaración por un `width: 98%` fijo, el nombre
seguía apareciendo en el `var()` de más abajo y el test pasaba. Ahora mira el
bloque de `.dico-physical-cara` y exige que `left`, `top`, `width` y `height` se
deriven de las tres variables. Se verificó rompiéndolo de dos formas.

### Reduced motion

El neutralizador histórico cubría `.dico *`, y **la cara de Physical no cuelga
de `.dico`**: el parpadeo seguía corriendo con la preferencia activa. Se notaba
poco mientras Physical sólo sabía estar en `idle`; con estados y puntos de
proceso habría sido movimiento con significado ignorando al usuario. Se extendió
a `.dico-physical-cara *`.

Ningún estado nuevo depende de una animación para significar, y **no se agrega
ninguna animación infinita**: el contrato de movimiento de QA Lite queda igual.


### Physical en el flujo real

Medido con `DicoPresence` como autoridad y el Slot abierto con el mismo click
que haría una persona, ya con el marco corregido:

| Contrato | Resultado |
|---|---|
| La cara viaja pegada al cuerpo (rango del offset relativo, abriendo) | **0,0000** |
| Ídem, cerrando | **0,0002** |
| Cambio de escala durante la animación | **0,0000** |
| Native ausente con Physical afuera | **sí** — B1 intacto |
| Native vuelve al cerrar | **sí** |

## 5. Lo que NO se hizo

1. **Los productores.** La app hoy sólo alcanza `idle`, `esperando`,
   `preocupado` y `pregunta`: `DicoAvisos` mapea los tres niveles de aviso
   (`alerta`→preocupado, `aviso`→pregunta, `sugerencia`→esperando) y nada más.
   **`pensando`, `contento` y `error` existen en el sistema pero ningún código
   los emite todavía.** Cablearlos es lógica de negocio, no vocabulario facial.
2. **Los ~9 px de galera recortados** por `overflow: hidden` de `.ag-slot`
   contra el desborde de `.dico-slot-stage`. Sigue en **Phase 9 / slot-physical
   geometry backlog**, sin tocar, como pide el brief.
3. **Brazos para los estados nuevos.** `pensando` y `error` los dejan en reposo:
   B6 es la cara.
4. **Renombrar los estados al inglés.** Ver §2.

## 6. Evidencia

`.qa-lite/artifacts/phase-b6-expresiones/` — plancha (`plancha.html`), capturas
de las dos filas en claro y oscuro, contexto real al tamaño de la app
(`size={36}`), detalles de los cuatro estados a juzgar, y las mediciones en
`marco-antes.json` / `marco-despues.json` / `marco-final.json`.

## 7. Estado

**B6 = CLOSED.** No se avanza a Panorama de roles/verticales.
