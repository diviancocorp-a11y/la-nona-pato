# Dico Design System v0.1

> Inventario y decisiones basados en el código real al 25/ago/2026.
> Estado: **autoridad propuesta; migración todavía no iniciada**.
>
> El primer piloto será `/registro`, sin cambiar lógica, campos ni flujo. El
> segundo será Caja/POS para validar densidad táctil y velocidad operativa.

---

## 1. Qué se auditó

Archivos pedidos:

- `src/styles/admin-tokens.css`
- `src/styles/hermes-tokens.css`
- `src/catalog-pro/tokens.css`
- `src/pages/Signup.jsx`
- `src/components/dico/DicoCara.jsx`
- `src/components/admin/platform/DicoAvisos.jsx`
- `src/modules/roles.js`
- `src/modules/registry.js`

Durante la revisión apareció una cuarta autoridad visual que también hay que
incluir: `src/index.css` contiene un bloque Tailwind v4 `@theme` con colores,
tipografías, radios y sombras propios.

### Foto cuantitativa

| Alcance | Resultado |
|---|---:|
| Ocho archivos pedidos | 104 apariciones de hex, 68 valores únicos |
| Todo `src/` (`.css`, `.js`, `.jsx`) | 1.077 apariciones de hex, 233 valores únicos |
| Todo `src/` | 3.346 atributos `style=` |
| Sólo `Signup.jsx` | 44 estilos inline, 7 hex únicos, 0 tokens |
| Valores de tamaño en los archivos auditados | 32 valores `px` distintos |

Estos números son una línea de base, no una meta de limpieza inmediata. Un
lint que prohibiera todo hex hoy bloquearía el proyecto entero; primero debe
entrar con una lista base de deuda existente y fallar sólo ante deuda nueva.

---

## 2. Inventario real

### `admin-tokens.css`: sistema vivo del panel

- Se importa desde `Admin.jsx` y `PlatformAdmin.jsx`.
- Los aliases `--ag-*` se usan ampliamente en el panel.
- Tipografía: DM Sans.
- Neutral actual: zinc frío (`#262626`, `#6B7280`, `#9CA3AF`, `#E5E7EB`).
- Marca/acción: `#F59E0B`, hoy demasiado cerca del significado de warning.
- Colores de sección: ventas, pedidos, stock, CRM, preparación y recetas.
- Radios actuales: 10, 14, 16, 18, 22 y pill.
- Controles sin contrato único: botones de aproximadamente 34–36 px, inputs
  cercanos a 37 px e icon buttons de 30, 32, 36, 38 y 52 px.
- Incluye adaptación oscura y helpers semánticos de estado.

**Lectura:** no se puede borrar. Debe quedar como adaptador temporal del admin
y conservar sólo aquello específico del panel, como identidad de módulos y
modo oscuro.

### `hermes-tokens.css`: buen lugar físico, poca adopción

- Se importa globalmente desde `src/index.css`.
- No se encontraron consumidores reales de `--hg-*` ni de las clases `.hg-*`
  fuera del propio archivo.
- Ya contiene spacing 4/8/12/16/24/32, sombras, movimiento y componentes
  genéricos, pero mezcla primitivas, semántica y componentes.
- Tipografía editorial: Instrument Serif; UI: DM Sans; datos: JetBrains Mono.
- Radios: 8, 14 y 22.
- Botones: 36, 44 y 52 px; input: 48 px.

**Lectura:** es la ubicación más segura para el núcleo porque ya es global y
cambiarlo hoy tiene poco riesgo de regresión. No se crea otro archivo central.

### `catalog-pro/tokens.css`: sistema vivo y correctamente aislado

- Se importa desde `Catalog.jsx`.
- `.cp-root` es obligatorio y se usa en el catálogo real.
- Tiene tres temas: ámbar, noche y carbón.
- Noche y carbón ya aportan una neutralidad cálida aprovechable.
- Usa Inter para UI y Source Serif 4 para títulos, duplicando descargas y el
  papel que ya cumplen DM Sans e Instrument Serif.
- Spacing: 4/8/12/16/24/32/48/64.
- Radios: 6/10/16. Botones: 36/44/52 px.

**Lectura:** `.cp-root` y los tres temas se conservan. El archivo pasa a ser
un adaptador de tema hacia la semántica común; no debe seguir inventando
escalas base propias.

### `src/index.css @theme`: cuarta autoridad

- Define otra paleta cálida, fuentes, radios y sombras.
- Seis componentes en `src/components/ui` declaran consumir esos nombres, pero
  no se encontraron imports de esos componentes en el producto actual.
- Tiene buenos candidatos semánticos ya usados como referencia:
  `#3A7D44` success, `#C62828` danger y `#1565C0` info.

**Lectura:** el bloque `@theme` queda como puente para Tailwind y debe apuntar
a tokens canónicos. No conserva valores crudos propios.

