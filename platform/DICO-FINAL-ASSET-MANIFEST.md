# DICO — Manifiesto de assets finales

**B6R.1 · auditoría.** Fecha de corte: 2026-09-01. Rama `feat/dico-panorama-v1`,
HEAD `40de375`.

Este documento registra **lo que hay**, medido archivo por archivo. No propone
recrear nada: la dirección del brief es usar los assets finales como producto.

---

## 0. Titular

**El personaje nuevo está definido pero no existe todavía como asset de
producción.** Hay cuatro conjuntos y ninguno reúne las dos condiciones a la vez
—identidad vigente **y** transparencia real:

| Conjunto | Personaje | ¿Alfa? | Veredicto |
|---|---|---|---|
| `Downloads/Dico 3D/` (10) | **NUEVO** — aro azul, pestañas, sin galera | **NO**, negro opaco | identidad correcta, **no integrable tal cual** |
| `…/02_Dico_3D` (11) | **VIEJO** — galera + bigote | sí | integrable, **identidad superseded** |
| `…/01_Dico_2D` (4) | intermedio — cuerpo entero, con boca, sin aro azul | NO | lámina de presentación |
| `…/03_Isologo` (4) | **NUEVO 2D** — aro azul, dos ojos, **sin boca** | NO | lámina, pero es **la** referencia |

## 1. Dico 2D — la referencia existe, el asset no

`Isologo_Dico_master_liso.png` es exactamente el Dico 2D que describe el brief:
moneda dorada, **aro azul**, **dos ojos negros, sin boca**, rotulado
*«DICO AI / ASSISTANT MARK — In-app presence · small motion · intelligent
warmth»*. Incluye una variante de app-icon sobre fondo oscuro.

**Declara los tokens de marca**, y esto es lo más valioso del set:

| Token | Valor |
|---|---|
| GOLD | `#E0AC3C` |
| BLUE | `#3D6BFF` |

Pero es una **lámina 1448×1086 sin alfa**, con wordmark, muestras de color y
bajada tipográfica horneados en el pixel. No es un asset.

| Archivo | sha256 (16) | Resolución | Alfa | Clasificación |
|---|---|---|---|---|
| `Isologo_Dico_master_liso.png` | `f22cbcbbe94cdd79` | 1448×1086 | no | **referencia canónica** · archive |
| `Isologo_Dico_master_texturizado.png` | `3ede222936619ad6` | 1448×1086 | no | exploración · archive |
| `Isologo_Dico_asistente_A.png` | `2adcb50b831a2099` | 1448×1086 | no | exploración · archive |
| `Isologo_Dico_asistente_B.png` | `5c001b4e729c82e3` | 1448×1086 | no | exploración · archive |
| `Dico_2D_corte_ocular_light-dark.png` | `8795287950ee27e2` | 1448×1086 | no | lámina light+dark, **otro personaje** (con boca, piernas, sin aro azul) · archive |
| `Dico_2D_corte_ocular_referencia.png` | `aed5971dcbc2f3ef` | 1448×1086 | no | archive |
| `Dico_2D_neutro_referencia.png` | `888f66d40a46a8e9` | 1448×1086 | no | archive |
| `Dico_2D_ojos_neutros_light-dark.png` | `1456dae780822814` | 1448×1086 | no | archive |

**No existe ningún archivo del Dico 2D aislado con transparencia, ni SVG.**

## 2. Dico 3D — el set nuevo, y por qué no entra todavía

`Downloads/Dico 3D/` es la entrega más reciente y su nomenclatura mapea casi uno
a uno con el brief. Es el **personaje nuevo**: aro azul oscuro, ojos con
pestañas, nariz, guantes blancos, **sin galera**.

| Archivo | sha256 (16) | Resolución | Alfa | Mapea a |
|---|---|---|---|---|
| `dico_face-idle.png` | `e48d164090d7b9f9` | 1024×726 | **no** | 3D `idle` |
| `dico_face-processing.png` | `f6bd000cfec6ad67` | 1301×924 | **no** | (estado 2D `processing` / 3D) |
| `dico_face-thinking.png` | `6b1f836ada58d167` | 1488×1057 | **no** | 3D `thinking` |
| `dico_face-question.png` | `e3a240baf2a837f6` | 1303×924 | **no** | `question` |
| `dico_face-success.png` | `61a57f6ea2874525` | 1488×1057 | **no** | 3D `success` |
| `dico_face-worried.png` | `80906daaf8ffc98f` | 1488×1057 | **no** | 3D `worried` |
| `dico_face-error.png` | `5e7bbde11ce32aed` | 1484×1060 | **no** | 3D `error` |
| `dico_body-explaining.png` | `dac0fe4a9170ad5e` | 1488×1057 | **no** | 3D `explain` |
| `dico_body-pointing.png` | `ae02f2a39b908d3e` | 1488×1057 | **no** | 3D `point-down` |
| `dico_body-attention.png` | `90cf4c284a8ab21e` | 1487×1058 | **no** | 3D `point-up` / atención |

