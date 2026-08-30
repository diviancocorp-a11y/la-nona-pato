# Phase 3 — Admin Shell: inventario y baseline

> Documento de registro. **No es un plan de implementación**: es el estado
> medido del shell Admin del edificio antes de tocarlo, con la evidencia que lo
> respalda y las correcciones que hubo que hacerle al propio diagnóstico.

**Estado: `COMPLETE — IMPLEMENTATION BLOCKED BY CORRECTNESS ISSUES`**

El baseline está cerrado y es reproducible. La implementación de Phase 3 **no
debe empezar** hasta decidir qué se hace con los defectos de corrección que
aparecieron al medir: hay pantallas ilegibles en tema oscuro, navegación
inalcanzable en mobile y un diálogo modal que no atrapa el foco ni cierra con
Escape. Rediseñar el shell encima de eso los congela con otra pintura.

---

## 0. Referencia

| Dato | Valor |
|---|---|
| Rama | `codex/dico-phase3-admin-shell` |
| HEAD medido | `f88b14395239d832419e6d2c75984f6be002a7aa` |
| Base aprobada de Phase 2B | `ea6f85e8cf3e69e8fd676c78c3ac678a5341cbbd` (ancestro; el delta es sólo `platform/HANDOFF.md`) |
| Worktree | `hermes-gastro-phase2b`, limpio antes y después |
| Schema del harness | 58 migraciones, tope `0059` (producción tiene 0060 y 0061; ninguna toca columnas ni UI) |

Artefactos: **no se copian al repo**. Viven en `.qa-lite/artifacts/`
(gitignored) del worktree que corrió las sondas.

- Baseline del gate: `.qa-lite/artifacts/2026-08-30T19-33-30-671Z/`
  (`base/screenshots/` 8 PNG, `base/dom/` 8 contratos DOM con computed styles,
  `manifest.json`, `dom-diff.json`, `scroll-trace-diff.json`)
- Inventario de motion: `.qa-lite/artifacts/2026-08-30T19-30-18-763Z-motion-inventory/`
- Sondas: `.qa-lite/artifacts/phase3-admin-shell-baseline/probes/`
  (scripts `run-probes.mjs`, `run-probes-2.mjs`, `glow-repro.mjs`,
  `tokens-static.mjs`, `lib-probe.mjs`; salidas en `probes/out/00-…` a `06-…`)

## 1. Runners

| Runner | Resultado |
|---|---|
| `npm run qa:lite:test` | **27/27 pass** (2.0 s). Incluye `admin-theme.test.mjs`, que había quedado escrito y sin ejecutar el 28/ago |
| `npx tsc --noEmit` | **exit 0** |
| `npm run qa:lite:motion-inventory -- --ref=f88b143` | exit 0 |
| `npm run qa:lite:compare -- --base=f88b143 --candidate=f88b143` | exit 0 · `domEqual: true` · **`blockingDiffPixels: 0`** · `noExternalTraffic: true` |

Same-ref por captura: las **6 superficies Admin/POS tienen SHA256 idéntico**
entre base y candidate. Las únicas con delta son `catalog--carbon` (34 px) y
`catalog--noche` (24 px), 100 % antialiasing (47) + redondeo (11), **0
bloqueantes**. El gate es determinista sobre lo que Phase 3 va a tocar.

## 2. Árbol realmente montado

Confirmado en el DOM real (`base/dom/admin--light--1440x1000.json`, 213
elementos), no deducido del código:

```
div.ag-root.ag-theme-light
├── div.ag-bg-layer            ← AdminBackdrop (único shared reutilizado)
│   ├── div.ag-bg-grid
│   ├── div.ag-bg-glow.g1
│   └── div.ag-bg-glow.g2
├── header.ag-topbar           ← JSX inline en PlatformAdmin
│   ├── div.ag-topbar-title
│   └── div.ag-topbar-right → button.ag-theme-toggle ×2 + button.ag-btn-mini
├── main                       ← dico-avisos + panel de la pestaña activa
└── nav.ag-bottom-nav          ← JSX inline en PlatformAdmin
    └── button.ag-nav-item ×8
```

### Componentes legacy NO montados

Verificado por ausencia en el DOM, no por lectura de imports:

