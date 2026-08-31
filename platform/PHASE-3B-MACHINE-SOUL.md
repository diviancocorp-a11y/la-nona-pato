# Phase 3B — Admin Shell Machine Soul (candidata de revisión)

Aplicación del sistema visual Machine Soul al shell administrativo, sobre la
base correcta de Phase 3A.

**Es una candidata visual para revisión. No autoriza merge ni producción.**

---

## 0. Base y autoridad

| | |
|---|---|
| SHA base | `7ef8ec6a0a2252e4997c07fc5f8a529058c9364e` (`fix/phase3-admin-correctness`) |
| Rama | `feat/phase3-admin-shell-machine-soul` |
| Worktree | `hermes-gastro-phase3-machine-soul` |

Verificado ausente: Dico `0304f28` y build identity `475b4d2`. Verificadas
presentes: las seis correcciones de Phase 3A.

**Autoridad consultada, en orden:**

1. `platform/DICO-BRAND-TYPOGRAPHY.md` (30/ago) — la dupla vigente:
   *"La máquina habla en Overused Grotesk. El alma habla en Butler."*
   Butler Free reemplaza a Canela; Overused Grotesk reemplaza a Söhne.
2. `platform/DICO-PHASE-2B-THEME-OWNERSHIP.md` — el límite `.ag-root` para el
   owner `admin`, y la nota de que *"Admin y catálogo conservan por ahora sus
   adaptadores tipográficos"*: es exactamente lo que este lote cambia.
3. `platform/PHASE-3A-CORRECTNESS.md` — los contratos que no se pueden perder.
4. `platform/DICO-DESIGN-SYSTEM-V0.1.md` — escalas de spacing, densidad y radio.

**Divergencia declarada**: v0.1 proponía una escala neutra **cálida**
(`#FAF5EE` … `#1A1612`), pero la marcaba como *"propuesta, se valida por
contraste en el piloto antes de declararla estable"*. El brief de Phase 3B fija
**Zinc/Carbon**, que además es lo que el panel ya usaba de hecho. Se siguió el
brief.

**Logo**: `public/brand/` sólo contiene assets **Hermes**, no Dico. No se
reconstruyó ni se generó ninguno. El shell no muestra logo: la topbar muestra
el nombre del negocio.

## 1. Tipografía

Las tres caras ya estaban autoalojadas en `public/fonts/dico` con
`font-display: swap`. El cambio es de asignación, no de infraestructura.

| Zona | Familia computada | Peso |
|---|---|---|
| Shell root | **Overused Grotesk** | 400 |
| Título de topbar | Overused Grotesk | 600 |
| **Título de sección** | **Butler** | 500 |
| Label de navegación | Overused Grotesk | 600 |
| Botón primario | Overused Grotesk | 500 |
| Input | Overused Grotesk | 400 |
| Botón «Más» | Overused Grotesk | 600 |
| **Familias prohibidas en el marco** | **0** | — |

`document.fonts.status: loaded` en las 16 superficies. Butler no entra en
tablas, datos densos ni controles: hay un test que lo fija.

**Deuda medida**: quedan **30 `font-family: 'DM Sans'` inline en 18 componentes
de módulo** (`CRM`, `Finance`, `Stock`, `OrdersPanel`, `ProductsPanel`,
`Settings`…). Eso es interior de pantalla, no shell, y el brief pide detenerse
ahí. Se corrigieron los 3 que estaban en `admin-shared.css`, que sí es shell.

**Red externa**: el documento sigue pidiendo `fonts.googleapis.com` y
`fonts.gstatic.com`. Vienen del `<link preload>` de `index.html`, que carga
Instrument Serif, DM Serif Display y DM Sans **para el catálogo**. El shell no
los usa —todas sus familias computadas son locales— pero la request existe en
`/admin`. Quitarlos toca el catálogo: queda anotado, no resuelto.

## 2. Color

Escala Zinc/Carbon completa (50→950), oro de acción, semánticos propios y
Blue/Volt reservado para actividad técnica.

| Rol | Claro | Oscuro |
|---|---|---|
| Fondo | Zinc 50 | Zinc 950 |
| Superficie | White | Zinc 900 |
| Chasis (topbar, nav) | Zinc 950 | Zinc 950 |
| Bordes | Zinc 200 / 300 | Zinc 800 / 700 |
| Tinta | Zinc 950 · 600 · 500 | Zinc 100 · 300 · 400 |

**Las dos deudas obligatorias, cerradas con los tokens nuevos:**

| | Antes | Después |
|---|---|---|
| `--ag-ink-3` claro | `#9CA3AF` → **2.50:1** | Zinc 500 → **4.83:1** |
| Borde activo (Editor/Mapa) | `#E8B947` → **1.80:1** | `--ms-gold-ink` → **5.54:1** |

Jerarquía de tinta preservada: **19.90 / 7.73 / 4.83** en claro,
**16.12 / 11.99 / 6.91** en oscuro. Tres escalones distinguibles, los seis
por encima de 4.5.

El oro conserva su función: relleno de acción con tinta oscura (10.86:1), nunca
texto sobre blanco (ese par da 1.75:1 y hay un test que lo fija). Como borde
necesitaba otra luminancia, y por eso existe `--ms-gold-ink` separado en vez de
oscurecer el relleno.

Semánticos diferenciados del oro, con test.

## 3. Component language

**Topbar** — era `#F59E0B` sólido de lado a lado: *fondo dorado extenso*,
exactamente lo que el sistema evita, y hacía que el oro no significara nada.
Pasa a chasis Zinc 950 / tinta Zinc 100. Se le quita el `backdrop-filter`: el
chasis es material, no vidrio, y de paso deja de crear un stacking context.

