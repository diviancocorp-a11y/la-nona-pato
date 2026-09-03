# Phase 4 — Golden Screen (Productos) · RESULTADOS

Fecha: 2026-09-03 · Rama: `feat/dico-panorama-v1`
Estado: **PENDIENTE DE APROBACIÓN VISUAL** — no cerrada.

El gate de esta fase es la aprobación de Ricky. Este documento reúne lo que
esa decisión necesita: qué cambió, medido en Chromium real antes y después, en
las mismas diez superficies. **No declara `CLOSED`.**

Brief: `platform/PHASE-4-GOLDEN-SCREEN-BRIEF.md`

---

## 1. Evidencia

Diez superficies, dos lotes con el mismo código de captura:

```
.qa-lite/artifacts/phase4-golden/antes/     productos-<tema>--<ancho>.png + medicion.json
.qa-lite/artifacts/phase4-golden/despues/   idem
```

`light`/`dark` × `1440x1000`, `1024x768`, `769x1000`, `768x1000`, `390x844`.
Se reproduce con:

```
npm run qa:lite:setup
node scripts/qa-lite/capturar-phase4.mjs --lote=antes
node scripts/qa-lite/capturar-phase4.mjs --lote=despues
```

## 2. Antes → después, por superficie

| Superficie | Contraste que falla | Targets < 44px | Desborde |
|---|---|---|---|
| light 1440x1000 | 3 → **0** | 13 → **0** | 0 → 0 |
| light 1024x768 | 3 → **0** | 13 → **0** | 0 → 0 |
| light 769x1000 | 3 → **0** | 13 → **0** | 0 → 0 |
| light 768x1000 | 3 → **0** | 13 → **0** | 0 → 0 |
| light 390x844 | 3 → **0** | 13 → **0** | 0 → 0 |
| dark 1440x1000 | 3 → **0** | 13 → **0** | 0 → 0 |
| dark 1024x768 | 3 → **0** | 13 → **0** | 0 → 0 |
| dark 769x1000 | 3 → **0** | 13 → **0** | 0 → 0 |
| dark 768x1000 | 3 → **0** | 13 → **0** | 0 → 0 |
| dark 390x844 | 3 → **0** | 13 → **0** | 0 → 0 |

Ámbito: `.ag-pantalla-productos`. La deuda del shell y de Dico queda medida y
reportada en el mismo JSON, fuera del gate (sección 6).

## 3. Los seis puntos

**3.1 — Contraste del margen (punto 1 y 2 del brief).** Ya cerrado en
`e2678d2`, antes de este lote. `--ag-c-sales` daba 3,42:1 y `--ag-c-orders`
3,50:1 sobre la tarjeta blanca, con texto de 13px. Se agregaron los tokens de
tinta `--ag-c-sales-ink` (5,20:1) y `--ag-c-orders-ink` (5,08:1), oscurecidos
en claro hasta igualar el contraste que el sólido ya tenía en oscuro. Los dos
`var(--token, #hex)` salieron.

**3.2 — Tipografía (punto 3).** El hallazgo que no estaba en el brief y era el
peor: la pantalla mostraba **«Productos» dos veces**, una arriba de la otra, en
dos tipografías — Butler en el título de sección del shell, DM Sans clavado a
mano en el `<h2>` del panel. Se eliminó el `<h2>`; el shell ya pone ese título
con la misma terminología por rubro. Con eso desapareció el único lugar de la
pantalla que forzaba una familia tipográfica. El resto pasa a usar las clases
que `admin-tokens.css` ya traía y que la pantalla ignoraba (`.ag-body`,
`.ag-meta`).

**3.3 — Espaciado (punto 4).** No existía escala: había radios, sombras,
tiempos y capas, pero el espaciado se escribía a ojo (6, 8, 9, 11, 12, 13, 14,
16, 18, 20px). Se declararon `--ag-sp-1..6` en base 4, **solo los pasos que
esta pantalla demostró necesitar**. Un test falla si vuelve a aparecer un px
suelto de espaciado en el CSS de la pantalla.

**3.4 — Targets (punto 5).** Eliminar 28×28 → **44×44**; Ocultar 30 → **44**;
el buscador 19,5 → **44**. El botón más chico de la fila era el que borra un
producto para siempre, y estaba pegado al de al lado. Además `:hover` propio en
el destructivo, que ahora se tiñe con `--ag-c-orders-ink`.

**3.5 — Tildes (punto 6).** «catalogo» → «catálogo» en los tres textos de
interfaz, y «Sin categoria» → «Sin categoría». La regla del repo es
*comentarios* sin tildes, por encoding; no la interfaz — y el mismo componente
ya acentuaba en otras frases.

**3.6 — Presentación a CSS (punto 7).** ~40 objetos `style={{}}` pasaron a
clases con tokens en `src/styles/admin-productos.css`. De un objeto literal
repetido seis veces con variaciones no se extrae un primitive, que es
exactamente lo que Phase 5 necesita del material que deja esta fase.

## 4. Un cambio de alineación que no estaba en la lista