`.ag-topbar-menu` · `.ag-pm-trigger` · `.ag-pm-panel` · `.ag-mt` ·
`.ag-drawer` · `.ag-nav-steam` · `.ag-nav-rl` · `.ag-nav-box` · `.ag-nav-bar`

`AdminTopbar`, `AdminDrawer`, `AdminProfileMenu` y `BottomNav` sólo los monta
`src/pages/Admin.jsx` (legacy). Consultan `admin_users`, tabla que el edificio
no tiene — está documentado en `PlatformAdmin.jsx:11-14`. **No se pueden
reutilizar**: cualquier plan que asuma "extraer el componente compartido" choca
contra eso.

Consecuencia para el baseline pedido: **no existe estado "drawer abierto" ni
"profile menu abierto"** que capturar en el edificio.

Además: `grep createPortal` sobre `src/` da **0 resultados en todo el repo**.
No hay capa de portales; el toast y los diálogos se renderizan inline en el
árbol de React.

## 3. Tokens `--ag-*`: 16 referenciados y nunca definidos

44 definidos, 54 referenciados. Runtime: los 16 dan **vacío en `.ag-root`, en
`html` y en `body`, en light y en dark**. Cada uno cae a su fallback inline, que
es un literal fijo. `var()` con fallback nunca falla: por eso nadie los vio.

| Token | Refs | Fallbacks | Clasificación |
|---|---|---|---|
| `--ag-surface-2` | 13 | `rgba(0,0,0,0.04)` · `rgba(0,0,0,0.03)` | alias de `--ag-bg-soft` |
| `--ag-bad` | 10 | `#c62828` | token real faltante |
| `--ag-accent` | 8 | `#e8b947` | alias de `--ag-c-terra` (**otro valor**) |
| `--ag-warn` | 8 | `#ef6c00` · `#B15A00` | token real faltante |
| `--ag-ok` | 7 | `#2e7d32` | alias de `--ag-c-green` (**otro verde**) |
| `--ag-bottom-nav-h` | 4 | `76px` | token real faltante |
| `--ag-warn-bg` | 4 | `#FFF3E0` · `#fff8e1` | token real faltante |
| `--ag-surface` | 3 | `#fffdf7` | alias de `--ag-bg-card` |
| `--ag-muted` | 3 | `#6b6b6b` | alias de `--ag-ink-2` |
| `--ag-accent-soft` | 2 | `rgba(232,185,71,0.22)` · `…0.16)` | token real faltante |
| `--ag-bad-bg` | 1 | `#ffebee` | token real faltante |
| `--ag-ok-bg` | 1 | `#e8f5e9` | token real faltante |
| `--ag-c-ok` | 1 | `#2A9D6E` | alias de `--ag-c-green` |
| `--ag-card-bg` | 1 | `rgba(127,127,127,0.06)` | alias de `--ag-bg-card` |
| `--ag-text` | 1 | `#1a1a1a` | alias de `--ag-ink` |
| `--ag-ink-4` | 1 | `rgba(0,0,0,0.12)` | legacy-only (`BrandModal`) |

Concentrados en `src/components/admin/platform/**`: las pantallas operativas del
edificio (Caja, Mesas, Cobro, Cobros online, Equipo, Personal).

`--ag-bottom-nav-h` merece mención aparte: `main` reserva
`padding-bottom: var(--ag-bottom-nav-h, 76px)` y la nav mide **60 px** reales.
16 px de aire muerto.

**`--ag-c-` fue un falso positivo** de la primera pasada: sale de un comentario
de documentación en `Finance.jsx:14` (`` `var(--ag-c-*)` ``) y la regex cortó en
el `*`. No hay ninguna interpolación dinámica `--ag-${…}` en `src/`.

### Dos sistemas de tokens sin puente

`--ag-*` (`admin-tokens.css`) y `--ds-*` (Machine Soul, `hermes-tokens.css` + el
bloque `@theme` de Tailwind v4). `admin-tokens.css` referencia `--ds-*`
**cero veces**. El shell Admin no consume nada del design system de Phase 1/2B.

## 4. POS en tema oscuro: contraste 1.24:1

