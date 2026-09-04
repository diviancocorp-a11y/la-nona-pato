# Phase 9.1 — Physical Visual Corrective · PROPUESTA

Fecha: 2026-09-04 · Estado: **PROPUESTA, no ejecutada**
Origen: Phase 4 · VISUAL CONVALIDATION PASS 2, punto 6.

Este documento no implementa nada. Registra un defecto **demostrado con
medición**, el parche que sí se aplicó, y qué queda fuera del alcance de
Phase 4 porque tocaría el contrato de motion de Phase 9.

---

## 1. El defecto, demostrado

Evidencia ejecutable: `e2e/qa-lite/phase4-physical-loop.spec.ts`
Artefactos: `.qa-lite/artifacts/phase4-golden/physical-loop/diagnostico.json`

**Medición.** Con Physical en pantalla y el puntero **inmóvil** encima del
personaje, la caja del Slot ocupó **8 posiciones distintas en X** a lo largo de
12 lecturas: de `203` a `259`. **Amplitud: 56px.** El personaje oscilaba sin
que nadie moviera el mouse.

**La cadena, con sus tres eslabones verificados en la misma corrida:**

| # | Eslabón | Medido |
|---|---|---|
| 1 | El Slot es `position: fixed` | `position: "fixed"` |
| 2 | …pero sigue siendo **descendiente del `<aside>`** en el DOM | `esDescendienteDeLaSidebar: true` |
| 3 | …y su `left` depende del ancho de la sidebar | `left: calc(var(--ag-sidebar-ancho) + 8px + …)` |

De ahí el ciclo: el puntero entra en Physical → como es descendiente del
`<aside>`, cuenta como **hover de la sidebar** → la sidebar se expande →
`--ag-sidebar-ancho` pasa de `64px` a `224px` → Physical se corre 160px y **se
escapa del puntero** → la sidebar colapsa → Physical vuelve debajo del puntero
→ vuelve a empezar.

Nada de esto es un bug de motion: las tres piezas hacen exactamente lo que
declaran. El defecto está en que **Physical vive dentro del elemento cuyo
tamaño lo posiciona**.

## 2. Lo que sí se corrigió en Phase 4

Se cortó el **eslabón 2**, que es el único que se puede tocar sin reinterpretar
motion ni geometría:

```css
.ag-sidebar .dico-slot { pointer-events: none; }
/* los controles de su burbuja se reactivan uno por uno */
```

El personaje deja de capturar el puntero, así que no dispara el hover del riel.
**Re-medido: `oscila: false`, amplitud `0`.**

Se puede hacer porque desde este mismo pase **Dico 2D ya no invoca a Physical**
(punto 2): lo único con lo que se interactúa dentro del Slot es el CTA y la X
de la burbuja, y los dos siguen siendo clickeables.

**Lo que NO resuelve:** que Physical siga anclado a la sidebar. El eslabón 1 y
el 3 siguen ahí. Si mañana algo vuelve a necesitar puntero dentro del Slot —el
botón «Llamar a Dico», por ejemplo— el loop vuelve.

## 3. Lo que requiere Phase 9.1

La dirección aprobada para estudiar: **Physical aparece centrado, independiente
de la sidebar, con un scrim sutil detrás; si tiene que señalar un target, se
posiciona hacia él después.**

Eso no entra en Phase 4 porque toca contratos cerrados y medidos:

| Qué habría que tocar | Contrato en riesgo |
|---|---|
| Sacar el Slot del `<aside>` (portal a `body`) | La geometría de `left`/`top` de la sidebar; `dico-sidebar.spec.ts` |
| Physical centrado | `--pose-bajo-pies`, `--pose-tinta-izq`, `--pose-dedo`, `--pose-dedo-y` — **salen de medir píxeles alpha del asset**, no de tantear |
| Scrim detrás | Capas: hoy Physical vive en `--ag-z-nav + 1`; un scrim entra en la conversación de `--ag-z-backdrop` (800) |
| Reposicionar hacia el target | `anclaje: 'target'` ya existe y ancla por **tinta**, no por caja. Un modo "primero centro, después target" es una transición nueva, o sea motion nuevo |

El contrato de geometría es explícito al respecto: *«si alguien las redondea,
el dedo deja de caer sobre el CTA»*. Reabrirlo sin un gate propio es la forma
de romper Phase 9 en silencio.

## 4. Fuera de alcance, confirmado

No se implementan acá ni en Phase 4: `pointLeft` / `pointRight`, la
alternancia automática up/down por espacio disponible, el botón «Llamar a
Dico», el chat con Physical, ni Dico 2D como la «O» del logo.

## 5. Estado

- Defecto: **demostrado y medido**.
- Loop: **cortado** en Phase 4, con re-medición.
- El parche de `pointer-events`: **aceptado provisionalmente** (Ricky,
  4/sep/2026), porque la causa se demostró, la amplitud quedó en 0 y no se
  tocó motion.
- Physical centrado: **diferido a esta fase**. No se implementa ahora.
- Causa de fondo: **abierta**, documentada acá.
- Phase 9.1: **no iniciada**. Necesita su propio brief y su propio gate.