### El problema técnico, medido

Los diez están sobre **negro opaco**: `alpha=0` en el 0 % de los píxeles.

El fondo *sí* es negro puro y uniforme —promedio 1,1, máximo 3 sobre 255 en el
marco exterior, 0 % de píxeles fuera de negro— así que a primera vista parece
recortable por luminancia.

**No lo es.** En la zona central del personaje, **el 47,9 % de los píxeles
también es casi-negro** (≤40 de luminancia): el aro azul oscuro, las pupilas y
las pestañas. Un recorte por luminancia se lleva puesta media identidad.

Las resoluciones además no son homogéneas (1024×726 hasta 1488×1057), así que el
personaje no está al mismo tamaño entre poses: un crossfade entre dos de ellas
saltaría de escala.

### Set viejo, con transparencia real

`…/02_Dico_3D` sí tiene alfa, pero es el personaje **con galera y bigote** —la
identidad que el brief supersede— y es la misma generación que los
`escena-*.webp` que ya viven en el repo como archive.

| Archivo | sha256 (16) | Resolución | Alfa | Clasificación |
|---|---|---|---|---|
| `Dico_3D_neutro.png` | `4f114c30da7d9ff6` | 1254×1254 | sí | personaje viejo · archive |
| `Dico_3D_exito.png` | `711cd803064380ac` | 1254×1254 | sí | archive |
| `Dico_3D_pensando.png` | `3846cf3802c73f16` | 1254×1254 | sí | archive |
| `Dico_3D_duda.png` | `4e480246d3e8ea17` | 1254×1254 | sí | archive |
| `Dico_3D_error.png` | `0d7199a0359ad7aa` | 1254×1254 | sí | archive |
| `Dico_3D_senala_abajo_A/B/C.png` | `5e4a33c0…` `1d60ccb9…` `9ab4eb23…` | ~1254×1254 | sí | archive |
| `Dico_3D_base_sin_rostro_con_galera.png` | `15820ef9f59d4718` | 1254×1254 | sí | **es el `dico-physical-body.webp` del repo** |
| `Dico_3D_base_sin_rostro_sin_galera.png` | `210ea5289e97fc78` | 1024×1024 | sí (dura) | archive |
| `Dico_3D_guia_expresiones.png` | `da73aa0b0a10b52d` | 1536×1024 | no | guía, no sprite |

**Anomalía de alfa medida** en el set viejo: el sujeto está pintado con alfa
**224–254**, no 255 —hay ~0 % de píxeles totalmente opacos—, o sea que el
personaje es levemente translúcido. Sobre fondo oscuro se ensucia. La excepción
es `base_sin_rostro_sin_galera`, que tiene alfa dura 0/255 y por lo tanto **sin
antialiasing en el borde**.

Ninguna de las dos formas es un alfa de producción sano.

## 3. Lo que hay en el repo hoy

`src/components/dico/poses/` — 12 archivos, todos del personaje viejo:
3 en runtime (`moneda-sin-brazos`, `brazos`, `dico-physical-body`) y 9 fuera del
grafo productivo, con el gate de B5 impidiendo que vuelvan a entrar.

`public/brand/` — 6 archivos, todos **Hermes**, ninguno Dico.

## 4. Mapa propuesto: asset → componente → estado → uso

Con lo que hay hoy, y marcando lo que falta.

| Asset | Componente | Estado / pose | Uso | ¿Se puede hoy? |
|---|---|---|---|---|
| *(falta)* Dico 2D transparente | nuevo `DicoIsologo` | `neutral` | sidebar, ancla superior | **NO** — sólo lámina |
| *(falta)* Dico 2D estados | `DicoIsologo` | `curious` `happy` `celebrate` `alert` `concerned` `question` | microestado | **NO** |
| *(falta)* isologo SVG/PNG | favicon, The Slot | — | favicon, marca | **NO** |
| overlay Volt | nuevo `DicoPulso` | `idle` `active` `processing` `thinking` `attention` | pulso | **SÍ** — es CSS/SVG propio, no depende de asset |
| `dico_face-idle` | `DicoSlot` (Physical) | `idle` | presencia 3D | **NO** sin alfa |
| `dico_face-processing/thinking/question/success/worried/error` | `DicoSlot` | ídem | expresión 3D | **NO** sin alfa |
| `dico_body-explaining` | `DicoSlot` | `explain` | explicar | **NO** sin alfa |
| `dico_body-pointing` | `DicoSlot` | `point-down` | señalar CTA | **NO** sin alfa |
| `dico_body-attention` | `DicoSlot` | `point-up` / atención | destacar | **NO** sin alfa |
| `BurbujaDico` (ya existe) | — | — | voz de Dico 3D | **SÍ**, se conserva |
| `DicoPresence` (ya existe) | — | máquina B1 | autoridad | **SÍ**, se conserva |