El patrón "fondo con token fantasma + texto con token real" produce superficies
**ciegas al tema**. En el diálogo Cobrar:

```
section  background: var(--ag-surface, #fffdf7)  →  rgb(255,253,247) en light Y en dark
section  color:      var(--ag-ink, #1a1a1a)      →  rgb(38,38,38) light → rgb(229,229,229) dark
```

**Contraste en dark: 1.24:1.** El mínimo WCAG para texto es 4.5:1. La pantalla
de cobro —la que más se toca en el día— es ilegible en tema oscuro. Visible en
`base/screenshots/pos--dark--1440x1000.png`.

Los mismos tokens de fondo los usan `CajaPanel`, `EditorDeMesa`,
`CobrosOnline`, `MapaDeMesas`, `EquipoDelNegocio` y `PersonalPanel`: **el
defecto es de familia**. No hay contratos DOM en dark de esas pantallas para
cuantificarlo (el harness no las cubre).

Aparte de los fantasma, en `admin--dark` hay tres contrastes bajos con tokens
que **sí** existen: `.ag-cta` blanco sobre `#F59E0B` = **2.15:1**,
`.ag-nav-badge` blanco sobre `#E85A4A` = **3.50:1**, y un botón "Ver el salón"
con texto y fondo del mismo teal = **1.00:1**.

## 5. Bottom nav a 390×844: desborda y esconde tres secciones

| | Diálogo cerrado | Diálogo abierto |
|---|---|---|
| nav box | 12,772 · 366×60 | idéntico |
| clientWidth / scrollWidth | **364 / 515** | 364 / 501 |
| Desborde | **151 px** | 137 px |
| `overflow-x` | `visible` (sin scroll) | igual |
| Ítems fuera del viewport | **3** — `caja`, `mesas`, `personal` | **3** |
| Solapamientos | 0 | 0 |
| Labels recortados | 7 de 8 | 7 de 8 |

`personal` termina en x=527.9 con viewport de 390. Los ítems son
`flex-shrink: 0` con `white-space: nowrap` y la píldora no tiene scroll:
**Caja, Salón y Equipo son inalcanzables en mobile**. Con los 8 módulos de
gastro y el dueño viéndolos todos, es el caso normal, no un borde.

`env(safe-area-inset-bottom)` **no se usa en ningún lado del repo**: la píldora
tiene `padding-bottom: 8px` fijo y `bottom: 12px`. En Chromium desktop `env()`
resuelve a `0px` y no se nota; en iPhone real cae sobre el home indicator.

## 6. Diálogo Cobrar: cuatro fallas de accesibilidad

| Comprobación | Resultado |
|---|---|
| Foco inicial al abrir | **No lo toma.** Queda en `button.ag-btn-primary "Cobrar $…"`, **fuera** del diálogo (la tarjeta del fondo) |
| Focus trap | **No hay.** 14 de 22 Tabs salieron del diálogo |
| Escape | **No cierra** |
| Devolución del foco al cerrar | **No.** Cierra por ✕ y el foco queda en `body` |

Los primeros 4 Tabs con el modal abierto recorren botones del fondo
(`Completar`, `Cancelar`, otros pedidos); recién el 5º entra al diálogo; del 13
al 20 recorre la bottom nav completa.

`aria-modal="true"` está declarado pero sin portal ni `inert`/`aria-hidden`
detrás: los lectores que respetan `aria-modal` ocultan el fondo mientras el
teclado sí lo alcanza. Es peor que no declararlo.

Extras: los botones de método de pago aparecen **duplicados** en el tab order
(💵 Efectivo ×2, 💳 Tarjeta ×2) y hay un `input` **sin nombre accesible**.

Y una nota de identidad visual: `PantallaDeCobro` lleva `className="cp-root"`,
la raíz del **catálogo**, aunque no usa ni un token de color del catálogo. El
efecto real es tipográfico: los **34 elementos del diálogo renderizan en Inter**
mientras el resto del panel es DM Sans.

## 7. Focus y ARIA del panel

