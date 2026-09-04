# PHASE 9.1 — Physical Visual Corrective

Fecha de apertura: 2026-09-04 · Estado: **ABIERTA. Diagnóstico hecho, corrección NO implementada.**
Origen: veredicto visual de Phase 4 (puntos 3 y 4, no aprobados).

Este documento abre el carril. No implementa nada: mide los dos defectos, dice
qué los causa y propone la corrección mínima.

Evidencia ejecutable: `e2e/qa-lite/phase91-physical-diagnostico.spec.ts`
Artefactos: `.qa-lite/artifacts/phase91/diagnostico.json` + capturas.

---

## 1. Dirección aprobada

Dico 3D deja de vivir pegado a la sidebar. Comportamiento objetivo:

- aparece **centrado en pantalla**;
- en **capa superior**;
- con **scrim** / fondo atenuado sutil;
- **no empuja el contenido**;
- **no depende del hover de la sidebar**;
- **click/tap afuera lo cierra**.

Señalar un target concreto se resuelve después: la entrada base es central e
independiente.

**Fuera de alcance, confirmado:** poses nuevas, `pointLeft` / `pointRight`,
chat completo, botón «Llamar a Dico».

---

## 2. Los dos defectos, medidos

### 2.1 Empuja el contenido (punto 3)

Medido a 390px, con y sin Physical en pantalla:

| | sin Physical | con Physical |
|---|---|---|
| `.ag-slot` (alto) | 6px | 198px |
| `.ag-pantalla-productos` (y) | 138,6 | 211,6 |

**La pantalla de Productos baja 73px** por el solo hecho de que Dico aparezca,
y el hueco crece 192px.

**Causa.** `.ag-slot` es una caja normal **en el flujo del documento**
(`position: relative`, `max-height: 40vh`, `overflow: hidden`), montada entre
el encabezado y `ProductsPanel` en `PlatformAdmin.jsx`. Cuando Physical monta,
el escenario aporta su alto —`--pose-alto` ≈ 318px— y el hueco crece hasta el
tope. Todo lo que está debajo se corre.

No es un descuido: es lo que el contrato de layout de Phase 8 pedía —«nunca
flota sobre navegación, controles persistentes ni diálogos»— resuelto
reservando lugar en el flujo. La dirección nueva invierte esa decisión, y hay
que declararlo así.

**Sólo pasa en mobile.** En escritorio `PlatformAdmin` no monta la presencia en
`.ag-slot` (`{!esDesktop && huecoDico && presenciaDico}`): vive en la sidebar,
y ahí Physical es `fixed` y no empuja nada.

### 2.2 El loop reaparece (punto 4)

Con el puntero **inmóvil**, 12 lecturas de la posición X del Slot:

| puntero sobre | oscila | amplitud |
|---|---|---|
| el personaje | **no** | 0px |
| **el CTA de la burbuja** | **sí** | **160px** |

Posiciones sobre el CTA: `240, 160, 156, 184, 253, 316, 315, 264, 308, 156,
210, 156`.

**Causa.** La cadena de Phase 4 sigue entera:

| # | Eslabón | Medido |
|---|---|---|
| 1 | El Slot es `position: fixed` | `"fixed"` |
| 2 | …pero es **descendiente del `<aside>`** | `esDescendienteDeLaSidebar: true` |
| 3 | …y su `left` sale del ancho de la sidebar | `calc(var(--ag-sidebar-ancho) + …)` |

PASS 3 cortó el eslabón 2 con `pointer-events: none` **y volvió a habilitarlo
en los controles de la burbuja**, que son los únicos con los que se interactúa.
Los que siguen aceptando puntero, medidos:

```
button.dico-burbuja-contenido   span.dico-burbuja-reserva
i.dico-burbuja-cursor-reserva   span.dico-burbuja-texto
button.dico-burbuja-accion      button.dico-burbuja-cerrar
```

Cada uno es una reentrada al hover del riel. O sea: **el loop está cortado
mientras nadie toca la burbuja, que es justo lo que el usuario va a hacer.** El
parche de PASS 3 ya lo decía por escrito —«si mañana algo vuelve a necesitar
puntero dentro del Slot, el loop vuelve»—; esto lo confirma con número.

`hayScrim: 0` — hoy no existe ninguna capa atenuada detrás.

---

## 3. Propuesta mínima

Una sola causa explica los dos defectos: **Physical se monta dentro del árbol
de otro** —el `<aside>` en escritorio, el flujo del documento en mobile— y por
eso hereda el hover de uno y el layout del otro.

La corrección mínima es sacarlo de los dos:

1. **Portal a `body`.** El Slot deja de ser descendiente del `<aside>` y de
   `.ag-slot`. Con eso caen solos el eslabón 2 —el hover del riel deja de
   verlo, sin necesitar `pointer-events: none`— y el empuje de mobile, porque
   deja de ocupar lugar en el flujo.
2. **Posición fija y centrada**, independiente de `--ag-sidebar-ancho`.
3. **Scrim** propio detrás, en la capa de backdrop, que además da el
   click-afuera-cierra sin inventar nada.

Los tres son el mismo movimiento y no conviene partirlos: portar sin centrar
deja a Physical en una coordenada que ya no significa nada.

### Qué se reabre, y por qué no entra en Phase 4

| Qué hay que tocar | Contrato en riesgo |
|---|---|
| Sacar el Slot del `<aside>` | Geometría de `left`/`top`. `dico-sidebar.spec.ts` mide el reanclaje en 4 anchos, y ese contrato **queda sin objeto**: Physical ya no se reancla porque ya no depende del riel |
| Physical centrado | `--pose-bajo-pies`, `--pose-tinta-izq`, `--pose-dedo`, `--pose-dedo-y` **salen de medir píxeles alpha del asset**. El contrato es explícito: «si alguien las redondea, el dedo deja de caer sobre el CTA» |
| Scrim | Capas: hoy Physical vive en `--ag-z-nav + 1` (medido: `z-index: 6`); un scrim entra en la conversación de `--ag-z-backdrop` (800) |
| Anclaje a target | `anclaje: 'target'` ancla por **tinta**, no por caja. «Primero centro, después target» es una transición nueva, o sea motion nuevo |
| `.ag-slot` vacío en mobile | Phase 8 lo puso en el flujo a propósito para que Dico no tapara nada. Vaciarlo revierte esa decisión |

**Veredicto de alcance: NO entra como correctivo acotado.** Toca el contrato de
geometría de Phase 9, el de capas del shell y el de layout de Phase 8, y deja
sin objeto parte de `dico-sidebar`. Necesita su propio brief de ejecución y su
propio gate — que es lo que este carril es.

---

## 4. Estado

- Defectos: **demostrados y medidos**.
- Corte parcial del loop con `pointer-events` (Phase 4): **aceptado
  provisionalmente**. Sirve mientras el puntero no entre a la burbuja.
- Portal, centrado, scrim y click-afuera: **no implementados**.
- Ejecución: **sin empezar**.
