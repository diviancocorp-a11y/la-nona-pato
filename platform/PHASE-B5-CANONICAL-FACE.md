# Stage B5 — One canonical Dico face

Cierre por evidencia. **No hubo refactor productivo**: la auditoría encontró la
arquitectura ya cumplida y el lote aporta los contratos que faltaban.

---

## 0. Base

| | |
|---|---|
| Rama | `feat/dico-panorama-v1` |
| HEAD al empezar | `6ca8d67` |
| Snapshot | `DICO_B4_APPROVED_6ca8d67.bundle` — 8.785.799 bytes, SHA-256 `5d12e6f4749e9987a0d945009ac5039cd6dcc8f74c3454e15c6956b8f58efd3b`, historia completa, excluido por ruta exacta en `.git/info/exclude` |

Sin push, sin deploy, sin DB/RLS/auth, sin `npm audit fix`. React Router sigue
en `7.18.3`.

## 1. Inventario A/B/C/D/E

| # | Camino | Clase | Evidencia |
|---|---|---|---|
| 1 | `CaraDeTinta.jsx` | **A · CANONICAL** | Único módulo productivo que **define** geometría facial. |
| 2 | `DicoCara.jsx` (Native) | **A** | Importa `CaraDeTinta` (L23); la usa en el camino render (L88) **y** en el fallback provisorio (L128). |
| 3 | `DicoSlot.jsx` (Physical) | **A** | Importa `CaraDeTinta` (L7) → `<svg class="dico-physical-cara">` sobre el cuerpo (L64‑68). |
| 4 | `DicoCoreEscena.jsx` | **A** | `DicoCara` → `CaraDeTinta`. Consumido por `ProductsPanel.jsx:17`. |
| 5 | `DicoAvisos.jsx` | **A** | `DicoCara` a `size={36}` (L66‑67). |
| 6 | `DicoPresence.jsx` | **A · autoridad** | No dibuja cara: compone Slot + avisos. |
| 7 | `dico.css` (31 reglas faciales) | **A · expresión** | Cero `content:`, cero `background-image:`, cero `url()`. Sólo transforma las clases que emite `CaraDeTinta`. |
| 8 | `moneda-sin-brazos.webp` | **B · BODY ONLY** | Inspeccionado: disco liso, sin rasgos. |
| 9 | `brazos.webp` | **B** | Inspeccionado: brazos y guantes sobre alfa. |
| 10 | `dico-physical-body.webp` | **B** | Inspeccionado: moneda con galera y brazos, **centro limpio**. Sin ojos, boca ni bigote. |
| 11 | `DicoEscena.jsx` + 7 `escena-*.webp` | **C · LEGACY FACE EMBEDDED** | Inspeccionados `escena-idle` y `escena-explica`: ojos, cejas, nariz, **bigote** y boca cocidos al pixel. |
| 12 | `moneda.webp`, `moneda-retro-galera.webp`, `moneda-render-crudo.jpg` | **D · ARCHIVE** | Inspeccionados: cuerpos **sin cara**. Ningún import los alcanza. |
| 13 | `tools/vitrina/` | **D · ARCHIVE** | Vite config propio (`npm run vitrina`). Consumidor legítimo de `DicoEscena`. |
| 14 | `DicoOportunidades.jsx` | — | No renderiza personaje: sólo tarjetas. |
| 15 | `import.meta.glob` | **A** | Sólo 2 en todo el grafo productivo, ambos con **nombre exacto**. Ninguno alcanza `escena-*`. |

**E · UNKNOWN: ninguno.**

### Evidencia de build (documentada, no convertida en test)

`NODE_ENV= CLIENT=hermes-cochi vite build` emite **exactamente 3** assets Dico:
`brazos`, `dico-physical-body`, `moneda-sin-brazos`. Cero `escena-*.webp`, cero
`moneda.webp`, cero `moneda-retro-galera`, cero `moneda-render-crudo`.

No se convirtió en contrato: los nombres hasheados de `dist/` hacen un test
frágil, y el gate de imports y globs (§3) garantiza lo mismo desde el source.

## 2. Por qué no hubo refactor

El Definition of Done ya estaba cumplido antes de tocar nada: una sola fuente
facial, Native la usa, Physical la usa, el cuerpo Physical está limpio, los
globs son exactos y ninguna superficie in‑app activa toca la cara vieja.

Lo que faltaba era **garantía**. Nada impedía:

1. que un panel hiciera `import DicoEscena` —vive en el mismo directorio que
   las canónicas— y devolviera la cara vieja a la app;
2. que el glob se ensanchara a `poses/*.webp` y arrastrara los siete renders
   narrativos al bundle en silencio;
3. que alguien bifurcara la cara de Physical sin que ningún gate chillara.

`DicoEscena.jsx` y los `escena-*.webp` **no se movieron ni se borraron**: son
legacy legítimo de vitrina y archivo.

## 3. Contratos agregados

`src/test/dicoCaraCanonica.test.jsx` — **12 tests estructurales**.

