# Phase 3B — gate A3, cierre integrado del shell

Fecha: 2026-09-03 · HEAD medido: `b6506a7` · Rama: `feat/dico-panorama-v1`

Este es el gate que faltaba para que Phase 3B pase de **IMPLEMENTED** a
**CLOSED**, y con eso desbloquear Phase 4 (Golden Screen).

---

## 0. Qué es A3, y qué no

`DICO-IMPLEMENTATION-STATUS.md` definía A3 por sus **seis dimensiones**
—browser, light/dark, mobile, navegación, focus y overflow— sin un
procedimiento paso a paso. Así que este gate **no inventó umbrales**: re-midió
sobre el HEAD integrado los contratos que Phase 3A y 3B ya habían dejado
persistidos con números.

Lo que hace distinto a A3 de los gates de 3A y 3B: aquéllos midieron el shell
**en su propia rama**. A3 lo mide con todo lo que se le montó encima después —
Machine Soul, el recovery Presence/Slot, Dico Native 2D, el runtime Physical y
Phase 9. Eso es lo único que "cierre integrado" puede significar.

Evidencia ejecutable: `e2e/qa-lite/phase3b-a3.spec.ts`.
Artefactos: `.qa-lite/artifacts/phase3b-a3/`.

## 1. Resultado por dimensión

| Dimensión | Cómo se midió | Resultado |
|---|---|---|
| **browser** | Chromium real vía Playwright sobre el build del ref, no jsdom | ✅ |
| **light/dark** | Las seis combinaciones tema × viewport | ✅ |
| **mobile** | 390×844 y 360×800 (los dos anchos que 3A midió) | ✅ |
| **navegación** | 5 ítems, ninguno fuera del viewport, target mínimo **46 px** | ✅ |
| **focus** | Foco dentro del diálogo al abrir, `aria-modal`, Escape cierra | ✅ |
| **overflow** | `scrollWidth − clientWidth` = **0** en las 6 combinaciones | ✅ |

### Navegación y overflow

| Caso | Desborde | Ítems | Target mínimo | Fuera del viewport |
|---|---|---|---|---|
| light/1440×1000 | 0 | 5 | *(nav oculta)* | 0 |
| light/390×844 | **0** | 5 | **46,0** | **0** |
| light/360×800 | **0** | 5 | **46,0** | **0** |
| dark/1440×1000 | 0 | 5 | *(nav oculta)* | 0 |
| dark/390×844 | **0** | 5 | **46,0** | **0** |
| dark/360×800 | **0** | 5 | **46,0** | **0** |

En escritorio la nav inferior está oculta (layout de sidebar) y sus rects miden
0×0: por eso el contrato táctil de 44 px se evalúa **sólo en mobile**, que es
donde 3A lo midió. No es un defecto, es la nav que no se muestra.

Contra el síntoma original de 3A —desborde de 151 px a 390 y 181 px a 360, con
`caja`, `mesas` y `personal` inalcanzables, y ningún ítem llegando al mínimo
táctil— el contrato se sostiene sin margen ajustado.

### Focus y capas

| | light | dark | Contrato de 3A |
|---|---|---|---|
| Foco al abrir dentro del diálogo | ✅ | ✅ | dentro |
| `z-index` backdrop | **800** | **800** | 800 |
| `z-index` panel | **810** | **810** | 810 |
| Backdrop cubre el viewport | ✅ | ✅ | sí |
| Ítems de nav que reciben el click | **0 / 5** | **0 / 5** | 0 de 5 |
| Escape cierra | ✅ | ✅ | sí |

La regresión que 3A vino a matar era el stacking context de `<main z-index:2>`
encerrando al diálogo: la nav seguía clickeable por debajo (8 de 8). Hoy sigue
en 0.

## 2. Un hallazgo del gate: los hexes de 3A ya no son la referencia

La primera corrida falló en `--ag-surface`: da `#fff` en claro y `#18181b` en
oscuro, contra los `#FFFDF7` / `#262626` de la tabla de 3A.

