# Phase 3A — Admin correctness foundation

Los cuatro defectos bloqueantes que documentó `PHASE-3-ADMIN-SHELL-BASELINE.md`,
corregidos antes de aplicar el lenguaje visual.

**Phase 3 visual NO fue implementada en este lote.** No se tocaron fuentes,
logo, texturas ni la dirección Machine Soul.

---

## 0. Base

| | |
|---|---|
| SHA base (real, de `git rev-parse`) | `71c58f86f8535f89a6ad7a7362df5d9e0825cd61` |
| Rama base | `codex/dico-phase3-admin-shell` (sin mover) |
| Rama del lote | `fix/phase3-admin-correctness` |
| HEAD del lote | `bfad58c4246529d2d39c41a2e1d11a1f892c58d7` |
| Worktree | `hermes-gastro-phase3-correctness` |

El SHA no se tomó de la documentación: `PHASE-3-ADMIN-SHELL-BASELINE.md` cita
`f88b143`, pero el HEAD real de la rama es `71c58f8` (un commit después, el
propio documento de baseline).

Verificado ausente: el commit Dico `0304f28` y los de build identity
(`09cc447`, `475b4d2`), y también `d86c8a9`.

## 1. Los cuatro defectos

### 1.1 Contraste POS oscuro — 1.24:1

**Síntoma medido**: en `pos--dark--desktop`, **20 de 23** elementos con texto
incumplían. Todos el mismo par: `rgb(229,229,229)` sobre `rgb(255,253,247)`.

**Causa raíz**: `components/admin/platform/**` consumía tokens que **no
existían** — `--ag-surface`, `--ag-surface-2`, `--ag-accent`, `--ag-ok`,
`--ag-bad`, `--ag-warn` y sus tintes. Cada `var(--ag-surface, #fffdf7)` caía a
su fallback, que es un literal fijo: el fondo quedaba congelado en el crema del
tema claro mientras el texto —`var(--ag-ink)`, que sí existe— seguía al tema.
En claro el par cerraba por casualidad; en oscuro se abría hasta 1.24:1.

`var()` con fallback nunca falla. Por eso sobrevivió meses.

**Solución**: definir los tokens en `admin-tokens.css`, por tema. No un
override local: la misma familia la usan `CajaPanel`, `EditorDeMesa`,
`CobrosOnline`, `MapaDeMesas`, `EquipoDelNegocio` y `PersonalPanel`.

`--ag-surface` conserva el crema `#FFFDF7` en claro para no cambiar esa vista;
lo que se agrega es el `#262626` que faltaba en oscuro.

| Token | Antes (fallback) | Claro | Oscuro |
|---|---|---|---|
| `--ag-surface` | `#fffdf7` fijo | `#FFFDF7` | **`#262626`** |
| `--ag-surface-2` | `rgba(0,0,0,0.04)` fijo | `rgba(38,38,38,0.05)` | `rgba(255,255,255,0.07)` |
| `--ag-ok` | `#2e7d32` fijo | `#1E7A38` | `#4CAF6A` |
| `--ag-bad` | `#c62828` fijo | `#B3261E` | `#E5534B` |
| `--ag-warn` | `#ef6c00` fijo | `#8A4B00` | `#C9761A` |
| `--ag-accent` | `#e8b947` fijo | `#E8B947` | `#E8B947` |
| `--ag-accent-border` | *(no existía)* | **`#9A6B00`** | `#E8B947` |

**Resultado medido en navegador** (`.qa-lite/artifacts/phase3a-correctness/`,
baseline vs `final2`):

| Superficie | Incumplen antes | Incumplen después | Peor ratio |
|---|---|---|---|
| `pos--dark--desktop` | **20 / 23** | **0 / 23** | 1.24:1 → **4.74:1** |
| `pos--dark--mobile` | **20 / 23** | **0 / 23** | 1.24:1 → **4.74:1** |

**Ratios sobre la superficie** (mínimo 4.5 texto normal / 3 estados):

| Par | Antes | Después |
|---|---|---|
| texto principal, oscuro | **1.24:1** | **11.58:1** |
| texto principal, claro | 16.05:1 | 16.05:1 (sin cambio) |
| texto secundario `--ag-ink-2`, oscuro | 1.10:1 | 5.70:1 |
| texto terciario `--ag-ink-3`, oscuro | 1.05:1 | 4.74:1 (`#737373` → `#909090`) |
| texto secundario, claro | 4.83:1 | 4.83:1 |
| `ok` / `bad` / `warn` como estado | mezclado | ≥ 3:1 en ambos temas |
| borde de selección (acento), claro | **1.8:1** | **4.6:1** |