La fila medía **1290px** a 1440: el nombre pegado a la izquierda y las acciones
a 1200px de distancia, con un vacío en el medio que obligaba a cruzar la
pantalla con la vista para relacionar un producto con su botón de borrar. Se le
puso ancho de lectura (860px).

**El primer intento lo centró y fue una regresión**: centrado, el bloque dejaba
de compartir eje con el título de sección del shell —que está a la izquierda— y
la pantalla quedaba con dos ejes distintos, peor que el problema original. Se
corrigió a alineación izquierda con el mismo padding de 18px que usa
`.ag-section-head`. Está en la captura del par light 1440.

## 5. Resultados G1–G6

| # | Contrato | Resultado |
|---|---|---|
| G1 | Todo texto de la pantalla ≥ 4,5:1 en ambos temas | **VERDE** — 0/10 superficies con fallos (3 por superficie antes) |
| G2 | Ningún `var(--token, #hex)` en la pantalla | **VERDE** — 0, verificado en el componente y en su CSS |
| G3 | Acciones destructivas ≥ 44px | **VERDE, y por encima de lo escrito** — el contrato pedía las destructivas; quedaron en 44 *todos* los targets de la pantalla |
| G4 | Desborde 0 en 6/6 tema × viewport | **VERDE** — 0 en 10/10 (se midieron cinco anchos, no tres) |
| G5 | Suite verde sin bajar el total | **VERDE** — 1184/1184 (era 1172 al abrir la fase; +12) |
| G6 | QA Lite same-ref | **VERDE** — DOM igual, píxeles bloqueantes 0, red externa 0, scroll trace idéntico (`e55c198` contra sí mismo) |

Build y typecheck: verdes. Artefactos del same-ref:
`.qa-lite/artifacts/2026-09-03T19-41-15-640Z/`.

G6 salió verde a la primera, sin reintentos: el nondeterminismo que arrastraba
esta rama (line-height fraccionario, el `setInterval` del título del catálogo y
un `margin:auto` inestable, B6R.QA1) sigue resuelto y este lote no lo reabrió
—aunque agregó su propio `margin-inline: auto` y después lo sacó, por otra
razón: ver la sección 4.

## 6. Lo que se midió y queda FUERA del gate

Deuda real, en la pantalla o cerca, que Phase 4 **no** toca porque pertenece a
fases ya cerradas con su propio gate. Se deja escrita para que exista, no
enterrada:

- **«Ver el salón» a 3,17:1** (claro) y 3,54:1 (oscuro) — `--ag-c-prep` como
  texto de 11px en negrita. Es de `DicoOportunidades` (Phase 8/9) y ya estaba
  declarada en 3B §8. Es el mismo defecto de familia que Phase 4 arregló para
  sales/orders: **el patrón de tokens `-ink` que se creó acá es la solución que
  le corresponde**, cuando se abra la fase que la cubra.
- **Topbar**: «Cambiar a oscuro» y «Configuración» a 36×36, «Salir» a 44,4×34.
- **«Cerrar oportunidades»** a 22×22.
- El contador del aviso de oportunidades a 4,24:1.

## 7. Regresiones encontradas

Una, durante el propio trabajo, corregida antes de capturar el lote final: el
centrado descrito en la sección 4. No quedan regresiones abiertas.

## 8. Nota sobre el instrumento de medición

El primer baseline reportó cinco defectos de los cuales **tres no existían**.
Los tres eran del medidor, no de la pantalla:

1. **Fondo semitransparente tratado como opaco.** `--ag-bg-soft` es
   `rgba(9,9,11,.04)` en claro y `rgba(255,255,255,.05)` en oscuro, así que el
   botón «Ocultar» del tema claro se medía contra negro puro: 2,57:1, y del
   signo contrario al real. Ahora se componen las capas hasta la primera opaca.
2. **`opacity` ignorada.** No entra en el `color` computado, pero el ojo la ve.
   Este arreglo destapó un defecto **verdadero**: el contador de categoría con
   `opacity: .6` sobre `--ag-ink-3` daba 2,27:1 en claro y 3,4:1 en oscuro.
3. **`.ag-sr-only` contado como visible.** Mide 1×1 con `clip-path: inset(50%)`
   y daba «texto negro sobre fondo negro, 1:1».

Vale anotarlo porque es la misma lección del gate A3: **una medición que falla
del lado optimista no se nota**. Las tres correcciones están en el spec, con el
número que producían antes.

## 9. Pendiente

- **Aprobación visual humana.** Es el gate.
- Si se aprueba: renombrar la fase a **Golden Screen — Productos** en
  `DICO-IMPLEMENTATION-STATUS.md` (la matriz dice «Admin Home», que nombra una
  pantalla que no existe) y pasarla a `CLOSED`.
- **Phase 5 sigue bloqueada** hasta esa aprobación. No se extrajo ni un
  primitive.
- Hardening de QA posterior (no bloquea Phase 4): migrar el bloque de contraste
  de `adminCorrectness.test.jsx` a parser de CSS. Hoy copia los hexes adentro
  del test y puede quedar verde midiendo un color que ya no existe.
