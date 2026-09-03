# Phase 4 — Admin Home Golden Screen · BRIEF

Fecha: 2026-09-03 · HEAD: `d9361cd` · Rama: `feat/dico-panorama-v1`
Estado: **OPEN — brief escrito, ejecución no empezada**

Este documento abre Phase 4. Registra qué se va a hacer, sobre qué pantalla y
con qué se cierra. No registra resultados: los resultados van al documento de
cierre, cuando existan.

---

## 0. Qué es una Golden Screen, y qué no

Una Golden Screen es **una sola pantalla llevada al acabado final**, para que
Phase 5 extraiga primitives de algo demostrado en vez de inventar una librería
UI por adelantado. La matriz lo dice explícito: «extraer sólo lo demostrado por
Golden Screen».

Lo que **no** es:

- No es un rediseño del panel. Las otras pantallas no se tocan.
- No es funcionalidad nueva. No se agregan capacidades de producto.
- No es un gate automatizable. **El gate de Phase 4 es aprobación visual
  humana.** Los contratos medibles de la sección 4 acompañan a esa aprobación;
  no la reemplazan. Una pantalla puede pasar los seis números y verse mal.

## 1. Qué pantalla, y por qué no la que dice el nombre

La matriz llama a esta fase «Admin Home». **Esa pantalla no existe.** Medido en
`d9361cd`:

- `src/modules/registry.js:26` declara los módulos del edificio —products,
  orders, agenda, variants, stock, finanzas, ventas, caja, personal, mesas— y
  **ninguno es `home`**.
- Cada rol entra por una pantalla existente (`abreEn` en
  `src/modules/roles.js`): el dueño en `products`, el encargado en `orders`, el
  cajero en `caja`.
- El `Home.jsx` que sí existe (`src/components/admin/Home.jsx`) es del admin
  **legacy**: su único importador es `src/pages/Admin.jsx:21`. El edificio no lo
  monta.

Decisión (Ricky, 3/sep/2026): la Golden Screen es **Productos**
(`src/components/admin/platform/ProductsPanel.jsx`), no una Home nueva.

El razonamiento: es la pantalla donde cae el dueño al entrar, la que hace que el
alta self-service sirva de algo, y la única que ya tiene a Dico Physical encima
—el evento `catalogo-vacio` ancla su `pointDown` sobre el CTA de esta pantalla—.
Llevarla al acabado final es acabado sobre algo vivo. Crear una Home habría sido
producto nuevo disfrazado de fase de diseño, con decisiones abiertas de qué
mostrar por rol y por rubro.

**Consecuencia formal:** Phase 4 se renombra a **Golden Screen — Productos**. La
matriz dice «Admin Home» por una intención vieja; dejarlo así obliga a cada
lector futuro a repetir esta averiguación. El renombre se aplica al cerrar.

## 2. Estado medido de la pantalla, hoy

Todo lo de esta sección se leyó del código en `d9361cd` o se calculó sobre los
tokens reales. No es impresión.

### 2.1 Un defecto de contraste real, ya en la rama

El margen por producto se pinta así (`ProductsPanel.jsx`, fila de la lista):

```js
color: m.ganancia >= 0 ? 'var(--ag-c-sales, #3A7D44)' : 'var(--ag-c-orders, #C62828)'
```

Los tokens existen (`admin-tokens.css:45-46`): `--ag-c-sales: #2A9D6E` y
`--ag-c-orders: #E85A4A`. Ninguno se redefine en `.ag-theme-dark`. Contraste
calculado contra el fondo real de la tarjeta (`--ag-bg-card`: `#FFFFFF` en
claro, `--ms-zinc-900` `#18181B` en oscuro), para texto de **13px normal**, que
exige **4,5:1** en AA:

| Par | Claro | Oscuro |
|---|---|---|
| `--ag-c-sales` #2A9D6E sobre card | **3,42:1 ✗** | 5,19:1 ✓ |
| `--ag-c-orders` #E85A4A sobre card | **3,50:1 ✗** | 5,06:1 ✓ |