**Reglas de DICO respetadas**: el oro conserva su función de acción — se pinta
como **fondo** con tinta `#1A1A1A` encima (9.6:1) y nunca como texto sobre
blanco (ese par da 1.75:1 y hay un test que lo fija). El borde de selección se
separó en `--ag-accent-border` justamente para no oscurecer el relleno. No se
convirtió el POS en alto contraste agresivo: la superficie oscura sigue siendo
`#262626`, no negro.

### 1.2 Tres secciones inalcanzables en mobile

**Síntoma medido**:

| Viewport | clientWidth | scrollWidth | Desborde | Fuera del viewport |
|---|---|---|---|---|
| 390×844 | 364 | 515 | **151 px** | `caja`, `mesas`, `personal` |
| 360×800 | 334 | 515 | **181 px** | `caja`, `mesas`, `personal` |

`overflow-x: visible`, sin scroll. `personal` terminaba en x=527.9 con un
viewport de 390. Y **ningún** ítem cumplía el mínimo táctil: 42 px de alto.

**Después** (medido en `final2`):

| Viewport | clientWidth | scrollWidth | Desborde | Inalcanzables | Targets < 44 |
|---|---|---|---|---|---|
| 390×844 | 364 | 364 | **0** | **ninguna** | **0** (46 px) |
| 360×800 | 334 | 334 | **0** | **ninguna** | **0** (49.1 px) |

El botón "Más" queda completo dentro del strip visible en los dos anchos
(390: right 368.1 contra 378; 360: right 339 contra 348).

**Causa raíz**: ocho módulos de gastro en una píldora fija, con
`flex-shrink: 0` y `white-space: nowrap`. No es un caso borde — es el caso
normal para un dueño.

**Solución**: `NavInferior` con desborde accesible. Las cuatro primeras
secciones quedan visibles; el resto vive en un botón **"Más"** que abre la hoja
de `Dialog`. Cuatro primarias + "Más" con targets de 44 entran en 360:
`110 + 3×44 + 44 + 4×4 = 302`.

Cuando la sección activa vive en el desborde, el botón "Más" toma el estado
activo, muestra su nombre y lo declara en su nombre accesible
(*"Más secciones. Estás en Caja"*). El usuario ve dónde está sin que los ítems
se reordenen bajo el dedo.

**Una sola fuente**: la lista entra por props desde el mismo `tabs` de
`PlatformAdmin`, que ya cruza rubro, módulos implementados y permisos
(`modulosDe` + `ICONOS` + `puedeVer`). No hay segunda lista. Una sección que el
rol no puede ver no existe en ese array y por lo tanto tampoco puede aparecer
por el desborde; hay un test que lo fija.

La barra pasa a `overflow-x: auto` como red: si alguna vez vuelve a desbordar,
se verá como scroll y no como contenido perdido.

Los ítems pasan de `flex-shrink: 0` a `1` con `min-width: 44px`, y el label del
activo corta con elipsis. Con 5 slots la fila pide `5×44 + 4×4 = 236` contra
334 disponibles a 360: **entra por construcción** en cualquier ancho, sin
calcular nada en JS y sin bajar del mínimo táctil. Un intento anterior —acotar
el label del activo bajo 400px— no mordía: el label ya medía ~65 px.

### 1.3 y 1.4 Diálogo sin trap ni Escape, y atrapado por el stacking context

Son el mismo problema visto de dos lados, y por eso se resolvieron con una
única primitiva.

**Síntoma medido (foco)**: el foco inicial quedaba en el botón "Cobrar" del
**fondo**; 14 de 22 pasos de Tab salían del diálogo; los primeros cuatro
recorrían botones de la pantalla de atrás; Escape no cerraba; al cerrar por la
X el foco caía en `body`. `aria-modal="true"` estaba declarado: un lector de
pantalla ocultaba el fondo mientras el teclado sí lo alcanzaba.

**Resultado medido**: foco al abrir en el primer control **dentro** del
diálogo (antes: `button.ag-btn-primary "Cobrar $11.000"`, fuera); backdrop
`z=800` que **cubre el viewport**; panel `z=810`; **0 de 5** ítems de nav
reciben el click con el diálogo abierto (antes 8 de 8), todos tapados por el
backdrop.

**Síntoma medido (capas)**: el diálogo declaraba `z-index: 60` y la nav `5`, y
aun así `elementsFromPoint` en el centro de cada ítem devolvía el ítem.
Playwright confirmaba que los botones de navegación eran clickeables con el
modal abierto. La pila real:

```
0. svg.ag-nav-icon   1. button.ag-nav-item   2. nav.ag-bottom-nav  (z 5)
3. button   4. section   5. div[role=dialog]  (z 60)   6. main  (z 2)
```

**Causa raíz**: `<main style="position:relative;z-index:2">` crea un stacking
context. El 60 estaba encerrado dentro del 2 y se comparaba contra él, no
contra el resto del shell. Subir el número no arregla nada: hay que salir del
contexto. El repo ya tenía la pista — `admin-shared.css` explica que
`.ag-page-over` debe ocultar topbar y nav con `display:none` justamente porque
`main` lo atrapa.

**Solución**: `OverlayPortal` + `Dialog` + `useFocusTrap`.

**Contrato del diálogo**

| | |
|---|---|
| `role="dialog"` + `aria-modal="true"` | sí |
| Nombre accesible | `aria-labelledby` o `aria-label`; `aria-describedby` opcional |
| Foco al abrir | primer control útil; si no hay ninguno, el contenedor (`tabindex="-1"`) |
| Tab / Shift+Tab | contenidos, con vuelta circular |
| Foco que se escapó | se recupera al siguiente Tab |
| Escape | cierra |
| Al cerrar | devuelve el foco al invocador, si sigue en el documento |
| Scroll del body | bloqueado mientras está abierto, restaurado al valor previo |
| Backdrop | cierra sólo si el click empieza **y** termina en él |
| Reduced motion | guard con la misma especificidad que la animación |
| Listeners | en captura, uno solo, limpiados al desmontar |
| Aperturas repetidas | no acumulan efectos ni roots |

**Una trampa que casi reintrodujo el bug**: los tokens `--ag-*` viven en
`.ag-root` y el tema oscuro es una clase sobre ese mismo nodo. Un portal
colgado de `<body>` no es descendiente suyo, así que el diálogo habría salido
**siempre en claro**. `OverlayPortal` copia la clase de tema al root y
`admin-tokens.css` lo suma al selector de tokens.

**Otra**: el root del portal se resuelve con un inicializador perezoso y no en
un efecto. Si el portal devolviera `null` en el primer render, el ref del panel
llegaría vacío al efecto de `useFocusTrap` y el foco no se movería nunca.

## 2. Sistema de capas

Inventario previo del admin: tokens `--ag-z-*` (0, 2, 5, 5, 6, 100) conviviendo
con hardcodes 4, 12, 29, 30, 910, 911, 950, 951, 1000, 1100 y 9999.

Jerarquía nueva, con dueño documentado:

| Token | Valor | Quién |
|---|---|---|
| `--ag-z-bg` | 0 | fondo decorativo (`.ag-bg-layer`) |
| `--ag-z-content` | 2 | el `<main>` del panel |
| `--ag-z-sticky` | 5 | topbar y bottom nav |
| `--ag-z-popover` | 30 | dropdowns anclados |
| `--ag-z-dico` | 60 | asistente contextual |
| `--ag-z-backdrop` | **800** | velo del diálogo |
| `--ag-z-modal` | **810** | panel del diálogo |
| `--ag-z-takeover` | 950 | `.ag-page-over`, BrandModal (ocultan el shell) |
| `--ag-z-toast` | 1000 | feedback efímero, por encima del modal |
| `--ag-z-tooltip` | 1100 | lo más alto |

**Los números de las capas que ya existían no cambiaron**: se les puso nombre.
Lo nuevo son `backdrop` y `modal`, que faltaban. Los alias viejos
(`--ag-z-topbar`, `--ag-z-nav`) apuntan a las capas nuevas para que no haya dos
verdades. Toast y tooltip conservan su contrato: el toast sigue por encima del
modal.

Regla: **si algo necesita estar por encima del shell, va por portal y usa una
de estas capas.** No se inventan números locales.

## 3. Pruebas

39 tests nuevos en `src/test/adminCorrectness.test.jsx`.

**Contraste (7)** — el cálculo WCAG contra pares conocidos; el 1.24:1 medido
reproducido; texto normal y secundario ≥4.5 en ambos temas; estados ≥3;
el oro como acción y no como texto sobre blanco; claro y oscuro no se
confunden.

**Overlay (5)** — monta fuera del shell y del `<main>`; sin `z-index` inline;
el root no crea stacking context; copia el tema; reutiliza un único root.