**Anillo de foco**: `2px solid rgb(196, 93, 62)` en todos los controles. Es
`#C45D3E`, el `--ac` del **catálogo legacy** definido en `legacy.css:4` a nivel
`:root`. La regla es `index.css:11` → `outline: 2px solid var(--ac,
var(--ds-color-focus-ring))`. Como `--ac` siempre resuelve,
**`--ds-color-focus-ring` no se aplica en ninguna superficie**: el token de foco
del design system es inalcanzable y el panel ámbar tiene foco terracota.

Excepción: el input de búsqueda da `outline: none` (`admin-shared.css:399`),
sólo cambia `border-color`. Sin indicador de foco visible.

**Orden de Tab**: topbar (2 toggles + Salir) → burbuja de Dico (4 controles) →
contenido → CTA → filas de productos. La **bottom navigation nunca aparece** en
los primeros 18 pasos: está última en el DOM, así que con teclado hay que
atravesar toda la lista de productos para navegar.

El skip link (`SkipToContent`, montado en `App.jsx:164`) **está bien puesto**,
primero en el DOM. Pero apunta a `#main-content`, que es el `<main>` de `App`, no
el del panel.

## 8. Dos `<main>` anidados

`App.jsx:168` monta `<main id="main-content">` alrededor de `<Routes>`, y
`PlatformAdmin.jsx:641` monta otro `<main>` adentro (lo mismo hace
`Admin.jsx:216`). Violación de landmark: sólo puede haber un `main` por
documento y no puede anidarse. El skip link aterriza en el wrapper externo, que
todavía contiene la topbar.

## 9. z-index: el diálogo no ocluye la nav

Pila real de `elementsFromPoint` en el centro de un ítem de nav, con el modal
abierto:

```
0. svg.ag-nav-icon
1. button.ag-nav-item
2. nav.ag-bottom-nav        z-index 5
3. button
4. section
5. div.cp-root[role=dialog] z-index 60
6. main                     ← position:relative; z-index:2
7. div.ag-root
```

Playwright confirma funcionalmente que el ítem **es clickeable** con el modal
abierto. La causa está en la pila: `<main>` tiene `z-index: 2` inline y crea
stacking context, así que el `z-index: 60` del diálogo **queda atrapado
adentro** y nunca supera al `5` de la nav, que es hermana de `main`. Con el
cobro abierto se puede cambiar de sección tocando la barra.

Hay además tres escalas de z-index sin relación entre sí: tokens `--ag-z-*`
(topbar/nav = 5, overlay = 100), el diálogo en 60, el toast en **9999**.

## 10. `meta theme-color`

`PlatformAdmin` **no lo toca**. `Admin.jsx:63-69` (legacy) sí. En el edificio el
chrome del navegador sigue `prefers-color-scheme` y el color de marca del
tenant, desacoplado del toggle del panel. El toggle guarda en
`localStorage['ag-theme']` con default `'light'` y **no lee `matchMedia`**: un
usuario con SO en oscuro abre el panel en claro.

## 11. `feature_flags` 404 en cada carga

```
404  GET  http://<supabase>/rest/v1/feature_flags?select=key,enabled
```

**`feature_flags` no existe en el edificio**: ninguna migración de
`platform/migrations/` la crea. La consulta sale de
`src/services/featureFlags.js:36`, invocada desde `main.jsx:8` en **todo
arranque, catálogo incluido**. El servicio traga el error
(`if (error || !data?.length)` → DEFAULTS), así que no rompe nada: cuesta un
round-trip fallido y un error rojo en consola en cada carga.

Es el único `console.error` de las tres superficies medidas. `pageerror`: 0.
`requestfailed`: 0. Los 3 `console.warn` son
`Service Worker registration blocked by Playwright`, artefacto del harness.

## 12. Google Fonts: tráfico externo real

Con la red **sin interceptar** (el gate del harness la mockea; esta medición
no), cada carga del panel pide a dos hosts externos:

- `fonts.googleapis.com` — **2 stylesheets distintos**: uno con Instrument Serif
  + DM Serif Display + DM Sans, otro con Inter + Source Serif 4 + JetBrains Mono
- `fonts.gstatic.com` — los `.woff2`

El panel usa DM Sans. La segunda hoja es del catálogo y se pide igual en
`/admin`. Es el mismo origen del problema tipográfico del diálogo Cobrar.

## 13. Reduced motion