**No es una regresión.** Verificado en `src/styles/admin-tokens.css`: los
tokens son `var(--ms-white)` y `var(--ms-zinc-900)`, o sea la re-base a
Zinc/Carbon que **Phase 3B declaró en su sección 0** ("Divergencia
declarada"). Exigir los hexes de 3A habría hecho fallar al shell justamente
por cumplir 3B.

Lo que sí sigue vigente es el **defecto** que 3A arregló, y no era un hex: era
que los tokens no existían, cada `var(--ag-surface, #fffdf7)` caía a su literal
fijo, y en oscuro el fondo quedaba congelado en el crema del claro mientras el
texto seguía al tema — **1,24:1**. `var()` con fallback nunca falla, y por eso
sobrevivió meses.

La firma de esa falla es medible sin depender de la paleta vigente: **el token
tiene que valer distinto en claro y en oscuro**. Eso es lo que el gate mide
ahora, más el contraste real del par del shell resuelto por el navegador:

| Tema | `--ag-surface` | `--ag-ink` | Contraste |
|---|---|---|---|
| light | `#fff` | `#09090b` | **19,90:1** |
| dark | `#18181b` | `#f4f4f5` | **16,12:1** |

Contra el 1,24:1 del síntoma original, y contra el 4,5:1 de AA que 3A usó para
declarar que 20 de 23 elementos incumplían. **Ningún umbral se subió**: el que
se corrigió fue el mío, que estaba anclado a un número que 3B ya había
reemplazado a propósito.

## 3. Tests integrados y build

| | |
|---|---|
| Suite completa (`--pool=threads`) | **1172 / 1172** |
| Build (`vite build`, pre-commit) | verde en cada commit del lote |
| Typecheck (`tsc --noEmit`) | verde |
| Harness QA Lite (`qa:lite:test`) | 28 / 28 |
| same-ref gate | 5/5 sobre `98db946`; los commits posteriores tocan sólo docs y un spec nuevo que **no** entra en el `testMatch` del gate normal, así que la superficie comparada no cambió |

## 4. Deuda declarada que A3 NO trata como defecto

Sigue vigente lo que 3B ya había inventariado en su sección 8, y este gate no
la reabre:

- 30 `'DM Sans'` inline en 18 componentes de módulo — interior de pantalla.
- Google Fonts a nivel documento, heredado del catálogo vía `index.html`.
- «Ver el salón» a 3,17:1 — chip de módulo con el par teal legacy, **fuera del
  shell**.
- `dico-burbuja-texto` a 1,16:1 — **artefacto de medición**, no defecto: el
  papel de la burbuja es un `fill` de SVG y la sonda lee el fondo del shell.
- `src/components/ui/Modal.jsx` huérfano y basado en Tailwind.
- Overlays legacy (`.ag-page-over`, `Dialogs.jsx` con `z-index: 9999`) mapeados
  pero no migrados.
- Los cuatro errores de consola preexistentes, que 3B dejó explícitamente fuera
  de alcance.

**Resuelta desde entonces**: el *scroll trace inestable en `after-open-admin`*
que 3B dejó abierta. B6R.QA1 la cerró y las cinco corridas same-ref de hoy
reportan `SCROLL TRACE: identical`.

Además, una inconsistencia menor de documentación detectada al verificar: el
comentario de `admin-tokens.css:77` todavía dice que *"`--ag-surface` conserva
el crema del claro"*, pero el valor ya es `var(--ms-white)`. El comentario
quedó viejo respecto del código. No bloquea.

## 5. Veredicto

**PHASE 3B — A3 CLOSED.** Las seis dimensiones verdes sobre el shell integrado,
con los contratos de 3A y 3B sostenidos y sin ningún umbral movido.

Con esto **Phase 4 — Golden Screen queda desbloqueada**: era el único gate que
la matriz señalaba como faltante.