**Conclusión del mapa: de 12 filas, 3 se pueden hoy.** Las 9 que dependen de un
asset final están bloqueadas por transparencia, no por código.

## 5. Qué falta, en concreto

1. **Dico 2D aislado, transparente** (PNG y/o SVG), en el personaje del
   `Isologo_Dico_master_liso`: aro azul, dos ojos, sin boca.
2. **Los seis estados 2D** (`curious`, `happy`, `celebrate`, `alert`,
   `concerned`, `question`) — hoy sólo existe el neutro, y dentro de una lámina.
3. **Re-export de las 10 poses 3D con canal alfa**, desde la fuente. No un
   recorte del PNG negro.
4. **Encuadre homogéneo entre poses 3D**: mismo tamaño de personaje y mismo
   centro, o el crossfade salta.
5. **Isologo vectorial Light/Dark** para favicon y marca.

Punto 3 es el que decide el ritmo de B6R: **recortar el negro por luminancia no
es viable** (§2) y hacerlo a mano con matting es lossy sobre bordes suaves y
sombras. La salida barata y correcta es pedir el re-export con alfa.

## 6. Estado de los contratos B5 / B6

| Contrato | Archivo | Destino |
|---|---|---|
| El grafo productivo no alcanza la cara legacy | `dicoCaraCanonica.test.jsx` | **SE CONSERVA Y SE AMPLÍA** — es lo que va a impedir que los assets viejos vuelvan cuando entren los nuevos |
| `poses/` completamente clasificado | ídem | **SE CONSERVA** — hay que sumar los assets nuevos a la clasificación |
| Globs con nombre exacto | ídem | **SE CONSERVA** |
| Una sola fuente facial (`dico-esclera` en un módulo) | ídem | **SUPERSEDED** — el brief autoriza representaciones distintas para 2D y 3D |
| Native y Physical rinden la anatomía de `CaraDeTinta` | ídem | **SUPERSEDED** |
| Paridad Native/Physical | `dicoExpresiones.test.jsx` | **SUPERSEDED** |
| Proporción del marco Physical (`--dico-cara-*`) | ídem | **SUPERSEDED** si Physical pasa a PNG |
| Vocabulario de 7 estados + eje de habla | ídem | **A RECONCILIAR** — ver §7 |
| `error` no depende del color | ídem | **SE CONSERVA COMO PRINCIPIO**, cambia la implementación |
| Reduced motion conserva significado | ídem | **SE CONSERVA**, se extiende al pulso Volt |
| Contratos B1–B4 | `dicoPresence`, `dicoSlot`, `burbujaDico`, `dicoAvisos` | **INTACTOS** |

## 7. Choque de vocabularios, sin resolver

Hay **tres** listas de estados y no coinciden:

| B6 actual (código) | Brief §4 — Dico 2D | Brief §11 — poses 3D |
|---|---|---|
| `idle` | `neutral` | `idle` |
| `processing` | — | — |
| `thinking` | — | `thinking` |
| `success` | `happy` / `celebrate` | `success` |
| `worried` | `concerned` | `worried` |
| `question` | `question` | `question` (opcional) |
| `error` | `alert` | `error` |
| — | `curious` | — |
| — | — | `explain`, `point-down`, `point-up` |

`processing` sólo existe en el código; `curious` sólo en el brief 2D;
`explain`/`point-*` son poses corporales, no estados emocionales.

**No se resolvió acá**: elegir el vocabulario final es decisión de producto y
cambia la API de tres componentes. Se propone en B6R.2.

## 8. Reconciliación del B6 anterior

El brief supone que B6 pudo quedar «parcialmente editado y no commiteado».
**No es el caso**: el worktree está limpio y B6 está entero en 7 commits
(`f25da40` … `40de375`). No hay nada que revertir ni que rescatar del disco.