### Qué significa «superficie productiva»

No «un archivo cuya ruta no empieza con `src/test`». Eso sería una lista de
exclusiones que envejece mal. El gate **camina el grafo de imports real desde
`src/main.jsx`**, el mismo punto de entrada que usa `index.html`: productivo es
lo que el bundle puede alcanzar. El walker resuelve imports estáticos y
dinámicos, `export … from`, `@import` y `url()` de CSS, los alias del build, y
**expande los `import.meta.glob` contra el disco igual que hace Vite**.

Los tests, `tools/vitrina` y la documentación quedan afuera **solos**, sin
nombrarlos: nadie los importa desde la app. La vitrina puede seguir importando
`DicoEscena` —lo hace dos veces— y la suite queda verde.

### Qué significa «paridad»

**No** que Native y Physical tengan el mismo tamaño, offset, escala o encuadre:
los cuerpos son distintos y sus transformaciones también. Significa que la
geometría facial sale de `CaraDeTinta`. Por eso la firma que se compara son
atributos internos del viewBox —paths y radios—, independientes de a qué tamaño
se pinte cada modalidad, y por eso **se compara contra el componente renderizado
solo**, no una modalidad contra la otra: si las dos se bifurcaran a la vez,
compararlas entre sí no lo notaría.

| Contrato | Qué impide |
|---|---|
| El grafo parte de un walker real (canario: >100 módulos) | Que los contratos pasen por vacío. |
| El grafo no alcanza `DicoEscena` ni sus renders | Que una superficie productiva consuma la cara vieja. |
| El grafo alcanza **exactamente** los 3 cuerpos sin cara | Que entre un asset con cara por cualquier vía. |
| Globs productivos con nombre exacto | `poses/*.webp`. |
| `poses/` completamente clasificado | Un asset nuevo sin decisión. |
| Geometría facial en un solo módulo productivo | Una segunda anatomía. |
| Ningún rasgo dibujado desde CSS | Que cambiar `CaraDeTinta` deje de alcanzar. |
| Native rinde la anatomía **de `CaraDeTinta`** | Una cara propia en Native. |
| Physical rinde la misma, sobre el cuerpo limpio | Una cara propia en Physical, o un body con rasgos. |
| El fallback provisorio también es canónico | Que borrar un `.webp` saque otra cara. |
| Una expresión nueva alcanza a las dos modalidades | La bifurcación silenciosa. |

### Los contratos se verificaron rompiéndolos

| Mutación | Resultado |
|---|---|
| `ProductsPanel` importa `DicoEscena` | 2 fallan |
| Glob ensanchado a `./poses/*.{png,webp,avif}` | 3 fallan |
| Asset nuevo sin clasificar en `poses/` | 1 falla |
| Segunda anatomía (`dico-esclera` en otro módulo) | 1 falla |
| Rasgo con `background-image` en `dico.css` | 1 falla |
| Physical bifurca su propia cara | 3 fallan |
| CSS productivo con `url(./poses/escena-idle.webp)` | 2 fallan |
| **Control: la vitrina importa `DicoEscena`** | **12/12 verde** |
| Control: sin mutaciones | 12/12 verde |

El control de la vitrina es el que importa: prueba que la exclusión es semántica
y no una lista de rutas. Todas las mutaciones se revirtieron.

### Un bug que el propio contrato destapó

El expansor de globs escapaba los paréntesis que él mismo generaba al convertir
`{png,webp,avif}` en un grupo. El regex no matcheaba nunca nada, así que la
pregunta «¿este glob alcanza un asset legacy?» respondía que no **por vacío**.
Lo detectó el contrato que pregunta al revés —«¿qué alcanza?»— al fallar
esperando tres cuerpos y encontrar uno. Escapado primero, expansión después.

## 4. Medición en navegador

Probe con los componentes reales (`.qa-lite/artifacts/phase-b5-cara-canonica/`),
envuelto en el mismo `.ag-slot > .ag-dico-stack` que usa `PlatformAdmin`. Los
tres estados se alcanzan con los mismos clicks que haría una persona. Playwright
con viewport declarado, en 1440×900 y 390×844.

### Las cuatro preguntas del brief

| | Desktop | Mobile |
|---|---|---|
| **¿`CaraDeTinta` está centrada?** | sí — desvío **0,02 px** | sí — **0,02 px** |
| **¿Se recorta la cara?** | **no** — queda 44,4 px por dentro del borde | **no** — 44,4 px |
| **¿Se separa del cuerpo al abrir/cerrar?** | **no** — rango del offset relativo **0,0000** abriendo, **0,0039** cerrando | idéntico |
| **¿Aparece cara vieja?** | no | no |

La escala relativa cara/cuerpo varía **0,0001** durante el cierre: el overlay
viaja rígidamente pegado al cuerpo. Durante el giro de perfil la cara está en
opacidad 0 y sólo aparece cuando el cuerpo ya está de frente, que es el
comportamiento diseñado.