### `Signup.jsx`: quinto sistema informal y primer piloto

Paleta local:

| Uso actual | Valor |
|---|---|
| Fondo | `#0F0E0D` |
| Texto | `#F5F1EA` |
| Marca/acción | `#E8B947` |
| Texto sobre acción | `#1A1408` |
| Éxito | `#4ADE80` |
| Error | `#F87171` / `#FCA5A5` |

- Usa fuente de sistema/Segoe UI, no la tipografía del producto.
- No tiene clases visuales ni tokens: 44 `style=` inline.
- Inputs, tarjetas y botón usan radios 10/11 y medidas propias.
- `outline: none` inline pone en riesgo la señal visible de foco.
- La lógica de slug, rubro, modalidad, país y alta ya funciona y no forma parte
  del rediseño.
- No usa Dico todavía.

### Dico

`DicoCara.jsx` ya fija cinco estados canónicos:

| Estado | Significado de producto |
|---|---|
| `idle` | presencia neutral |
| `esperando` | carga o proceso en curso |
| `contento` | éxito o confirmación positiva |
| `preocupado` | bloqueo, riesgo o error recuperable |
| `pregunta` | decisión o explicación necesaria |

`DicoAvisos.jsx` transforma alerta → preocupado, aviso → pregunta y sugerencia
→ esperando. Presenta un solo aviso por vez, permite avanzar/cerrar y recuerda
la primera entrada. El movimiento reducido ya está resuelto en `dico.css`.

Hoy Dico aparece en el panel del edificio en los avisos y en el vacío de
productos. No aparece en `/registro`.

### Roles y registry

- `roles.js` define siete roles y cuatro grados de acceso. Es navegación y
  experiencia, no seguridad; RLS sigue siendo la autoridad de seguridad.
- `registry.js` define tres verticales, terminología, campos, módulos,
  modalidades y canales. Ocho de diez módulos están implementados.

**Regla de diseño derivada:** el rol puede cambiar visibilidad, densidad y
prioridad, pero no inventar colores semánticos. El registry decide las palabras;
los componentes visuales no deben ramificarse por rubro.

---

## 3. Mapa de decisiones

| Elemento actual | Decisión | Futuro |
|---|---|---|
| `#E8B947` de Signup/noche | **Se conserva** | `--ds-color-gold-500`; marca Dico |
| Neutral cálido de carbón/noche | **Se conserva** | base neutral común |
| DM Sans | **Se conserva** | UI y números de operación |
| Instrument Serif | **Se conserva** | marca, títulos editoriales y marketing |
| `.cp-root` + 3 temas | **Se conserva** | adaptador de tema del catálogo |
| Cinco estados de `DicoCara` | **Se conservan** | vocabulario oficial del personaje |
| Terminología de `registry.js` | **Se conserva** | única fuente de copy por vertical |
| Matriz de `roles.js` | **Se conserva** | navegación y permisos de experiencia |
| Colores de módulo `--ag-c-*` | **Se migran** | identidad de sección, nunca feedback |
| `#F59E0B` como marca y warning | **Se migra** | sale de marca; warning tiene color propio |
| `--ag-*` de base | **Se migra** | aliases temporales a semánticos `--ds-*` |
| `--bg`, `--tx`, `--ac` del catálogo | **Se migran** | aliases de compatibilidad por tema |
| `@theme` con valores crudos | **Se migra** | puente de Tailwind hacia `--ds-*` |
| Estilos visuales inline de Signup | **Se migran** | CSS scoped + tokens canónicos |
| Inter y Source Serif 4 | **Se migran** | DM Sans + Instrument Serif |
| Zinc frío como neutral global | **Se depreca** | neutral cálido común |
| Escalas de radios 10/11/14/16/18/22/24 | **Se deprecian** | 4/6/8/12 + pill excepcional |
| Clases `.hg-*` sin consumidores | **Se deprecian** | retirar tras comprobar strings dinámicos |
| Hex nuevo dentro de componentes | **Se prohíbe** | guard incremental en pre-commit |
| Oro del render físico de Dico | **Se aísla** | asset de ilustración, no token de UI |

---

## 4. Autoridad y capas

El núcleo vive en el archivo existente `src/styles/hermes-tokens.css` y usa el
prefijo `--ds-`. La dependencia siempre baja en esta dirección:

```text
primitivas
   ↓
semántica
   ↓
componente / contexto
   ↓
adaptadores legacy: --ag-*, --cp-* / --bg, @theme
```

### Primitivas

Nombran valores, no intenciones:

```css
--ds-color-gold-500: #e8b947;
--ds-color-neutral-900: #1a1612;
--ds-space-4: 16px;
--ds-radius-3: 8px;
--ds-font-ui: 'DM Sans', sans-serif;
```