**El producto respeta `prefers-reduced-motion`.** Medido en runtime en los dos
modos, y verificado invirtiendo el media por CDP sobre la misma página:

| Modo | `matchMedia(reduce)` | Animaciones activas |
|---|---|---|
| `reduce` | `true` | **0** |
| `reduce` → invertido a `no-preference` | `false` | 13 |
| `no-preference` | `false` | 14 |
| `no-preference` → invertido a `reduce` | `true` | **0** |

**Pero no lo respeta por donde parece.** La causa real es el reset global de
`index.css:45` (`*, *::before, *::after { animation-duration: 0.01ms
!important; animation-iteration-count: 1 !important; … }`). Detrás de él:

- **`dico.css:340`** — `.dico * { animation: none !important }` gana por
  `!important` a igual especificidad. **Efectivo por sí solo.**
- **`admin-bg.css:76`** — `.ag-bg-glow { animation: none }` (0,1,0) pierde
  contra `.ag-bg-glow.g1 { animation: … }` (0,2,0). Bajo `reduce` el computed
  sigue siendo `animation-name: ag-glow-drift-1`. **Es código muerto.**

Repro aislado (`probes/out/01b-glow-repro.json`), copiando el CSS literal de
`admin-bg.css` a una página estática:

| Variante | reduce | no-preference |
|---|---|---|
| CSS actual | **2 animaciones corriendo** | 2 |
| Guard reescrito como `.ag-bg-glow.g1, .ag-bg-glow.g2` | **0** | 2 |

No es un bug visible hoy. Es una trampa: si Phase 3 acota o mueve ese reset
global, los glows arrancan solos bajo `reduce` y ningún test lo detecta.

### Discrepancia del harness (abierta)

El inventario de qa-lite reporta **7 animaciones corriendo** con
`reducedMotion: 'reduce'` en `playwright.qa-lite.config.ts:28`. Con el reset
global presente eso es imposible si `reduce` llega a la página; mi sonda, mismo
build y misma página, da 0. Conclusión: **en la corrida del harness `reduce` no
está llegando al contexto** — problema del harness, no del producto. No
identifiqué el mecanismo; no hay `emulateMedia` ni override en `e2e/qa-lite/`.
Explica por qué `validateDicoMotionStack` puede exigir la pila de Dico sin
fallar. Se resuelve con una línea de `matchMedia` en un spec.

## 14. Inventario de animaciones

Idéntico en light y dark: **7 animaciones infinitas**, ni una más.

| Selector | Animación | Duración |
|---|---|---|
| `.ag-bg-glow.g1` / `.g2` | `ag-glow-drift-1` / `-2` | 38 s / 46 s |
| `.dico-piso`, `.dico-boya`, `.dico-bamboleo` | homónimas | 5.8 / 5.8 / 8.2 s |
| `.dico-ojo--izq` / `--der` | `dico-parpadeo` | 8.8 s |

Las cinco animaciones de íconos de nav de `admin-bottomnav.css`
(`ag-steam-rise`, `ag-recipes-write`, `ag-stock-hop`, `ag-stock-lid`,
`ag-sales-grow`) **no corren en el edificio**: dependen de clases que sólo emite
el `BottomNav` legacy, y dos de sus `data-section` (`recipes`, `sales`) ni
existen en el registry del edificio. **No borrarlas**: `Admin.jsx` sí monta
`BottomNav`, así que son legacy-only, no muertas.

## 15. Estilos inline

56 de 213 elementos (26 %) con `style` de producto —descontando los 10 que
inyecta el freeze del harness—. De esos, 19 declaran tipografía inline
(duplicando `.ag-h*` / `.ag-body*`) y 32 color/background.

**Cero colores hardcodeados** en los inline: todos pasan por `var(--ag-*)`. El
hardcode está en los fallbacks de la sección 3, no acá.

Tres `font-family` distintos conviven: `"DM Sans", system-ui, -apple-system,
sans-serif` (token `--ag-font`), `"DM Sans", sans-serif` (inline, fallback
distinto) e `Inter, system-ui, sans-serif` (diálogo Cobrar).

## 16. Correcciones hechas durante el diagnóstico

Cuatro conclusiones intermedias fueron erróneas y se corrigieron al medir. Se
registran para que no vuelvan a proponerse:

1. **"El diálogo Cobrar tematiza bien: 32 de 34 elementos cambian."** Falso.
   Cambia el **color de texto**; el fondo no. Contar "cambia color O
   background" como correcto tapó justamente la asimetría que produce el
   1.24:1.
2. **"El guard de reduced-motion de los glows es inefectivo, así que reduce
   está roto."** La primera mitad es cierta (probada con repro); la segunda no.
   El reset global de `index.css:45` lo cubre. El defecto es de mantenimiento,
   no de usuario.
3. **"`--ag-c-` es un token faltante."** Falso positivo: es un comentario de
   documentación en `Finance.jsx:14`. Los reales son 16, no 17.
4. **"`main` reserva 0 px en mobile (desfasaje −60)."** Artefacto de la sonda:
   `document.querySelector('main')` agarró el `<main id="main-content">` de
   `App.jsx`. El valor bueno es 76 px contra una nav de 60. El hallazgo útil
   del error fue el de los dos `<main>` anidados (sección 8).

También se descartó por medición la sospecha de que la oclusión de la sección 9
fuera un bug de la sonda: no lo era.

## 17. Cobertura del baseline

**Cubierto por el gate** (`base/screenshots/`, 8 PNG + 8 contratos DOM):
Admin Home light/dark 1440×1000 · POS desktop light/dark · POS mobile 390×844
con bottom navigation · diálogo Cobrar abierto (las tres superficies `pos--*`
son con el diálogo abierto) · tráfico externo · paridad DOM y de píxeles.

**Cubierto por las sondas**: reduced motion en ambos modos · consola completa
(`console.error`, `console.warn`, `pageerror`, `requestfailed`) · requests
externos con URL · secuencia de Tab con teclado real · foco, trap, Escape y
devolución del diálogo · geometría de la bottom nav en ambos estados · oclusión
· tokens computados en light y dark.

**No capturable**: drawer abierto y profile menu abierto — **no existen en el
edificio** (sección 2).

**No cubierto**: contratos DOM en dark de Caja, Mesas, Cobros online, Equipo y
Personal, para dimensionar cuántas pantallas comparten el 1.24:1.

## 18. Por qué la implementación queda bloqueada

Los defectos de las secciones 4, 5, 6 y 9 son de **corrección**, no de estética:

- pantalla de cobro ilegible en tema oscuro (1.24:1);
- tres secciones de navegación inalcanzables en mobile;
- modal sin trap de foco, sin Escape y sin devolución;
- la barra de navegación responde a clicks a través del modal.

Rediseñar el shell encima de esto los repinta en vez de arreglarlos, y el gate
same-ref no los va a señalar: hoy da verde con todos ellos presentes, porque
mide **estabilidad**, no corrección.

Antes de abrir Phase 3 hay que decidir explícitamente si se arreglan primero,
si se arreglan como parte del rediseño, o si se aceptan a sabiendas. Esa
decisión no es del diagnóstico.

## 19. Mejora de proceso

Las tres fallas más caras de este baseline —los 16 tokens inexistentes, el
`feature_flags` 404 y el guard inerte de `admin-bg.css`— comparten forma:
**fallan en silencio por diseño**. `var(--x, fallback)` nunca tira error,
`featureFlags` traga el suyo con un `catch` vacío, y una regla CSS perdida por
especificidad no avisa. Ningún gate del repo mira nada de eso.

En orden de rendimiento:

1. **Tokens huérfanos** — el cruce que hace `tokens-static.mjs` (~20 líneas), al
   pre-commit junto a `check-supabase-columns.mjs`. Habría atajado los 16 el día
   que se escribieron.
2. **Tablas inexistentes** — `check-supabase-columns.mjs` ya valida columnas
   contra `platform-schema.json`; `feature_flags` pasó porque
   `src/services/featureFlags.js` **no está en `PLATFORM_PATHS`**. Es agregar
   una ruta, no escribir un check.
3. **Guards de reduced-motion inertes** — una aserción: bajo `reduce`,
   `document.getAnimations()` debe dar 0 **con el reset global desactivado**.
   Prueba el guard por componente en vez de al reset que hoy lo tapa.