| Clase | Qué | Resolución |
|---|---|---|
| **A · compatible** | Contratos B1–B4; el gate de imports; el método de verificación por mutación; el arreglo de reduced-motion; el harness de medición y captura | se conserva |
| **B · experimento superseded** | X de error en SVG, bocas nuevas, párpados en `success`, ajuste de mirada de `thinking`, marco `--dico-cara-*` | **se deja en la historia, marcado superseded**. No se revierte: revertir borraría también los contratos A que viven en los mismos commits |
| **C · infra reutilizable** | `dicoCaraCanonica.test.jsx`, probes de `.qa-lite/artifacts/phase-b6-expresiones/` | se conserva y se amplía |
| **D · documentación** | `PHASE-B5-CANONICAL-FACE.md`, `PHASE-B6-EXPRESSIONS.md`, entradas del HANDOFF | se conserva como evidencia histórica |

`B5 = CLOSED FOR PREVIOUS CANONICAL-FACE ARCHITECTURE / SUPERSEDED BY FINAL
ASSET DIRECTION`.

## 9. Plan mínimo para B6R.2

Ordenado por lo que **no** depende de assets faltantes, para no quedar bloqueado.

1. **Decidir el vocabulario** (§7). Bloquea todo lo demás y no cuesta código.
2. **Pedir el re-export con alfa** de las 10 poses 3D, encuadre homogéneo. Es la
   dependencia crítica y la única que no puedo resolver del lado del código.
3. **`DicoPulso`, el overlay Volt** — se puede hacer **ya**: es SVG/CSS propio,
   no depende de ningún asset, y el brief lo pide reutilizable para 2D, 3D y
   logo. Cinco modos + Reduced Motion + contrato de no-reflow.
4. **Normalizar `public/brand/dico/`** y ampliar el gate de imports para que
   cubra los assets nuevos igual que cubre los viejos.
5. Recién con los assets con alfa: `DicoIsologo` en sidebar (B6R.2/3), estados
   2D (B6R.4), poses 3D (B6R.6).

**Lo que NO se propone:** recrear el personaje en SVG para «destrabar». El brief
lo prohíbe y con razón — el resultado sería otro personaje.

---

# B6R.2A — vocabularios cerrados y pulso Volt

## V. Los tres vocabularios

**No hay un vocabulario único.** Son tres ejes independientes; ninguno determina
a los otros. Autoridad: `src/components/dico/vocabulario.js`.

### `nativeState` — qué cara pone Dico 2D
`neutral` · `curious` · `happy` · `celebrate` · `alert` · `concerned` · `question`

Comunica con **cejas + ojos**. Sin boca.

### `physicalPose` — qué pose toma Dico 3D
`idle` · `explain` · `pointDown` · `pointUp` · `thinking` · `worried` · `success` · `error`

`explain`, `pointDown` y `pointUp` son **poses corporales** y no tienen
equivalente en 2D: Dico 2D no tiene cuerpo con el que señalar.

### `activity` — qué está haciendo el sistema
`idle` · `active` · `processing` · `thinking` · `attention`

Es el único eje que se expresa por **movimiento**, y el único que consume
`DicoPulso`.

### Alias legacy conservados

| Alias | Resuelve a | Eje | Por qué se conserva |
|---|---|---|---|
| `idle` | `neutral` | nativeState | vocabulario B6 |
| `success` / `contento` | `happy` | nativeState | B6 / original |
| `worried` / `preocupado` | `concerned` | nativeState | B6 / original |
| `error` | `alert` | nativeState | B6 |
| `question` / `pregunta` | `question` | nativeState | `DicoAvisos`, `ProductsPanel` |
| `point-down` / `pointing` | `pointDown` | physicalPose | nomenclatura de los PNG |
| `point-up` / `attention` | `pointUp` | physicalPose | ídem |
| `explaining` | `explain` | physicalPose | ídem |
| `esperando` | `processing` | **activity** | original |
| `pensando` | `thinking` | **activity** | original |

**Lo que revela la última fila:** la lista vieja de `DicoCara` mezclaba los tres
ejes. `processing` y `thinking` nunca fueron expresiones faciales — son
actividad del sistema. Quedan marcados en `LEGACY_NO_ES_EXPRESION` para que la
migración de B6R.4 no los arrastre a `nativeState` por inercia.

Un mismo nombre puede vivir en dos ejes: `thinking` es pose 3D **y** actividad.
Cada resolutor se queda en el suyo, y hay contrato que lo fija.

## VI. Blue Base vs Volt — resuelto midiendo

El brief pidió inspeccionar la fuente de `#3D6BFF` antes de asignar. Se midieron
los tres azules que hay en el arte final, agrupando píxeles por luminancia:

| Origen | Hex | Luminancia |
|---|---|---|
| Aro del render 3D (`dico_body-pointing`, `dico_face-idle`) | `#2A3369` – `#2C3465` | 53 |
| Aro del isologo plano (`Isologo_Dico_master_liso`) | `#0957E6` | 81 |
| Declarado en la lámina | `#3D6BFF` | 108 |

Y el contraste del pulso contra cada candidato a base:

| Par | Contraste | Consecuencia |
|---|---|---|
| `#2A3369` vs `#3D6BFF` | **2,67:1** | el pulso se ve |
| `#0957E6` vs `#3D6BFF` | **1,35:1** | el pulso desaparece |

**Conclusión: `#3D6BFF` es el Volt, no la base.** La base tiene que ser el navy
opaco del arte 3D. Usar el mismo hex para las dos cosas dejaría un pulso
invisible sobre su propio aro.

| Token | Valor | Rol |
|---|---|---|
| `--dico-blue-base` | `#2A3369` | el material del aro. Opaco y oscuro |
| `--dico-blue-volt` | `#3D6BFF` | la señal. Nunca fondo, nunca relleno grande |
| `--dico-blue-flat` | `#0957E6` | el aro **vectorial** del isologo. Ni base ni señal |

## VII. `FINAL_ASSET_ALPHA_EXPORT_REQUIRED`

**Dependencia bloqueante.** Los masters nuevos no tienen alfa utilizable y el
encuadre 3D no está normalizado. No se recorta el fondo negro por luminancia
—el 47,9 % de la zona central del personaje también es casi-negro— y no se
recrea el personaje.

### Requisitos del re-export — Dico 2D

1. Transparencia real (alfa 0 fuera del personaje, 255 adentro, borde con alfa
   parcial para el antialiasing).
2. **Mismo canvas y mismo centro** para todos los estados.
3. **Mismo diámetro** de moneda entre estados.
4. Sin damero.
5. Sin fondo de ningún color.
6. Un archivo por estado de `nativeState` (7).

### Requisitos del re-export — Dico 3D

1. Transparencia real.
2. **Mismo canvas** para todas las poses.
3. **Centro de la moneda constante** entre poses.
4. **Escala de la moneda constante** entre poses — hoy las resoluciones van de
   1024×726 a 1488×1057 y el personaje cambia de tamaño: un crossfade saltaría.
5. Padding suficiente para brazos y manos; **nada recortado**.
6. Misma iluminación y mismo material entre poses.
7. PNG o WebP **lossless** como master.
8. Un archivo por `physicalPose` (8).

### Lo que ya se sabe que hay que evitar

- El set viejo con alfa tiene el sujeto pintado en **alfa 224–254**, con cero
  píxeles totalmente opacos: levemente translúcido. Sobre fondo oscuro se
  ensucia.
- `Dico_3D_base_sin_rostro_sin_galera` tiene alfa **dura 0/255**, sin
  antialiasing en el borde: se ve dentado.

Ninguna de esas dos formas es un alfa de producción sano.

## VIII. `DicoPulso` — implementado

Es lo único de B6R que no depende de assets. Capa SVG separada: no se edita
ningún PNG y no se toca el Gold.

| | |
|---|---|
| API | `<DicoPulso activity="processing" radio={44} grosor={6} intensidad={1} aro={false} />` |
| Modos | `idle` `active` `processing` `thinking` `attention` |
| Desacoplado de | roles, verticales, `DicoPresence`, Slot, mensajes, poses |
| Contratos | 23 tests, **10 mutaciones y las 10 fallan** |

| Medición en navegador | Resultado |
|---|---|
| Reflow | **cero** desajuste de caja en 20 celdas |
| Reduced motion | de 18 animaciones (15 infinitas) a **0** |
| Significado en reduce | los 5 modos conservan forma estática propia |
| Continuidad del recorrido | 238,5° → 319,3° → 30,8° → 114,7°, avance parejo |
| Estabilidad del segmento | 6448 vs 6428 px de Volt entre frames — no parpadea |

**Por qué no parece spinner:** la señal tiene cabeza y cola en vez de ser un arco
duro; va sobre un aro que ya existe en vez de flotar sola; y la vuelta es calma
—un spinner de 0,8 s grita «esperame», 2,6 s dice «estoy en eso».

`attention` es **finita** (dos vueltas y para) a propósito: un loop infinito para
«mirá esto» se vuelve ruido de fondo y deja de avisar.

### Pendiente para cuando el pulso entre a la app

`DicoPulso` **todavía no está montado en ninguna pantalla**. Cuando lo esté, sus
animaciones infinitas van a aparecer en las superficies de QA Lite y hay que
registrarlas en `e2e/qa-lite/dico-neutral-contract.mjs`, o el gate va a fallar
por «unexpected selector».