**Sí hay un recorte, y no es de la cara**: `.dico-physical` empieza **9 px por
encima** del borde superior de `.ag-slot`, que tiene `overflow: hidden`. Se
recorta esa franja — la punta de la galera. Es una interacción entre el
`overflow: hidden` de `.ag-slot` (Phase 3B) y el `.dico-slot-stage` que
sobresale 161 px hacia arriba (Phase 9/B2); ningún test de los dos lotes la
cubre. Va al backlog, no a B5.

### La discrepancia de escala: es real, no del probe

La duda era si la diferencia venía del encuadre sintético del probe. Se midió la
misma relación a **dos tamaños de pintado** de Native: el real de la app
(`size={36}`, el que usa `DicoAvisos`) y la ampliación del probe (220 px).

| Medida (normalizada a la moneda de su cuerpo) | Native @36 (app) | Native @220 (probe) | Physical |
|---|---|---|---|
| Separación entre ojos (% ancho) | 23,22 % | 23,33 % | **10,21 %** |
| Alto del ojo (% alto) | 29,76 % | 29,81 % | **16,85 %** |
| Desvío vertical del eje | −5,63 % | −5,68 % | **−10,68 %** |
| Desvío horizontal | 0,15 % | 0,06 % | 0,04 % |

Native da **lo mismo a 36 px que a 220 px** (±0,11 %): la medida es invariante a
la escala de pintado y el probe no introduce distorsión. **La diferencia contra
Physical es real.**

Causa: `.dico-physical-cara` se posiciona en porcentajes del **marco entero**
(`left: 25.5%; top: 29%; width: 49%`), y en el cuerpo Physical la galera empuja
la moneda hacia abajo y la achata (moneda 87,96 % de ancho × 63,96 % de alto,
contra 78,38 × 73,75 en Native).

**No se corrigió.** En la aplicación real la cara está centrada, no se recorta,
no se separa del cuerpo y no aparece cara vieja: se cumple exactamente la
condición del brief para **no tocar placement fino en B5**. La diferencia de
escala y altura es estética y queda **registrada para B6/backlog**.

Red externa nueva: **cero**, en los dos viewports.

### Un falso positivo que casi se reporta

La primera medición del recorte se hizo desde la consola del panel del
navegador, donde `window.innerHeight` valía **0**. Con eso `max-height: 40vh`
computa `0px`, `.ag-slot` mide 0 de alto y *todo* Physical parece recortado. El
número decía «defecto grave» y no había ninguno. Toda medición que dependa de
unidades de viewport va con Playwright y viewport declarado.

## 5. Evidencia visual

`.qa-lite/artifacts/phase-b5-cara-canonica/capturas/` — desktop 1440×900 y
mobile 390×844: `native-idle`, `native-notice`, `physical-open`, más la
comparación de anatomía en claro y oscuro. Plancha en `plancha.html`.

Responden sólo lo que el brief pide: la anatomía es la canónica, no hay ningún
render facial legacy, el overlay Physical está unido al cuerpo, la cara no se
recorta y B1–B4 siguen intactos (Native desaparece con Physical abierto — de
hecho la primera medición de Native devolvió `null` justamente por eso).

No se intentó igualar píxeles Native vs Physical.

## 6. Regresión

| Gate | Resultado |
|---|---|
| Tests dirigidos B5 | 1 archivo / **12** PASS |
| Tests dirigidos Dico | 9 archivos / **89** PASS |
| Suite completa | 78 archivos / **1.056** PASS |
| `check:integrity` | OK |
| `typecheck` | exit 0 |
| `check:install-state` | OK — 459 paquetes |
| `qa:lite:test` | 27 pass / 0 fail |
| Build identificado | OK |
| `git diff --check` | limpio |
| **QA Lite same-ref** (`6ca8d67` ↔ `6ca8d67`) | **DOM igual · pixels bloqueantes 0 · red externa 0 · scroll trace IDENTICAL** |

Suite antes de B5: 77 archivos / 1.044. Después: 78 / 1.056 — el archivo de
contratos y sus 12 tests, nada más.

## 7. Lo que queda archivado

Ningún asset se borró ni se movió. Siguen en `poses/`, clasificados y fuera del
grafo productivo: los 7 `escena-*.webp` con la cara vieja y los 3 cuerpos fuente
sin cara. `DicoEscena.jsx` se conserva con su consumidor legítimo, la vitrina,
que lo importa dos veces sin romper ningún gate.

El cleanup masivo pertenece a Phase 10, como dice el plan.

## 8. Estado

**B5 = CLOSED.** No se avanza a B6.

### Backlog que sale de este lote

1. **Escala y altura de la cara en Physical** (B6 o lote de Physical): ojos a
   10,21 % del ancho de la moneda contra 23,24 % en Native; eje al doble de
   altura. Es acabado facial, no fuente de verdad.
2. **9 px de galera recortados** por `overflow: hidden` de `.ag-slot` contra el
   desborde superior de `.dico-slot-stage`. Cruce Phase 3B ↔ Phase 9.
