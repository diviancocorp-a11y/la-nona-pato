# Stage B5 — One canonical Dico face

Cierre por evidencia. **No hubo refactor**: la auditoría encontró la
arquitectura ya cumplida y el lote aporta los contratos que faltaban.

---

## 0. Base

| | |
|---|---|
| Rama | `feat/dico-panorama-v1` |
| HEAD al empezar | `6ca8d67` |
| Snapshot | `DICO_B4_APPROVED_6ca8d67.bundle` — 8.785.799 bytes, SHA-256 `5d12e6f4749e9987a0d945009ac5039cd6dcc8f74c3454e15c6956b8f58efd3b`, historia completa, excluido por ruta exacta en `.git/info/exclude` |

Sin push, sin deploy, sin DB/RLS/auth, sin `npm audit fix`. React Router
sigue en `7.18.3`.

## 1. Inventario A/B/C/D/E

| # | Camino | Clase | Evidencia |
|---|---|---|---|
| 1 | `CaraDeTinta.jsx` | **A · CANONICAL** | Único módulo del repo que **define** geometría facial (`grep dico-esclera` → 1 sola definición en `src/`). |
| 2 | `DicoCara.jsx` (Native) | **A** | Importa `CaraDeTinta` (L23) y la usa en el camino render (L88) **y** en el fallback provisorio (L128). |
| 3 | `DicoSlot.jsx` (Physical) | **A** | Importa `CaraDeTinta` (L7) → `<svg class="dico-physical-cara">` sobre el cuerpo (L64‑68). |
| 4 | `DicoCoreEscena.jsx` | **A** | `DicoCara` → `CaraDeTinta`. Consumido por `ProductsPanel.jsx:17`. |
| 5 | `DicoAvisos.jsx` | **A** | `DicoCara` (L10, render L66). |
| 6 | `DicoPresence.jsx` | **A · autoridad** | No dibuja cara: compone Slot + avisos. |
| 7 | `dico.css` (31 reglas faciales) | **A · expresión** | Cero `content:`, cero `background-image:`, cero `url()`. Sólo transforma las clases que emite `CaraDeTinta`. |
| 8 | `moneda-sin-brazos.webp` | **B · BODY ONLY** | Inspeccionado: disco liso, sin rasgos. |
| 9 | `brazos.webp` | **B** | Inspeccionado: brazos y guantes sobre alfa. |
| 10 | `dico-physical-body.webp` | **B** | Inspeccionado: moneda con galera y brazos, **centro limpio**. Sin ojos, boca ni bigote. |
| 11 | `DicoEscena.jsx` + 7 `escena-*.webp` | **C · LEGACY FACE EMBEDDED** | Inspeccionados `escena-idle` y `escena-explica`: ojos, cejas, nariz, **bigote** y boca cocidos al pixel. |
| 12 | `moneda.webp`, `moneda-retro-galera.webp`, `moneda-render-crudo.jpg` | **D · ARCHIVE** | Inspeccionados: cuerpos **sin cara**. Ningún import los alcanza. |
| 13 | `tools/vitrina/` | **D · ARCHIVE** | Vite config propio (`npm run vitrina`). Consumidor legítimo de `DicoEscena`. |
| 14 | `DicoOportunidades.jsx` | — | No renderiza personaje: sólo tarjetas. |
| 15 | `import.meta.glob` | **A** | Sólo 2 en todo `src/`, ambos con **nombre exacto**. Ninguno puede alcanzar `escena-*`. |

**E · UNKNOWN: ninguno.**

### Prueba de bundle
`NODE_ENV= CLIENT=hermes-cochi vite build` emite **exactamente 3** assets Dico:
`brazos`, `dico-physical-body`, `moneda-sin-brazos`. Cero `escena-*.webp`, cero
`moneda.webp`, cero `moneda-retro-galera`, cero `moneda-render-crudo`.

## 2. Por qué no hubo refactor

El Definition of Done ya estaba cumplido antes de tocar nada: una sola fuente
facial, Native la usa, Physical la usa, el cuerpo Physical está limpio, los
globs son exactos y ninguna superficie in‑app activa toca la cara vieja.

Lo que faltaba era **garantía**, no código. Nada impedía:

1. que un panel hiciera `import DicoEscena` —vive en el mismo directorio que
   las canónicas— y devolviera la cara vieja a la app;
2. que el glob se ensanchara a `poses/*.webp` y arrastrara los siete renders
   narrativos al bundle en silencio;
3. que alguien bifurcara la cara de Physical sin que ningún gate chillara.

## 3. Contratos agregados

`src/test/dicoCaraCanonica.test.jsx` — 10 tests, **estructurales**: leen el
grafo de imports, expanden los globs de verdad y comparan la geometría que las
dos modalidades terminan pintando. No comparan archivos como strings.