**Navegación** — la selección era un bloque dorado al 10%. Ahora es un **rail
de 2 px de oro** debajo del ítem, sobre chasis.

**Encabezado de sección** — único lugar del shell donde habla Butler, a 24 px.
El rótulo sale de `tabs`, la misma fuente que la navegación: no hay una segunda
lista de nombres.

**Foco** — `index.css` define un `*:focus-visible` global con `var(--ac, …)`, y
`--ac` es el acento del catálogo legacy (`#C45D3E`) definido en `:root`. Medido
en Phase 3: el panel ámbar tenía anillo terracota y el token del design system
no se aplicaba nunca. Dentro de `.ag-root` y del root de overlays manda el oro,
2 px.

**Controles** — radio 6 px, primario oro con tinta oscura, secundario
estructural, tabular-nums en todo el shell.

**Badge** — encontrado midiendo: Zinc 950 sobre el rojo claro daba 3.04:1 y
blanco sobre el rojo oscuro 2.77:1. Un valor fijo falla en un tema, así que la
tinta es un token por tema (6.54 / 7.19).

## 4. Trace

Una sola intensidad autorizada, aplicada a las dos superficies estructurales
—topbar y navegación— y a ninguna superficie de contenido.

Medido en navegador, las tres variantes:

| Variante | Token | Opacidad computada | Gradiente | Imagen | Animación |
|---|---|---|---|---|---|
| Clean | 0 | 0 | sí | no | none |
| **Trace A** (candidata) | 0.05 | 0.05 | sí | no | none |
| Trace B | 0.09 | 0.09 | sí | no | none |

`z-index: -1`, `pointer-events: none` en todas. Es una
`repeating-linear-gradient` diagonal de 3 px: **sin imagen de ruido** que
descargar o versionar, y determinista, así que no mete inestabilidad en el gate
de píxeles.

Reglas fijadas por tests: jamás sobre Blue/Volt, jamás animada, jamás bajo
texto, y controlada por tokens (`--ms-trace-opacity`, `--ms-trace-scale`,
`--ms-trace-ink`). Las variantes se activan por un atributo en `<html>` desde
la plancha: **no hay selector visible en producto**.

Sobre superficie clara la trama se invierte a tinta y baja al 60 % de su
opacidad.

## 5. Responsive

| Viewport | Desborde nav | Inalcanzables | Targets < 44 | Scroll horiz. |
|---|---|---|---|---|
| 1440×1000 | 0 | ninguna | 0 | no |
| 1280×800 | 0 | ninguna | 0 | no |
| 390×844 | 0 | ninguna | 0 | no |
| 360×800 | 0 | ninguna | 0 | no |

Encabezado en Butler presente en los cuatro. Cuatro primarias + «Más» en
mobile, con el contrato de Phase 3A intacto.

**No hubo commit de adaptación a mobile**: la medición no encontró nada que
adaptar. La geometría viene de Phase 3A y el chasis aplica igual en los cuatro
anchos.

## 6. The Slot

Contrato de layout reservado. **No se incorpora el personaje en esta rama.**

| | |
|---|---|
| Posición | `advisor.top` — debajo del encabezado, arriba del contenido |
| Capa | `--ag-z-content`; nunca por encima de sticky |
| Geometría | `position: relative`, techo `40vh`, márgenes laterales de 18 px |
| Prohibido | flotar sobre la navegación o sobre controles persistentes (DICO-DESIGN-SYSTEM-V0.1 §6) |
| Overlays | un diálogo abierto lo cubre: vive por debajo del backdrop |
| Temas | hereda los tokens del panel; no trae fondo propio |

Hoy lo ocupa el asesor de avisos que ya vivía ahí. Mañana puede alojar Dico
Native 2D o Physical 3D sin mover el shell.

## 7. Decisión de alcance: no hay sidebar

El brief dice «sidebar **o** navegación principal». No introduje un sidebar:

1. Meterlo en desktop es **reestructurar**, no aplicar un lenguaje visual, y el
   brief pide que los módulos sigan funcionando dentro del marco sin reescribir
   su lógica.
2. El contrato de QA Lite depende de `.ag-nav-item.active[data-section="orders"]`.
   Un sidebar rompe el gate que Phase 3A acaba de dejar verde.

Lo que sí se hizo es que la barra **lea como chasis**, con rail de oro. Si el
sidebar es la dirección, merece su propio lote estructural.

## 8. Deuda visual restante

- **30 `'DM Sans'` inline en 18 componentes de módulo.** Interior de pantalla.
- **Google Fonts a nivel documento**, heredado del catálogo vía `index.html`.
- **«Ver el salón» a 3.17:1** — chip de módulo con el par teal legacy. Venía de
  1.00:1: mejoró, no llega. Fuera del shell.
- **`dico-burbuja-texto` a 1.16:1** — **artefacto de medición**, no defecto: el
  papel de la burbuja es un `fill` de SVG, así que la sonda lee el fondo del
  shell. El texto real va sobre `#FDF7EA`.
- **`src/components/ui/Modal.jsx`** sigue huérfano y basado en Tailwind.
- Los overlays legacy (`.ag-page-over`, `Dialogs.jsx` con `z-index: 9999`)
  siguen con sus números, mapeados pero no migrados.

## 9. Lo que este lote NO hizo

Sin logo nuevo ni reconstruido. Sin Dico Physical 3D. Sin librerías de UI. Sin
Google Fonts nuevas ni fuentes remotas. Sin glassmorphism, blur pesado ni neón.
Sin migraciones, DB, Supabase, RLS, auth ni lógica comercial. Sin tocar pedidos,
caja, inventario ni permisos. Sin rediseñar el interior de los módulos. Sin
deploy, merge, promote ni rollback. Sin resolver los cuatro errores
preexistentes de consola.