**En tema claro el margen de cada producto falla AA.** Es la misma familia del
defecto que Phase 3A midió *dentro* del shell; esta pantalla está fuera del
shell, que es justamente el territorio que 3B §8 dejó declarado como deuda y que
Phase 4 es la primera fase en cubrir.

El detalle que confirma que no es casualidad: el fallback muerto `#3A7D44` da
**5,00:1 en claro** — *el color que nunca se usa cumple, y el token que sí se usa
no*. El fallback se escribió cuando el verde era otro; después cambió el token y
nadie volvió a medir. Un `var()` con fallback no falla nunca, así que no había
cómo enterarse.

### 2.2 Los fallbacks son letra muerta con forma de red de seguridad

Los dos `var(--token, #hex)` de arriba son la firma exacta que el gate A3
aprendió a detectar (`PHASE-3B-A3-CLOSURE.md`): un fallback nunca dispara un
error, así que un token renombrado degrada a un color fijo que **deja de seguir
al tema** y la pantalla sigue «funcionando». Salen en Phase 4.

### 2.3 La pantalla no usa el sistema tipográfico que ya existe

`admin-tokens.css:232-244` define una escala en clases: `.ag-h1` 26 / `.ag-h2`
22 / `.ag-h3` 18 / `.ag-h4` 15, más `.ag-body` 13, `.ag-body-s` 11,5 y `.ag-meta`
11. **`ProductsPanel` no usa ninguna.** Dibuja su título con:

```js
fontFamily: "'DM Sans', sans-serif", fontWeight: 800, fontSize: 18
```

Es `.ag-h3` con otro peso y con la familia clavada a mano — la deuda «DM Sans
inline» que 3B §8 declaró, acá literal. El resto de la pantalla usa 14, 13, 12,
11 y 10px sueltos, ninguno anclado a la escala.

### 2.4 No hay escala de espaciado, y se nota

`admin-tokens.css` define radios (`--ag-r-sm` 10 … `--ag-r-2xl` 22), sombras,
easings, duraciones y capas. **No define espaciado**: no existe ningún
`--ag-sp-*`. La pantalla usa gaps y paddings de 6, 8, 9, 11, 12, 13, 14, 16, 18
y 20px sin nada donde anclarlos, y radios de 12 y 14 donde **12 no está en la
escala de radios**.

Esto es un hallazgo de sistema, no de pantalla: definir la escala es precondición
para que Phase 5 extraiga algo que no sea un catálogo de números mágicos.

### 2.5 Un target destructivo por debajo del mínimo

El botón de eliminar es un SVG de 16px con `padding: 6` → **28px** de alto y
ancho. Phase 3A fijó 44px como contrato de target táctil y A3 lo re-midió en 46
para la nav. Acá el elemento que **borra un producto para siempre** es el más
chico de la fila, y está pegado al de Ocultar. Es riesgo de toque errado en la
acción menos reversible de la pantalla.

### 2.6 Texto de interfaz sin tildes

Visible para el usuario: «Se borra del catalogo para siempre», «Ocultar del
catalogo», «Mostrar en el catalogo», «Sin categoria». La regla del repo es
**comentarios** sin tildes, por encoding; no la interfaz. El resto del mismo
componente sí acentúa («catálogo», «Deslizá»), así que hoy conviven las dos
formas en la misma pantalla.

### 2.7 Casi todo es estilo inline

De las ~298 líneas del componente, la enorme mayoría de la presentación vive en
`style={{…}}`. Sólo cuatro clases reales se usan (`ag-cta`, `ag-btn-mini`,
`ag-page-over*`, `ag-subpage-back`). Para una fase cuyo producto es *material del
que extraer primitives*, esto es el obstáculo central: no se puede extraer un
primitive de un objeto literal repetido seis veces con variaciones.

## 3. Alcance

### Entra