| Contrato | Qué impide |
|---|---|
| `poses/` completamente clasificado | Un asset nuevo entra sin que nadie decida si tiene cara vieja. |
| Globs con nombre exacto y fuera de la cara legacy | `poses/*.webp`. |
| Ninguna superficie de la app importa la cara legacy | `import DicoEscena` desde un panel. |
| Geometría facial en un solo módulo | Una segunda anatomía. |
| Ningún rasgo dibujado desde CSS | Que cambiar `CaraDeTinta` deje de alcanzar. |
| Native monta `CaraDeTinta` sobre el cuerpo | Volver a una cara embebida en Native. |
| Physical monta la misma sobre el cuerpo 3D limpio | Reemplazar el body por uno con rasgos. |
| **Misma anatomía pintada en las dos** | La bifurcación silenciosa. |
| El fallback provisorio también es canónico | Que borrar un `.webp` saque una cara distinta. |
| La vitrina compila aparte | Que el showcase se vuelva superficie de app. |

### Los contratos se verificaron rompiéndolos

Verde de entrada no prueba nada, así que se mutó cada uno y se comprobó que
falla:

| Mutación | Resultado |
|---|---|
| Asset nuevo sin clasificar en `poses/` | 1 falla |
| Glob ensanchado a `./poses/*.{png,webp,avif}` | 1 falla |
| `ProductsPanel` importa `DicoEscena` | 1 falla |
| Segunda anatomía (`dico-esclera` en otro módulo) | 1 falla |
| Rasgo con `background-image` en `dico.css` | 1 falla |
| Physical bifurca su propia cara | **3 fallan** |
| Sin mutaciones | 10/10 verde |

Todas las mutaciones se revirtieron; el worktree quedó limpio.

## 4. Medición en navegador

Probe con los componentes reales (`.qa-lite/artifacts/phase-b5-cara-canonica/`),
envuelto en el mismo `.ag-slot > .ag-dico-stack` que usa `PlatformAdmin`. Los
tres estados se alcanzan con los mismos clicks que haría una persona.

**Firma facial idéntica**: los **65 elementos** de la anatomía —tag, clase y
path— coinciden exactamente entre Native y Physical. Es la prueba en runtime de
que la fuente es una sola.

Red externa nueva: **cero**.

### Discrepancia visual entre Native y Physical

La anatomía es la misma; su **escala y altura relativas al cuerpo no lo son**.

| Medida | Native | Physical | Diferencia |
|---|---|---|---|
| Separación entre ojos (% ancho de moneda) | 23,24 % | 10,21 % | Physical **2,28× más chica** |
| Alto del ojo (% alto de moneda) | 29,77 % | 16,85 % | Physical **1,77× más chica** |
| Desvío vertical del eje de ojos | −5,65 % | −10,68 % | Physical **el doble de alto** |
| Desvío horizontal | 0,02 % | 0,04 % | ambos centrados |

La causa es geométrica: `.dico-physical-cara` se posiciona en porcentajes del
**marco entero** (`left: 25.5%; top: 29%; width: 49%`), y en el cuerpo Physical
la galera empuja la moneda hacia abajo y la achata (moneda 87,96 % de ancho ×
63,96 % de alto, contra 78,38 × 73,75 en Native).

**No se corrigió en este lote.** B5 es *source of truth*, no acabado facial, y
el brief reserva tamaño, posición y placement fino. Pertenece al lote de
Physical o a B6.

### Recorte del sombrero

Con Physical abierto, `.dico-physical` empieza **6,1 px por encima** del borde
superior de `.ag-slot`, que tiene `overflow: hidden`. Se recorta esa franja: la
punta de la galera.

Es una interacción entre dos lotes: el `overflow: hidden` de `.ag-slot`
(Phase 3B) y el `.dico-slot-stage` que sobresale 161 px hacia arriba del slot
(Phase 9/B2). Ningún test de los dos lo cubre.

**La cara no se recorta**: su borde superior queda 47,3 px por debajo del borde
del slot. Medido en la reproducción fiel del envoltorio, no en el panel
autenticado.

### Un falso positivo que casi se reporta

La primera medición del recorte se hizo desde la consola del panel del
navegador, donde `window.innerHeight` valía **0**. Con eso `max-height: 40vh`
computa `0px`, `.ag-slot` mide 0 de alto y todo Physical parece recortado. El
número decía "defecto grave" y no había ninguno. La medición válida es la de
Playwright con viewport declarado.

## 5. Regresión

| Gate | Resultado |
|---|---|
| Tests dirigidos Dico | 9 archivos / **87** PASS |
| Suite completa | 78 archivos / **1.054** PASS |
| `check:integrity` | OK |
| `typecheck` | exit 0 |
| `check:install-state` | OK — 459 paquetes |
| `qa:lite:test` | 27 pass / 0 fail |
| `vite build` | OK |
| `git diff --check` | limpio |
| **QA Lite same-ref** (`6ca8d67` ↔ `6ca8d67`) | **DOM igual · pixels bloqueantes 0 · red externa 0 · scroll trace IDENTICAL** |

Suite antes de B5: 77 archivos / 1.044. Después: 78 / 1.054 — el archivo de
contratos y sus 10 tests, nada más.

## 6. Lo que queda archivado

Ningún asset se borró. Siguen en `poses/`, clasificados y sin consumidor
in‑app: los 7 `escena-*.webp` con la cara vieja y los 3 cuerpos fuente sin cara.
`DicoEscena.jsx` se conserva con su consumidor legítimo, la vitrina.

El cleanup masivo pertenece a Phase 10, como dice el plan.

## 7. Estado

**B5 CLOSED por evidencia.** No se avanza a B6.