### Semántica

Describe para qué existe el valor:

```css
--ds-color-action-primary-bg: var(--ds-color-gold-500);
--ds-color-action-primary-text: var(--ds-color-neutral-900);
--ds-color-text-primary: var(--ds-color-neutral-900);
--ds-color-surface-default: var(--ds-color-neutral-0);
--ds-color-border-focus: var(--ds-color-gold-600);
```

### Componente y contexto

Sólo cuando un componente necesita un contrato estable:

```css
--ds-button-primary-bg: var(--ds-color-action-primary-bg);
--ds-input-border-focus: var(--ds-color-border-focus);
--ds-table-row-selected-bg: var(--ds-color-action-primary-soft);
--ds-control-height: 40px;
```

No se crearán tokens por pantalla (`--signup-button-gold`) ni por rubro
(`--barber-primary`). Los temas cambian semántica; los componentes la consumen.

---

## 5. Escalas v0.1

### Color

Neutral cálido propuesto, compuesto sólo con valores ya presentes en el
producto:

| Token conceptual | Valor |
|---|---|
| `neutral.0` | `#FFFFFF` |
| `neutral.50` | `#FAF5EE` |
| `neutral.100` | `#F1EBE0` |
| `neutral.200` | `#E8DFD0` |
| `neutral.400` | `#A39685` |
| `neutral.600` | `#6B5D4F` |
| `neutral.800` | `#2D2924` |
| `neutral.900` | `#1A1612` |
| `neutral.950` | `#0F0E0D` |

Marca y feedback no comparten significado:

| Semántica | Referencia v0.1 |
|---|---|
| Marca/acción principal | gold `#E8B947`, siempre con texto oscuro |
| Success | `#3A7D44` |
| Warning | familia naranja propia; no `brand.gold` |
| Danger | `#C62828` |
| Info | `#1565C0` |

Los valores finales de fondos suaves y estados hover se validan por contraste
en el piloto antes de declararlos estables.

### Spacing

| Nombre | Valor |
|---|---:|
| `space-1` | 4 px |
| `space-2` | 8 px |
| `space-3` | 12 px |
| `space-4` | 16 px |
| `space-6` | 24 px |
| `space-8` | 32 px |

48 y 64 dejan de ser parte de la escala de componentes. Si una composición
editorial necesita aire mayor, lo expresa con un token de layout específico.

### Densidad

| Densidad | Fila | Input | Botón | Uso inicial |
|---|---:|---:|---:|---|
| `compact` | 32 px | 34 px | 34 px | tablas densas de escritorio |
| `default` | 40 px | 40 px | 40 px | administración y formularios comunes |
| `touch` | 48 px mínimo | 48 px | 48 px | Caja/POS y acciones táctiles críticas |

La densidad la decide el contexto, no automáticamente el ancho de pantalla.
Un POS sigue siendo `touch` en escritorio; una tabla analítica puede seguir
siendo `compact` en una pantalla angosta con desplazamiento controlado.

### Radio

| Nombre | Valor | Uso |
|---|---:|---|
| `radius-1` | 4 px | tags y elementos chicos |
| `radius-2` | 6 px | controles compactos |
| `radius-3` | 8 px | inputs y botones |
| `radius-4` | 12 px | tarjetas y superficies |
| `radius-pill` | 999 px | pills, avatares y estados circulares |

### Tipografía

| Nombre | Tamaño | Uso |
|---|---:|---|
| `xs` | 11 px | ayudas y metadata secundaria |
| `sm` | 13 px | tablas, labels y controles compactos |
| `md` | 15 px | cuerpo e inputs |
| `lg` | 18 px | subtítulos y encabezados de bloque |
| `xl` | 24 px | título de pantalla |
| `metric` | 28 px | importes y métricas principales |

- UI: DM Sans.
- Marca/editorial: Instrument Serif.
- Métricas: DM Sans 700 con números tabulares.
- JetBrains Mono queda reservado para códigos e identificadores, no para toda
  cifra. Así se evita una tercera fuente en superficies que no la necesitan.
- Los displays de marketing pueden superar `xl`; no amplían la escala de la
  aplicación operativa.

---

## 6. Reglas de Dico

1. Máximo un Dico visible por pantalla o estado de pantalla.
2. Dico acompaña texto útil; nunca reemplaza labels, errores, instrucciones ni
   estados accesibles.
3. No compite con el CTA principal ni se convierte en un segundo CTA.
4. Usa sólo `idle`, `esperando`, `contento`, `preocupado` y `pregunta` en la
   interfaz. Las poses grandes pertenecen a escenas con espacio.
5. `prefers-reduced-motion` deja al personaje quieto.
6. Los brazos permanecen estáticos hasta tener assets separados; no se finge
   movimiento independiente sobre una imagen fusionada.