**Diálogo (12)** — role/aria-modal/nombre; `labelledby`/`describedby`; foco
inicial; cero enfocables; Tab y Shift+Tab circulares; Escape; devolución del
foco; bloqueo y restauración del scroll; reapertura sin acumular; limpieza de
listeners; filtro de enfocables.

**Navegación (12)** — las ocho secciones alcanzables; las tres antes ocultas
en "Más"; sin duplicados; permisos respetados; estado activo con clase y
`aria-current`; activo en el desborde; Enter y Space; cierre al elegir;
Escape + devolución de foco; foco inicial; `aria-haspopup`/`aria-expanded`;
todos con nombre accesible.

**Focus trap suelto (3)** — inactivo no toca el foco; activo enfoca el primero;
Escape una sola vez.

Nota: el repo no tiene `@testing-library/user-event` y este lote no agrega
dependencias, así que los tests usan `fireEvent` con helpers propios. El
recorrido de teclado end-to-end se verifica en el navegador, que es donde el
foco y el layout son reales.

## 3bis. QA Lite

| | |
|---|---|
| `npm run qa:lite:test` | **27/27** |
| `npm run qa:lite:compare` same-ref sobre `bfad58c` | **`blockingDiffPixels: 0`** · `domEqual: true` · `noExternalTraffic: true` · scroll trace idéntico |

`rawDiffPixels: 66`, todos clasificados como antialiasing (52) + redondeo (14).
Las dos capturas con delta son `catalog--carbon` (34) y `pos--dark` (32),
ninguna bloqueante. Seis de ocho tienen SHA256 idéntico.

El harness pudo abrir el POS, o sea que el contrato
`[role="dialog"][aria-label^="Cobrar el pedido"]` de `e2e/qa-lite/surfaces.ts`
sigue vigente: por eso `PantallaDeCobro` se nombra con `aria-label` y no con
`aria-labelledby`.

**No se produjo un diff old↔new como gate**: hay cambios deliberados y exigir
igualdad visual no tendría sentido. La evidencia del antes y el después son las
capturas de `.qa-lite/artifacts/phase3a-correctness/{baseline,final2}/`, con
las regiones clasificadas en la sección 4.

## 4. Diferencias visuales intencionales

Limitadas a las tres regiones previstas:

1. **Color/contraste** — superficie del POS en oscuro (`#FFFDF7` → `#262626`) y
   los tokens de estado. En claro sólo cambia el borde de selección del método
   de pago.
2. **Control "Más" y su overlay** — la nav pasa de 8 ítems a 4 + "Más"; ítems
   de 42 px a 44 px de alto.
3. **Modal y capas** — el diálogo se monta por portal.

**Una diferencia dentro de la región del modal que conviene señalar**: al
reemplazar el contenedor, `PantallaDeCobro` pierde `className="cp-root"` —la
raíz del catálogo— que arrastraba tipografía **Inter** a un panel que es DM
Sans. El componente no usaba ni un token de color del catálogo, así que el
único efecto es tipográfico, y resuelve la inconsistencia que el baseline había
documentado.

## 5. Deuda restante

- **`--ag-accent` como borde en `EditorDeMesa:214` y `MapaDeMesas:243`** — mismo
  patrón que se arregló en el cobro, mismo 1.8:1 en claro. Fuera del POS, no se
  tocó en este lote.
- **Los cuatro errores de consola preexistentes** (`feature_flags` 404,
  `theme_config` 404, 401 de `settings`, `permission denied for tiene_rol`)
  siguen ahí: quedaron explícitamente fuera de alcance.
- **`src/components/ui/Modal.jsx`** sigue huérfano y basado en Tailwind. No se
  tocó para no mezclar; `Dialog` es la primitiva nueva.
- **Los overlays legacy** (`.ag-page-over`, `.ag-modal-backdrop`, `Dialogs.jsx`
  con `z-index: 9999`, `CRM` con 910/911) siguen con sus números. Están
  mapeados a `--ag-z-takeover` en la documentación pero no migrados.
- **`check:install-state`** no existe en esta línea: vive en
  `ops/build-identity-fail-closed`.

## 6. Lo que este lote NO hizo

Sin rediseño visual, sin tocar fuentes Butler/Overused Grotesk, logo, texturas
ni dirección Machine Soul. Sin migraciones, DB, Supabase, RLS ni auth. Sin
cambios en lógica comercial, pedidos, caja ni inventario. Sin librerías de UI
nuevas ni dependencias. Sin tolerancias visuales. Sin deploy, merge ni
promoción.