1. El defecto de contraste de 2.1, corregido en el **token**, no en la pantalla:
   si el verde y el rojo de estado no cumplen sobre las superficies reales, el
   problema es del token y afecta a todo consumidor (`CRM.jsx`, `Analytics.jsx`,
   `CheckoutFunnel.jsx` y varios más). Cambiar sólo `ProductsPanel` dejaría el
   mismo defecto en el resto.
2. Salida de los dos `var(--token, #hex)` (2.2).
3. Adopción de la escala tipográfica existente y baja del `DM Sans` inline (2.3).
4. Definición de la escala de espaciado `--ag-sp-*` y su uso en esta pantalla
   (2.4). **Sólo se declaran los pasos que esta pantalla usa.**
5. Target de la acción destructiva a 44px (2.5).
6. Tildes de interfaz (2.6).
7. Traslado de la presentación de inline a clases, hasta donde la pantalla lo
   demuestre (2.7).

### No entra

- Las otras pantallas del panel. Se tocan en Phase 6.
- `ProductEditor` (el formulario a pantalla completa). Es otra superficie: si
  entra, Phase 4 deja de ser una pantalla.
- Cualquier cambio a Dico. Phase 8 y 9 están CLOSED y su geometría está anclada
  a píxeles medidos: **las constantes del Slot no se tocan** (ver el aviso de
  `HANDOFF.md` sobre `--pose-dedo`).
- Crear primitives. Eso es Phase 5, y se hace *después* de la aprobación, sobre
  lo que la pantalla haya demostrado.
- La deuda declarada en 3B §8 que no toca esta pantalla (Google Fonts a nivel
  documento, `Modal.jsx` huérfano, overlays legacy, los 4 errores de consola
  preexistentes). A3 no la reabrió y Phase 4 tampoco.

## 4. Con qué se cierra

**El gate es la aprobación visual de Ricky**, sobre capturas de la pantalla en
los dos temas y en desktop + mobile. Sin esa aprobación registrada, Phase 4 no es
CLOSED — es exactamente lo que la matriz señaló como faltante.

Los contratos medibles que la acompañan. Ninguno inventado: cada uno re-usa un
umbral ya persistido en el repo.

| # | Contrato | Umbral | De dónde sale |
|---|---|---|---|
| G1 | Todo texto de la pantalla contra su fondo real | ≥ 4,5:1 en claro y oscuro | AA, el mismo que usó 3A |
| G2 | Ningún `var(--token, #hex)` en el componente | 0 | firma del defecto de 3A |
| G3 | Target de toda acción destructiva | ≥ 44px | contrato de 3A |
| G4 | Desborde `scrollWidth − clientWidth` | 0 en 6/6 tema × viewport | A3 |
| G5 | Suite completa | verde, sin bajar el total | 1172/1172 en `d9361cd` |
| G6 | QA Lite same-ref | DOM igual, `blockingDiffPixels` 0, red externa 0 | Phase 8/9 |

G6 tiene una advertencia conocida: el same-ref de esta rama tuvo nondeterminismo
por line-height fraccionario, un `setInterval` en el título del catálogo y un
`margin:auto` inestable (B6R.QA1). Están resueltos, pero si G6 parpadea, mirar
ahí primero en vez de subir el umbral.

## 5. Qué le deja a Phase 5

Al terminar, la pantalla debería haber demostrado —no propuesto— estos candidatos
a primitive: la **fila de lista con acciones**, la **tarjeta de sección con
encabezado y conteo**, el **campo de búsqueda**, el **estado vacío** y el **CTA
primario**. Phase 5 extrae los que aparezcan una segunda vez en la pantalla
siguiente. **Los que aparezcan una sola vez no se extraen.**

---

## Bitácora

- **3/sep/2026** — Brief abierto. Pantalla elegida: Productos. Deuda medida:
  contraste 3,42:1 / 3,50:1 en claro, dos fallbacks muertos, escala tipográfica
  sin usar, escala de espaciado inexistente, target destructivo de 28px.
  Ejecución no empezada.