7. Un cambio de rubro cambia el texto mediante `registry.js`, no la identidad
   visual del personaje.

### Slots permitidos

| Slot | Componente | Uso |
|---|---|---|
| `state.empty` | `DicoEscena` | vacío accionable, centrado con un solo CTA |
| `advisor.top` | `DicoCara` + `BurbujaDico` | debajo del título y arriba del contenido |
| `onboarding.aside` | `DicoCara` | lateral del formulario; arriba en móvil |
| `confirmation.center` | `DicoCara` o escena | éxito que reemplaza el flujo anterior |

### Lugares prohibidos

- Dentro del botón primario.
- Flotando sobre navegación inferior o controles persistentes.
- Repetido en filas, tarjetas o listas.
- Decorativo al lado de otro aviso o ilustración principal.
- Tapando contenido o usando la burbuja para alojar un formulario.

Si compiten dos slots, el orden de prioridad es: estado principal → asesor →
onboarding. Sólo sobrevive el primero aplicable.

---

## 7. Piloto 1: `/registro`

### Alcance

- Mantener exactamente la lógica, campos, validaciones y llamadas existentes.
- Extraer únicamente la presentación inline a CSS scoped.
- Aplicar neutral cálido, DM Sans, marca gold y escalas v0.1.
- Usar densidad `touch` para inputs y CTA; el alta debe ser cómoda en móvil.
- Restaurar un foco visible inequívoco y validar navegación sólo con teclado.
- Mantener error junto al campo o bloque que lo origina; Dico no sustituye el
  mensaje.

### Dico en el piloto

- Formulario: un `DicoCara` `idle` en `onboarding.aside`, sin burbuja ni CTA.
- Móvil: el mismo Dico se mueve arriba del encabezado; no se duplica.
- Éxito: el formulario desaparece y ese único slot se reemplaza por
  `contento`.
- Carga: puede pasar a `esperando` sin montar un segundo personaje.
- Error de red/bloqueante: puede pasar a `preocupado`; los errores de campo no
  cambian a Dico en cada pulsación.
- La vuelta de entrada ocurre como máximo una vez y se anula con movimiento
  reducido.

### Criterios de aceptación

- Contraste WCAG AA en texto, controles, feedback y foco.
- Sin pérdida de contenido a 390 px y desktop.
- Targets críticos de 48 px.
- Teclado completo y orden de foco lógico.
- Estados: inicial, slug disponible/no disponible, validación, enviando,
  error de red y alta exitosa.
- Cero cambios de payload, rutas o comportamiento de negocio.
- Capturas comparables antes/después y prueba visual en navegador real.

---

## 8. Piloto 2: Caja/POS

Caja valida lo que Registro no puede:

- densidad `touch` sostenida;
- lectura rápida de importes;
- estados selected/pressed/disabled;
- uso con una mano y bajo presión;
- jerarquía entre total, medio de pago y confirmación;
- Dico sólo en vacío o bloqueo sistémico, nunca durante cada paso del cobro.

No se migra todo el admin a partir de una pantalla linda. El contrato se vuelve
estable recién si Registro y Caja funcionan con los mismos primitivos y
semánticos en contextos opuestos.

---

## 9. Orden de implementación

1. Reestructurar el archivo existente `hermes-tokens.css` en primitivas,
   semántica y contexto sin retirar aliases vivos.
2. Mapear `@theme` hacia el núcleo; no agregar una quinta paleta.
3. Rediseñar `/registro` con CSS scoped y pruebas de estados.
4. Ajustar valores de contraste/foco a partir del piloto y congelar v0.1.
5. Implementar Caja/POS con densidad `touch`.
6. Convertir `admin-tokens.css` y `catalog-pro/tokens.css` en adaptadores.
7. Retirar aliases y clases sin consumidores sólo después de medir uso.
8. Activar guard incremental contra hex y nuevas escalas fuera del sistema.

### Guard incremental recomendado

El pre-commit debe guardar una línea de base de archivos/valores existentes y
rechazar únicamente:

- hex nuevo en componentes;
- un tamaño nuevo fuera de las escalas aprobadas;
- un token de componente que saltee la capa semántica;
- una nueva fuente visual sin documentar.

La línea de base baja en cada migración y nunca puede crecer. Esto convierte la
limpieza en una tendencia verificable sin exigir una reescritura riesgosa.

---

## 10. Definición de terminado para v0.1

La versión 0.1 no termina cuando existe este documento. Termina cuando:

- el núcleo está en `hermes-tokens.css`;
- Registro y Caja consumen el mismo contrato;
- el mapa de contraste está verificado;
- Dico cumple los slots y estados definidos;
- no se agregan colores, radios ni alturas crudas nuevas;
- admin, catálogo y Tailwind tienen un camino de compatibilidad explícito;
- existe una captura o vitrina reproducible por cada densidad y estado base.
