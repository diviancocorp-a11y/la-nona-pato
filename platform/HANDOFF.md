# HANDOFF — Dico, plataforma multi-rubro (para seguir en code)

> Punto de entrada para continuar. **Las secciones van de mas nueva a mas
> vieja: leer la primera.** Docs largos: `PLAN-ERP.md` (el plan vivo del ERP),
> `PLAN-MULTI-RUBRO.md`, `ARQUITECTURA-MODULAR.md`. SQL en `platform/`.
>
> Para retomar en un chat nuevo: **`/dico`**. Para cerrar: **`/cerrardico`**.

---

## 25/ago/2026 — Dico Core retro y brazos articulados (sesión Codex)

Ricky rechazó la primera cara sin accesorios porque seguía viéndose genérica
y luego detectó que las pupilas espejadas hacían parecer bizco a Dico. La
dirección aprobada para seguir iterando es cartoon editorial de los años 50,
sin volver a galera, bigote, nariz, mejillas ni pecas.

### Hecho

- `CaraDeTinta.jsx` tiene ojos perfectamente simétricos en posición, tamaño y
  altura. Las dos pupilas comparten orientación —nunca se espejan— y usan una
  masa negra orgánica con recorte crema angosto. Así miran juntas y conservan
  la firma retro de la referencia sin copiar otro personaje.
- Los párpados son formas sólidas `#FDCE18`, color muestreado de la moneda, con
  borde inferior negro. Si una emoción los activa no aparece una línea
  transparente sobre el cuerpo.
- `esperando` dejó la pose cansada: ojos abiertos, cejas simétricas levantadas,
  sonrisa leve, mirada apenas elevada, puntos de proceso y manos algo abiertas.
- `pregunta` muestra un `?` SVG con halo crema para funcionar en fondos claros
  y oscuros. La mano izquierda entra desde abajo y queda bajo el mentón; no
  cruza ojos ni boca.
- El cuerpo dejó de ser un único render rígido. `DicoCara.jsx` monta tres capas:
  `moneda-sin-brazos.webp`, brazo izquierdo y brazo derecho recortados del
  `moneda.webp` original. Los brazos viven detrás de la moneda para ocultar el
  empalme; sólo la mano pensante pasa delante en `pregunta`.
- `dico.css` define una pose de manos para los cinco estados: reposo (`idle`),
  expectativa (`esperando`), apertura/celebración (`contento`), manos bajas
  hacia adentro (`preocupado`) y mentón (`pregunta`). Son transforms sobre dos
  sprites, no cinco renders nuevos.
- La moneda limpia se produjo editando el activo existente y quedó como WebP
  transparente 800×800. Los dos activos de runtime siguen por debajo de 100 KB
  cada uno. Se actualizaron el README de poses y `PLAN-DICO.md` para que Claude
  no vuelva a tratar brazos y moneda como una sola pieza.
- `dicoEscena.test.jsx` ahora cubre las dos capas de brazos y la anatomía de la
  pregunta. La suite pasó de 869 a 870 tests.

### Verificado

- Vitrina real `http://localhost:5199/?escena=dico`: fondos claro/oscuro,
  estados 30/48/120 px, composición operativa y viewport 390×844. Las pupilas
  miran juntas, la abertura crema se mantiene legible, no hay halo de fondo en
  la moneda limpia y las cinco poses de manos se distinguen.
- Suite completa: **870/870 tests** en 64 archivos.
- Build `CLIENT=hermes-cochi`: limpio; integridad y schema-sync pasan. El build
  transforma 495 módulos y publica sólo los dos WebP activos del Core.
- ESLint focalizado: 0 errores; tres warnings preexistentes de Fast Refresh.
- Producción sigue READY en el commit `18c5ae4`; esta identidad no se desplegó
  porque Ricky no pidió deploy.

### Pendiente inmediato

1. Ricky debe revisar la versión articulada en la vitrina. Si cambia una pose,
   ajustar sólo sus transforms en `dico.css`, no generar otro cuerpo.
2. Después de aprobarla, usar esta mirada neutral como master para cualquier
   estado nuevo. No volver a espejar pupilas ni introducir diferencias de
   altura entre ojos.
3. No migrar aún las siete escenas heredadas: siguen fuera del flujo operativo
   y convertirlas antes de necesitar una escena concreta crea arte descartable.
4. El bloque general siguiente continúa siendo tokens + piloto `/registro`.

### Bloqueado por Ricky

Sólo aprobación visual y decisión de deploy. No hay bloqueo técnico.

### Trabajo local vivo — no pisar

Al cerrar esta sección no debe quedar trabajo local: rostro, sprites, CSS,
tests y documentación se entregan juntos en un único commit. Los PNG generados
durante la separación quedaron fuera del repo; sólo entra el WebP final.

---

## 25/ago/2026 — Dico Core deja la identidad Monopoly (sesión Codex)

Ricky entregó una directriz de marca nueva que reemplaza una decisión tomada
horas antes: galera, bigote y nariz ya no son anatomía canónica. Dico Core debe
ser reconocible como moneda + rostro modular + brazos + guantes, sin piernas,
mejillas ni pecas. Se implementó sin romper los cinco estados públicos.

### Hecho

- `CaraDeTinta.jsx` ahora es una sola anatomía SVG modular: cejas, ojos,
  scleras, pupilas, brillos, párpados y bocas son piezas independientes. Se
  quitaron bigote, nariz, rubor, gota y signo de pregunta flotante.
- `DicoCara` conserva `idle`, `esperando`, `contento`, `preocupado` y
  `pregunta`. Sumó mirada paramétrica limitada (`lookX`/`lookY`, -1…1), tres
  frames opcionales de boca (`speakingFrame`: closed/mid/open), `className`,
  `style` y `data-dico-core` para poder desplazarlo/recortarlo dentro del futuro
  DicoSlot.
- `dico.css` reemplazó salto, squash, encogimiento, gota y balanceo amplio por
  boya mínima, parpadeo natural y micro-sacadas. `prefers-reduced-motion` sigue
  dejando todo quieto.
- Se generó a partir del cuerpo existente un Core sin galera, con centro vacío
  y alfa real. El derivado activo quedó en `poses/moneda.webp` (800×800,
  98.684 bytes). El cuerpo anterior se archivó como
  `poses/moneda-retro-galera.webp` y el glob exacto de `DicoCara` no lo carga.
  La edición se hizo con imagegen integrado y luego se optimizó a WebP.
- `DicoAvisos` usa `lookX={0.55}` para mirar hacia el mensaje en vez de mover
  el cuerpo entero.
- Se creó `DicoCoreEscena`: conserva burbuja + personaje + CTA pero monta el
  Core modular, sin importar los siete renders viejos. El vacío operativo real
  de `ProductsPanel` ya lo usa y Dico mira hacia el CTA con `lookY`.
- `DicoEscena` queda explícitamente como compatibilidad narrativa heredada para
  campañas/Retro Moments. Sus siete poses con identidad anterior sólo aparecen
  en la sección histórica de la vitrina; no están en el flujo operativo.
- La vitrina muestra mirada paramétrica, estados a 30/48/120 px, Core operativo
  y poses heredadas separadas. También se corrigió su layout móvil.
- Se actualizaron `PLAN-DICO.md`, `BRIEF-DICO-CUERPO.md`, el README de poses y
  las reglas del Design System para que Claude no restaure la identidad vieja.

### Por qué se separó `DicoCoreEscena`

Cambiar solamente la cara chica dejaba dos mascotas simultáneas: el aviso nuevo
sin accesorios y, debajo, el vacío de Productos con galera/bigote. Además,
importar `DicoEscena` desde Productos metía siete WebP narrativos en producción.
El wrapper Core evita ambas cosas sin romper la API histórica. El build final
transforma 494 módulos y publica sólo `moneda.webp`; ya no lista los siete
`escena-*.webp` que listaba antes de esta separación.

### Verificado

- Navegador real en la vitrina: escritorio y viewport 390×844, fondos claro y
  oscuro, tamaños 30/48/120/190, mirada paramétrica y vacío operativo. La cara
  queda centrada, los estados se distinguen y no hay halo visible ni desborde
  móvil.
- Suite completa: **869/869 tests** en 64 archivos.
- Build `CLIENT=hermes-cochi`: limpio; integridad y schema-sync pasan.
- ESLint focalizado: 0 errores; cuatro warnings preexistentes de Fast Refresh
  por exportar constantes junto a componentes.
- No se desplegó: Ricky pidió implementar/revisar, no deployar.

### Pendiente inmediato

1. Ricky debe aprobar visualmente el Core en la vitrina
   `http://localhost:5199/?escena=dico`. Si cambia proporciones de ojos o boca,
   hacerlo en esta única anatomía antes de producir más arte.
2. No regenerar las siete poses heredadas todavía. Migrarlas sólo cuando una
   campaña o escena real las necesite; hoy no forman parte de producción.
3. DicoSlot sigue futuro: la API ya admite desplazamiento/recorte, pero falta
   diseñar Blue → Gold, emerger/ocultar y el botón accesible “Ocultar Dico”.
4. El siguiente bloque general continúa siendo el núcleo de tokens y piloto
   `/registro` documentado en `DICO-DESIGN-SYSTEM-V0.1.md`.

### Bloqueado por Ricky

Nada técnico. Sólo aprobación visual antes de extender esta identidad a nuevo
arte narrativo.

### Trabajo local vivo — no pisar

No queda trabajo a medias. Código, asset, tests, vitrina y documentación forman
un único cierre. La vitrina local queda disponible para revisión.

---

## 25/ago/2026 — Dico Design System v0.1 inventariado (sesión Codex)

Ricky pidió dejar de decidir la interfaz por pantalla y construir el primer
sistema visual desde el código real. El inventario y las decisiones quedaron
en `platform/DICO-DESIGN-SYSTEM-V0.1.md`.

### Hecho

- Se auditaron `admin-tokens.css`, `hermes-tokens.css`,
  `catalog-pro/tokens.css`, `Signup.jsx`, `DicoCara.jsx`, `DicoAvisos.jsx`,
  `roles.js` y `registry.js`.
- Apareció una cuarta autoridad que el listado inicial no incluía:
  `src/index.css` tiene un `@theme` propio. `Signup.jsx`, con 44 estilos inline
  y cero tokens, funciona además como una quinta fuente informal.
- Línea de base: en los ocho archivos pedidos hay 104 hex y 68 valores únicos;
  en todo `src/` hay 1.077 apariciones, 233 hex únicos y 3.346 atributos
  `style=`. Estos valores sirven para que un guard futuro impida deuda nueva
  sin pretender arreglar todo de una vez.
- Se eligió el archivo global existente `src/styles/hermes-tokens.css` como
  núcleo. No se crea un cuarto/quinto archivo central: ahí vivirán primitivas
  `--ds-*`, semántica y contratos de componente.
- `admin-tokens.css`, `catalog-pro/tokens.css` y `index.css @theme` se migran
  mediante aliases/adaptadores. `.cp-root` y los tres temas del catálogo se
  conservan porque son parte viva del theming multi-tenant.
- Se conservaron como base de marca `#E8B947`, DM Sans, Instrument Serif y la
  neutralidad cálida de carbón/noche. `#F59E0B` deja de mezclar marca con
  warning; el zinc frío no será el neutral global.
- Se cerraron las escalas v0.1: spacing 4/8/12/16/24/32, radios 4/6/8/12,
  tipografía 11/13/15/18/24 + métrica 28 y densidades compact/default/touch
  con alturas 34/40/48 para inputs y botones.
- Se documentaron reglas y slots de Dico: uno por pantalla, cinco estados,
  nunca reemplaza texto ni compite con el CTA, respeta reduced motion y sólo
  aparece en vacío, asesor, onboarding o confirmación.
- El primer piloto será `/registro`, sólo presentación: no cambia lógica,
  campos, validaciones, payload ni rutas. El segundo será Caja/POS.

### Verificado

- El inventario se contrastó con imports y consumidores reales del repo.
  `--ag-*` y `.cp-root` están vivos; no se encontraron consumidores de
  `--hg-*`/`.hg-*` fuera de su archivo ni imports actuales de los seis
  componentes UI que declaran usar el `@theme`.
- `git diff --check`: limpio antes del cierre.
- No hubo cambios de runtime, tests ni deploy: esta sesión produjo una
  especificación basada en código, no una implementación.

### Pendiente inmediato

1. Implementar las tres capas `--ds-*` dentro de `hermes-tokens.css`, dejando
   aliases de compatibilidad; todavía no retirar tokens vivos.
2. Mapear `index.css @theme` al núcleo.
3. Hacer el piloto visual de `/registro` con CSS scoped y verificar todos sus
   estados a 390 px y desktop, teclado, foco y contraste.
4. Recién después validar Caja/POS y congelar los valores v0.1.
5. Agregar un guard incremental: la línea de base de hex/medidas puede bajar,
   nunca crecer.

### Bloqueado por Ricky

Nada. La implementación del piloto puede empezar con el documento aprobado;
si Ricky quiere cambiar marca, escalas o ubicación de Dico, conviene hacerlo
antes de migrar `Signup.jsx`.

### Trabajo local vivo — no pisar

No queda trabajo a medias. El documento v0.1 y este handoff forman un cierre
documental; no se modificó código de producción.

---

## 25/ago/2026 — Dico grande para estados vacíos (sesión Codex, trabajo local)

Se separaron los dos usos del personaje para no cargar ilustraciones pesadas
en cada aviso del panel:

- **`DicoCara`** sigue siendo el Dico chico y animado de `DicoAvisos`.
- **`DicoEscena`** es nuevo: usa poses completas en altas, estados vacíos y
  momentos con espacio.

### Hecho

- Siete poses fuente quedaron archivadas como WebP de 800×800, con
  transparencia y entre 85–98 KB: `idle`, `explica`, `pregunta`, `descubre`,
  `celebra`, `senala` y `fatal`. `fatal` no se usa para errores comunes.
- `BurbujaDico` conserva texto HTML, tipeo y accesibilidad, pero ahora toma el
  lenguaje visual elegido por Ricky: marco irregular, cola inferior adaptable
  y trama de imprenta generada con CSS. No usa la imagen de referencia como
  fondo rígido.
- El estado vacío real de `ProductsPanel` usa `DicoEscena pose="senala"`, dice
  “Empecemos por tu primer producto…” y abre el editor con el CTA que Dico
  señala. Se eliminó el CTA duplicado que estaba arriba del vacío.
- La vitrina de Dico muestra la escena real, las siete poses y los cinco estados
  chicos sobre fondos claro y oscuro.
- Las skills `/dico` y `/cerrardico` ahora declaran explícitamente que
  `platform/HANDOFF.md` es el canal Codex ↔ Claude y que no se pisan archivos
  locales vivos.

### Verificado

- Vitrina inspeccionada con Chrome real a 1365 px y 390 px: la cola cae sobre
  Dico, el dedo termina en el CTA y no hay desborde móvil.
- `npx vitest run --maxWorkers=2`: **858/858 tests**.
- ESLint focalizado: limpio.
- `CLIENT=hermes-cochi npm run build`: limpio; integridad y schema-sync pasan.
- No se desplegó.

### Cuerpo neutro definitivo (01:12)

- Ricky entregó el cuerpo final vacío con moneda, galera, brazos y guantes.
  Quedó optimizado a WebP 800×800 con alfa, **87 KB**, en
  `src/components/dico/poses/moneda.webp`.
- Se verificaron los cinco estados de `DicoCara` a 30, 48 y 120 px, sobre claro
  y oscuro, con Chrome real en desktop y móvil. La cara ya queda centrada: no
  fue necesario recalibrar `CAMPO`.
- Los brazos se conservan. A 30 px siguen leyendo como silueta del personaje y
  a 48/120 px evitan que parezca sólo un ícono de moneda.
- Verificación final de este reemplazo: test focalizado **3/3** y build
  `CLIENT=hermes-cochi` limpio (integridad y schema-sync incluidos).

### Cara canónica única (01:31)

- Ricky detectó en la vitrina que `DicoCara` todavía parecía otro personaje:
  tenía ojos y una boca en W, pero no la nariz ni el bigote del Dico grande.
- Se corrigió la única fuente de identidad, `CaraDeTinta.jsx`: ahora ojos con
  doble brillo, nariz redonda y bigote blanco permanecen en los cinco estados.
  Sólo cambian cejas, mirada y boca. No se agregaron PNG por estado.
- El mismo SVG se usa automáticamente en 30, 48, 96, 120 y 190 px, sobre el
  único cuerpo `moneda.webp`. La vitrina lo muestra sobre claro y oscuro.
- Se agregó un guard de estructura para que ningún cambio futuro quite
  `.dico-bigote` o `.dico-nariz`: test focalizado **4/4**. Build limpio;
  ESLint focalizado sin errores (quedan las dos advertencias preexistentes por
  exportar `CAMPO` y `ZONA` junto al componente).

### Expresiones y entrada corregidas (01:42)

- `preocupado`: las cejas subieron y abren hacia el centro; ya no pisan los
  ojos ni durante el parpadeo.
- `contento`: se retiraron las tres rayitas de cada pómulo. Conserva ojos
  cerrados, bigote y boca abierta.
- `esperando`: muestra tres puntos secuenciales centrados y con aire sobre la
  galera, legibles también a 30 px. Se eligió
  esto en vez del reloj porque brazos y manos todavía forman parte del mismo
  WebP; fingir un reloj sin separar capas quedaría rígido.
- `entrada`: se reemplazó la caída/compresión por una vuelta 3D. Primero se ve
  el cuerpo neutro oscurecido y sin cara (lee como espalda); al girar aparece
  la tinta y recupera la luz. La copia de la vitrina también fue actualizada.
- Vitrina inspeccionada en varios frames del giro y en los cinco estados.
  Test focalizado **5/5**, build limpio y ESLint sin errores.

**Brazos:** hoy están fusionados con `moneda.webp`, por lo que sólo se mueven
con el cuerpo entero. Si se decide animarlos de forma independiente, el asset
correcto es cuerpo sin brazos + brazo izquierdo + brazo derecho transparentes.
En reposo conviene un balanceo mínimo; los gestos grandes se reservan para
acciones como saludar, señalar o mirar un reloj.

### Burbuja integrada al panel real (02:01)

- `DicoAvisos` ya no dibuja una lista de tarjetas. Usa el Dico chico con la
  cara correspondiente y un único `BurbujaDico`; desde ahí se puede ejecutar
  el CTA, cerrar o avanzar con “hay N más”. La expresión cambia junto con la
  gravedad del mensaje.
- La vuelta de entrada ocurre sólo la primera vez que aparece el asesor
  compacto en ese dispositivo. Se registra en `localStorage` con la clave
  `dico:primera-entrada:v1`; los ingresos siguientes no repiten el efecto.
- El aviso `catalogo-vacio` se omite sólo en `PlatformAdmin`, porque ese caso ya
  está resuelto inmediatamente debajo por la escena grande de Dico señalando
  “+ Agregar producto”. Así no aparecen dos Dicos diciendo lo mismo.
- La vitrina ahora incluye el componente real con tres casos conmutables:
  alerta + aviso siguiente, sólo espera y negocio sin avisos. El último no deja
  hueco en el panel.
- Verificación de navegador: navegación entre los dos avisos, CTA, espera y
  ausencia de aviso; composición sin desborde en el ancho angosto de 499 px.
- Verificación automatizada: **866/866 tests**, incluidos seis de integración
  nuevos para `DicoAvisos`; build `CLIENT=hermes-cochi` limpio con integridad y
  schema-sync. ESLint focalizado sin errores; sólo warnings preexistentes de
  `PlatformAdmin.jsx`.
- Revisión final de Ricky: la cola del globo llegaba a tocar el CTA. El SVG baja
  24 px fuera de su caja pero el pie empezaba a 10 px; `burbuja.css` ahora deja
  28 px. Se verificó en la vitrina con el texto completo: cola, botón y enlace
  quedan separados.
- Cierre aprobado: bloque completo commiteado, pusheado y desplegado por CLI a
  producción; el deployment de `hermes-platform` quedó confirmado en `READY`.

### Pendiente inmediato

1. Esperar la próxima tarea de Ricky: este bloque de Dico está cerrado.
2. Los brazos quedan para una etapa posterior; no separarlos salvo que una tarea
   nueva lo pida explícitamente.

### Trabajo local vivo — no pisar

No queda trabajo local de Dico a medias. El código, los assets, la vitrina, los
tests, los briefs, `AGENTS.md` y las skills de continuidad forman parte del
mismo cierre y quedaron versionados juntos.

---

## 24/ago/2026 (cierre) — HAY PROSPECTO: se corta la consola y se mira el sistema

Ricky consiguió el primer prospecto real, **de gastronomía**. Según el plan
v1.1 eso dispara el PRODUCTO, no la consola: la Fase 2 (cobrar) espera una
venta cerrada. Se paró el desarrollo de la consola y se recorrió el camino
crítico de gastro antes de mostrárselo a nadie.

### El bug grande: el trigger de la 0058 era casi código muerto

`orders.paid_at` lo escribe **únicamente `mp-webhook`** — el camino de
MercadoPago y nada más. Un bar que cobra en efectivo por mostrador no pasa por
ahí: `complete_order` asienta la venta en `sales` y `paid_at` queda en null.

O sea que para **el caso más común de gastronomía** el primer valor no se
marcaba nunca. Y el síntoma era peor que un error: el panel decía «0 llegaron al
primer valor» con total seguridad.

**Migración 0059** — entra por los tres caminos:

| Camino | Tabla |
|---|---|
| MercadoPago | `orders.paid_at` / `payment_status` |
| Cobro en caja | `payments` |
| `complete_order` y venta manual | `sales` ← **el que faltaba, y el más transitado** |

**Corrección al dato de la sección anterior:** no era cero. Con el backfill
correcto, **La Nona Pato llegó al primer valor el 18/ago**. Es 1 de 7. El número
que reordenó el plan estaba mal por mi propio trigger incompleto.

Dato nuevo que apareció: **Cochi creó un pedido el 20/ago y nunca lo completó.**

### Lo que se verificó del camino crítico, y cómo

| Qué | Cómo se verificó | Resultado |
|---|---|---|
| Alta de un negocio | Consulta sobre `tienda-nueva`, nacida del alta self-service | **Sana**: dueño, settings, 3 medios de pago y sucursal se crean solos |
| `get_catalog` | RPC contra la base | 10 productos + settings |
| Catálogo público | **Navegador contra `cochi.divianco.app`** | Anda: productos, precios, filtros, recomendaciones, pie legal |
| Comprar con teclado | Auditoría de elementos focusables en producción | Los 10 «Agregar al carrito» son `<button>`: **se puede comprar** |
| Abrir el detalle con teclado | Lo mismo | **No se podía** → arreglado |

### El bug del catálogo

Las tarjetas de la carta eran `<div onClick>` sin `role` ni `tabIndex`. Con
mouse abren el detalle del producto; con teclado no existen. Se podía agregar al
carrito —ese sí es un `<button>`— pero no abrir el producto para leer la
descripción ni las aclaraciones.

Helper `abrible()` en `src/catalog-pro/atoms.jsx`, aplicado en las **cuatro**
tarjetas (HomeScreen ×2, CategoryScreen ×2) en vez de repetir el arreglo cuatro
veces. Incluye `preventDefault` en Space: en un div focusable la barra
espaciadora scrollea, y sin eso la carta se va saltando mientras se intenta
abrir un producto. 6 tests.

### También en esta sesión

**El alias corporativo se dio de baja (0057).** Necesitaba una routing rule de
Cloudflare y ese permiso no está en el token. El staff entra con su **correo
personal**. `staff_dominios` se dropeó. −1050 líneas netas. La protección del
alta sigue siendo la de siempre: sólo el dueño da de alta.

**Fase 0 y 1 del plan v1.1 (0058).** Primer valor, `organizations` +
`organization_id` (vacío a propósito), `consola_log` por trigger con retención
como **parámetro** y no como constante del esquema, y la pestaña «Hoy».

### Cuatro cosas que los papeles daban por rotas y estaban hechas

Esta sesión encontró una más: **`src/modules/registry.js` existe** y
`PlatformAdmin` ya ramifica por rubro (módulos, terminología, campos). La skill
`/dico` decía que una barbería veía «Recetas» y el filtro «Vegetariano». Ya está
corregida.

Van cuatro en tres días (formulario de contraseña, `og:` tags, module registry,
y el «cero primer valor» de hoy). **El patrón no es de documentación: es de
afirmar inferencias como hechos.** Comprobar antes de reportar.

### Verificado / no verificado

**Verificado en producción:** el catálogo público de Cochi con el navegador.
**Verificado contra la base:** el alta, `get_catalog`, los tres caminos del
primer valor y el backfill.
**Sólo compila:** el panel «Hoy» con datos reales — se vio en la vitrina, no en
producción.
**Nunca se probó:** MercadoPago contra una cuenta real. Cero integraciones
conectadas. Es el hueco más grande del camino crítico.

855 tests, build limpio, los cuatro checks del pre-commit pasan.

### Pendiente inmediato

1. **Deployar** (`npm run deploy`) — hay 3 migraciones aplicadas y código sin
   subir.
2. **Ricky recorre el camino con plata real**: alta → 3 productos → pedido desde
   el catálogo → cobro con MercadoPago. Es lo único que no se puede verificar
   sin una cuenta de verdad, y es justo lo que nunca se probó.
3. Arreglar lo que aparezca de ahí, **antes** de mostrárselo al prospecto.
4. Fase 2 del plan (cobros de suscripción) **sólo cuando la venta esté cerrada**.
   Ojo: `payments` ya existe con otro significado —los pagos del comprador al
   negocio— así que la tabla de cobros de Dico necesita otro nombre o rompe el
   checkout.

### Bloqueado por Ricky

- **El deploy** (el clasificador bloquea el comando de Vercel).
- **El recorrido con plata real.** Requiere una cuenta de MercadoPago conectada;
  no la puedo cargar yo.
- **`https://divianco.app/consola` en Redirect URLs** de Supabase Auth — sigue
  pendiente de la sesión del 20/ago.
- **Leaked password protection** en el edificio, un clic.

---

## 24/ago/2026 — FASE 0 Y 1 DEL PLAN v1.1 (migración 0058)

Sale del debate sobre la ruta de la consola. El plan v1.1 está en el artifact
«Ruta de la Consola»; esto es su primer tramo.

### El número que reordenó todo

Al aplicar la migración, la primera consulta contestó lo que el edificio nunca
había podido contestar:

**7 negocios · 3 crearon un pedido · CERO lo cobraron.**

> **Corregido el mismo dia (0059): el numero estaba MAL.** El trigger de esta
> migracion solo miraba `orders.paid_at`, que escribe unicamente mp-webhook.
> Con el backfill por los tres caminos, La Nona Pato tenia primer valor desde
> el 18/ago. Ver la seccion del 24/ago (cierre).

Ni siquiera los tres emprendimientos propios. Y son propios: Cochi, La Nona Pato
y Mala Miga **no son clientes** —son emprendimientos de Ricky— y además operan
sobre el sistema VIEJO. El edificio tiene un pedido en toda su historia.

O sea: el embudo no está flojo en la punta del pago. Está vacío de principio a
fin. Por eso la Fase 1 dejó de ser «cobrar» y pasó a ser «activar».

### Lo que se construyó

**Primer valor** (`tenants.first_value_at`). `first_order_at` marcaba el primer
pedido CREADO: alguien probó. Esto marca el primero COBRADO: alguien puso plata.
Confundirlos hace que un negocio que probó una vez y se fue figure como
arrancado.

**El rubro no cambia cómo se detecta, sólo cómo se llama.** Un turno de barbería
ya es un `order` con `resource_id` — la arquitectura unificó las operaciones, y
esto se apoya en eso en vez de pelearlo. El nombre por rubro vive en
`src/modules/panelDeHoy.js`.

**La capa de arriba del negocio** (`organizations` + `tenants.organization_id`).
Vacía a propósito. Lo caro es la forma: hoy son diez líneas, con clientes
adentro es una migración.

**El registro de la consola** (`consola_log`). No es `audit_log` (0043): aquel
audita lo que pasa DENTRO de un negocio y lo mira el negocio; éste audita lo que
Divianco le hace a un negocio y lo mira Divianco. Por trigger, no desde la
pantalla — un log que escribe el cliente es un log que el auditado puede no
escribir.

**La retención va como parámetro, no en el esquema.** `purgar_consola_log(dias)`
recibe el plazo. En la v1.0 del plan yo había escrito «24 y 36 meses» como
práctica de la industria; salía de un solo artículo y no lo es. Un número
copiado no puede convertirse en requisito de arquitectura.

**Panel del fundador** (pestaña «Hoy»). Los seis números y la lista de qué
resolver hoy. Cálculos en `src/modules/panelDeHoy.js`, puros y testeados.

### La regla del panel

**Ni una fila se carga a mano.** Nada de prospectos ni demos: esos datos no
tienen sistema de registro y una pantalla para tipear lo que ya sabés es trabajo
que no rinde. Con doce prospectos eso es una planilla.

Queda escrito en el módulo para quien quiera agregarle algo: **si una fila pide
que la cargues, el panel se rompió.**

### Dos decisiones de diseño que valen

**«Se apagó» y «nunca prendió» son cosas distintas.** La alerta de inactividad
sólo aplica a quien ya había llegado al primer valor. Mezclarlos esconde a los
dos: el que nunca arrancó necesita una llamada de arranque, no una de rescate.

**La demora al primer valor va en MEDIANA.** Con pocos negocios, uno que tardó
medio año corre el promedio y hace parecer que el producto no se entiende cuando
el resto arrancó en dos días.

### Lo que NO se hizo, y por qué

**No hay tabla de cobros de suscripción.** Con cero clientes sería una tabla
vacía por tiempo indefinido. Y hay una trampa que casi cuesta caro: **`payments`
YA EXISTE** con otro significado —los pagos del COMPRADOR al negocio—, así que
reusar ese nombre habría roto el checkout. Se hace cuando haya una venta
concreta sobre la mesa; es cuestión de días.

### Verificado

En la vitrina, con los siete negocios reales y sus fechas. La escena destapó un
bug de datos: decía `vertical: 'barberia'` y la base usa `'barber'`, así que la
barbería mostraba «primera operación cobrada» en vez de «primer turno cobrado».
Corregido — y es justo el tipo de error que sólo aparece mirando la pantalla.

849 en verde (18 nuevos), build limpio, los cuatro checks pasan.

### Lo que sigue

Fase 2 (cobrar) **cuando haya una conversación real de venta**, no antes. Y el
plan tiene un alto explícito: **congelamiento del desarrollo funcional hasta
tres clientes pagos**.

---

## 21/ago/2026 (cierre 4) — SE DA DE BAJA EL ALIAS CORPORATIVO (0057)

**−1050 líneas netas.** El alta de staff vuelve a ser lo que era: se pone el
correo de la persona, le llega la invitación, elige su contraseña, entra.

### Por qué se descarta

El alias corporativo necesitaba DOS cosas de Cloudflare: un **destino** —que se
pudo crear siempre— y una **routing rule**, que es la que hace que el alias
entregue. Ese permiso (Zone → Email Routing Rules: Edit) no está en el token y
no apareció forma de conseguirlo.

Sin la regla el alias existe y no entrega: la invitación se pierde en silencio y
vence a las 24 horas. Cuatro intentos, ninguno cerró el ciclo.

**El correo de trabajo no se descarta como idea; se descarta como REQUISITO para
dar de alta.** La cuenta de la consola y el correo de la empresa son dos cosas
distintas y no tenían por qué estorbarse. Si algún día aparece el permiso, el
alias se crea en Cloudflare a mano y nada de esto cambia.

### Qué se borró

| | |
|---|---|
| `src/modules/correoDeEquipo.js` + su test | ya no hay alias que validar |
| Toda la capa de Cloudflare en `staff-invite` | `cf()`, permisos, zona, destinos, reglas, catch-all, sonda, diagnóstico |
| El alta de tres pasos en la consola | vuelve a ser un correo, un puesto y un botón |
| `staff_dominios` (tabla) | sin la exigencia de dominio no la lee nadie, y una tabla que nadie consulta es una que en seis meses alguien lee creyendo que decide algo |
| La cuenta huérfana `camila.gonzalez@grupodivianco.com` | la había creado la prueba: staff, sin legajo, invitación a un alias que no entregaba |

**La protección del alta no era la lista de dominios**: es que sólo el dueño
puede dar de alta (`private.es_owner_divianco()`), y eso no cambió. La lista
filtraba la FORMA del correo, no quién lo daba de alta.

### Lo que se conserva, y vale

Puestos, modalidad, legajo, ficha, foto de perfil. Nada de eso dependía del
alias. **"Reenviar acceso"** queda en la fila de cada persona: sirve para quien
olvidó la clave y para quien no recibió la invitación.

### Lo que NO se borró, y casi

Al limpiar borré `tools/vitrina/escenas/equipo.jsx` creyendo que era del equipo
de Divianco. Es del equipo del NEGOCIO CLIENTE —otra pantalla, otro modelo—.
Restaurada con `git checkout`. Dos nombres parecidos en dos productos distintos:
vale releer qué es cada archivo antes de borrarlo, no sólo cómo se llama.

### Verificado

En la vitrina: un correo, un puesto, "Enviar invitación", y la persona aparece
en la lista. Cero menciones a Cloudflare o a alias en la pantalla.

830 en verde (14 menos: se fueron los del alias), build limpio, los cuatro
checks pasan, `staff-invite` typechequea.

---

## 21/ago/2026 (cierre 3) — "EL CORREO NO PARECE VÁLIDO": una barra invertida

Sin migración. Un bug propio, y una limpieza que NO había que hacer.

### El bug

El alta rechazaba los cuatro correos de prueba de Ricky con "Ese correo personal
no parece válido". El patrón, en `crear_correo`, había quedado así:

```
/^[^@s]+@[^@s]+.[^@s]+$/
```

Le faltan las barras invertidas. `[^@\s]` —"cualquier cosa que no sea arroba ni
espacio"— se convirtió en `[^@s]`, que es **una clase que excluye la letra s**.
Los cuatro correos de prueba tienen una s. Casi cualquier correo tiene una s.

**Cómo se rompió:** ese bloque se reescribió con un script de node metido en un
heredoc de bash. Tres capas de escapado —bash, template literal de JS, regex— y
las barras se perdieron en el camino. El typecheck no lo ve: la regex es válida,
sólo significa otra cosa.

**Regla que queda:** un patrón nunca se escribe atravesando capas de escapado.
Va con Edit sobre el archivo, y punto. Es la segunda vez en el día que el
escapado muerde (la otra fue el rango de tildes en `correoDeEquipo.js`, que ahí
sí se detectó a tiempo).

**Arreglo de fondo:** el patrón estaba a mano en TRES lugares. Ahora hay una sola
constante `ES_EMAIL`. Tres copias de una regex es tres oportunidades de que una
se rompa distinto que las otras.

### La limpieza que no se hizo, y por qué

Ricky pidió limpiar cuatro correos de prueba. Antes de borrar, se miró qué eran:

| Correo | Qué es |
|---|---|
| `rrodriguezs777@gmail.com` | **Dueño de SEIS tenants**: Cochi, La Nona Pato, Mala Miga, Tienda Demo, Barbería Demo y Prueba Disco |
| `ricardousa1313@gmail.com` | Dueño de `tienda-nueva` |
| `camilausa333@gmail.com` | No existe como usuario |
| `ricardoars13@gmail.com` | No existe como usuario |

Borrar el primero habría dejado **seis negocios sin dueño**, incluidos los tres
que están en producción. Nadie podría entrar a sus paneles.

Y no hacía falta ninguna limpieza: la base tiene 1 staff (el dueño), 1 legajo y
3 usuarios. Los correos no estaban en `platform_admins` ni eran destinos de
Cloudflare —Ricky ya los había borrado de ahí—. **Lo único que bloqueaba era la
regex.**

Vale como recordatorio del criterio: mirar el objetivo antes de borrarlo no es
burocracia. Acá la diferencia entre mirar y no mirar era producción.

---

## 21/ago/2026 (cierre 2) — EL ALTA, SIN FRENOS

Sin migración. Se sacó todo lo que frenaba el alta del correo, porque frenaba
mal.

### El dato que cambió el diagnóstico

Ricky contó que ANTES de estos cambios el ciclo funcionaba: cargaba el correo
personal y el alias, le llegaba la verificación, la aceptaba, y **el alias
quedaba andando** — probó mandándole un mail y llegó.

Eso no encaja con "el token no puede escribir reglas"… salvo por una cosa: **el
catch-all**. Una regla que se lleva todo lo que no matchea ninguna otra hace que
CUALQUIER alias del dominio entregue, sin regla propia.

Y ahí estaba mi error: `catchAllDe()` se tragaba cualquier excepción y devolvía
`{activo: false}`. Si al token le falta permiso para leerlo —que es plausible,
es el mismo permiso de zona que falla al escribir— el diagnóstico decía
**"catch-all: apagado"** con total seguridad, y mandó a buscar el problema donde
no estaba.

Ahora devuelve `ilegible: true` con el motivo. **"No hay catch-all" y "no lo
puedo leer" son dos cosas distintas**, y tragarse un error para devolver un
valor cómodo es fabricar una mentira que después alguien usa para decidir.

### Lo que hace ahora, y nada más

1. Si el destino no existe, lo crea. **Eso es lo único que dispara el mail.**
2. Intenta la regla y, si no puede, **sigue igual**.
3. Devuelve el estado real.

El segundo botón dejó de ser un chequeo y pasó a ser **"Ya lo verifiqué,
seguir"**: una confirmación del dueño, que mira Cloudflare y decide. Es el único
que puede — la API no confirma un destino por su dueño, y el catch-all no
siempre se puede leer. Al lado, **"Reenviar el mail"**.

**El guard de la invitación se sacó entero.** Consultaba Cloudflare y frenaba si
la dirección no figuraba recibiendo correo: con el catch-all ilegible veía "no
recibe" donde sí recibía, y bloqueaba altas sanas. Si el mail no llega, el
remedio está a mano (Reenviar); eso es más barato que un chequeo que se
equivoca.

### El bug que Ricky reportó

"Ahora ni siquiera manda el correo." Era esto: `camilausa333@gmail.com` **ya
estaba cargado como destino** de la prueba anterior, así que Cloudflare no
mandaba nada —correcto— y la pantalla **no lo decía**. Parecía un botón muerto.

Ahora los tres casos hablan:

| Estado del destino | Qué dice la pantalla |
|---|---|
| No existe | "Le mandamos un mail a X para que confirme el reenvío." |
| Existe, sin confirmar | "Ya estaba cargado y sin confirmar. No se manda otro mail automáticamente: usá Reenviar si no le llegó." |
| Existe y confirmado | "X ya está confirmado en Cloudflare." → va directo a dar el acceso |

También se sacó el cartel que afirmaba "ya reenvía a X": la regla es
best-effort, así que prometerlo era prometer algo que no se puede comprobar.

### Verificado

Los tres casos en la vitrina, con el fake simulando que el token NO puede
escribir la regla — que es el escenario real. 844 en verde, build limpio,
`staff-invite` typechequea.

### Si igual molesta

Queda dicho para no volver a discutirlo: si el alias sigue dando problemas, la
salida es **dar de alta con el correo personal**. `staff_dominios` es una tabla:
alcanza con sumarle el dominio del correo, o con sacar la validación de dominio
del alta. No es una reescritura, es un insert.

---

## 21/ago/2026 (cierre) — LA FICHA: el dueño puede VER lo que junta

Migración **0056**, aplicada. Cierra un agujero que abrió la 0054 y que no se
veía: el edificio pedía fotos de documentos y CBUs, y **no había pantalla para
leerlos**. Peor que no juntarlos — el riesgo de guardarlos estaba y el beneficio
no.

### Lo que se agregó

**Foto de perfil, opcional.** Una burbuja arriba del formulario. No entra en
"está completo": trabar una incorporación por una foto de perfil sería trabarla
por lo único que no importa. Va al mismo bucket privado que el documento —
podría ser pública, una cara no es un DNI, pero un segundo bucket con otras
policies es una segunda superficie donde equivocarse.

**Ficha del empleado, en Equipo → "Ver legajo".** El dueño abre a cualquiera y
ve identidad, documento (con las fotos), domicilio, contacto y cobro. Una sola
abierta a la vez: dos pantallas de datos sensibles al mismo tiempo son dos
pantallas a la vista de quien pase por atrás.

**Es SOLO LECTURA, y es a propósito.** Un CBU que puede cambiar alguien que no
es su titular es un sueldo que se puede desviar sin que la persona se entere; y
un documento que otro puede reemplazar deja de servir como prueba de nada. Si
hay un dato mal, lo corrige quien lo cargó.

### La vista `staff_fichas`

La ficha necesita el EMAIL de cada persona (`platform_admins`) junto al estado
de su legajo (`staff_legajo`). Se resolvió con una vista y no con un join desde
el cliente porque PostgREST exigiría una FK declarada entre las dos tablas — y
esa FK no existe ni debería: `platform_admins` dice quién tiene acceso HOY, y
un legajo sobrevive a que alguien deje de tenerlo.

**`security_invoker = true` no es opcional.** Sin eso una vista corre con los
permisos de quien la creó, y cualquier staff vería el legajo de todos con sólo
consultarla. Con security_invoker cada uno ve lo que sus propias policies le
dejan: la persona lo suyo, el dueño todo.

### Verificado

En la vitrina, los tres estados que importan: Sofía con el legajo completo (la
ficha entera), Martín contratista e incompleto —con el cartel de que no puede
entrar y **sin sección de domicilio**, porque a quien factura no se le pide— y
la burbuja de foto diciendo "opcional" y sin aparecer entre los pendientes.

844 en verde, build limpio, los cuatro checks pasan.

---

## 21/ago/2026 (noche) — EL LEGAJO, CORREGIDO: pais, documento y modalidad

Migración **0055**, aplicada. Ricky revisó la pantalla del legajo y la
devolución cambió tres supuestos que la 0054 daba por ciertos.

### Los tres supuestos que se rompieron

| Lo que asumía la 0054 | Por qué está mal |
|---|---|
| El documento tiene dorso | Un **pasaporte no**. Exigirlo dejaba a la persona trabada sin manera de destrabarse: no hay foto que sacar |
| La identificación fiscal se llama CUIL | En Chile y Uruguay es RUT, en México RFC. Pedir CUIL a alguien de Colombia es pedirle un dato que no existe |
| Hace falta domicilio y teléfono | De quien **factura** su servicio, no. De esa persona hace falta con qué facturarle y a dónde pagarle |

### Empleado y contratista

Es la respuesta a "si tengo gente de Fiverr, ellos me facturan". Se agregó
`platform_admins.modalidad`:

- **En relación de dependencia**: legajo completo, con domicilio.
- **Factura sus servicios**: identidad, identificación fiscal y datos de cobro.
  Nada de domicilio ni teléfono — son datos personales que la empresa no
  necesita y frenan un alta que debería tomar dos minutos.

**La fija el dueño al dar el acceso, no la persona.** En qué relación está
alguien con la empresa es una decisión de la empresa, no una autodeclaración; y
por eso vive en `platform_admins` —que sólo escribe el dueño— y no en el
legajo, que lo edita la persona.

### El país

Se reusó la lista de `src/modules/paises.js` (los 9 países que ya declaraba el
alta de tenants) en vez de armar otra. Lo nuevo va en
`src/modules/documentacionPorPais.js`, que es **otra pregunta sobre el mismo
país**: aquel describe dónde opera un NEGOCIO (moneda, huso, adaptador fiscal),
éste qué papeles presenta una PERSONA.

Ojo con un detalle que se pasa fácil: en Argentina el identificador de una
empresa es CUIT y el de una persona es **CUIL**. `paises.js` declara el
primero; el legajo necesita el segundo.

Los países sin regla propia caen en una genérica —pasaporte o documento
nacional, IBAN y SWIFT— y usan el identificador que ya declaraba `paises.js`.
Adivinar mal la regla de un país es peor que preguntar genérico: un largo
equivocado rechaza datos correctos y la persona no tiene cómo saber por qué.

### El resto de la devolución

- Nombre y apellido en dos casillas.
- **La cámara se abre directo** (`capture="environment"`). En una computadora
  el navegador lo ignora y cae en el selector de archivos, que ahí corresponde.
- Contactos de emergencia **opcionales**, sin la aclaración de más y con las
  etiquetas completas. Son datos de un TERCERO que no dio su consentimiento.
- Los campos de una fila quedan **a la misma altura**: la ayuda ocupa lugar
  aunque esté vacía, así una etiqueta de dos renglones no escalona la grilla.
- **El CBU no anuncia "22 dígitos" pero los valida.** Se cuentan sólo los
  dígitos: la gente lo pega con espacios y guiones, y rechazarlo por eso es
  rechazar un dato correcto mal tipeado.
- **El titular de la cuenta se autocompleta con el nombre y no se edita**, salvo
  que se tilde "la cuenta es de una empresa". Depositar el sueldo de alguien en
  la cuenta de un tercero es la forma más silenciosa de que ese sueldo no
  llegue.
- Se sacó "podés guardar incompleto": el botón dice **Finalizar incorporación**
  y está apagado hasta que esté todo.
- Textos reescritos en registro formal.

### Al dueño no se le exige

Preguntó si él también tiene que cargarlo. **No, y no por comodidad**: si el
legajo lo bloqueara y algo fallara subiendo el documento, el único que puede
administrar accesos quedaría afuera y no habría quien lo destrabe. Mismo
criterio que 0053 con "al dueño no se lo puede quitar". Lo puede cargar cuando
quiera desde **Mis datos**, en la barra de la consola.

### Un error propio, y lo que enseña

**Pisé `src/modules/paises.js` entero con Write.** Ya existía, lo usa
`Signup.jsx`, y el build lo agarró con `MISSING_EXPORT`. Se recuperó con
`git checkout` y lo nuevo quedó en un archivo aparte — que además es el diseño
correcto, así que el error terminó mejorando la solución.

**La señal estaba y no la leí**: la herramienta contestó *"has been updated"* y
no *"created"*. Para la próxima: antes de escribir un módulo "nuevo", mirar si
el archivo ya existe.

### Verificado

En la vitrina: los 9 países en el selector, DNI mostrando dorso y pasaporte
haciéndolo desaparecer, México pidiendo RFC + IBAN + SWIFT en vez de CUIL +
CBU, y la escena `legajo-contratista` sin sección de domicilio.

25 tests del legajo, **844** en verde. Cuatro comparan el módulo contra la
migración parseando el SQL: los documentos con dorso, los campos que se piden
siempre, y que el domicilio sea exactamente lo que separa empleado de
contratista en los dos lados.

**Contra la base, nada todavía**: ninguna persona real completó un legajo.

---

## 21/ago/2026 (tarde) — PUESTOS Y LEGAJO: el alta de staff, completa

Migración **0054**, aplicada. El alta de un empleado de Dico pasó de "correo +
invitación" a las cuatro etapas del flujo que pidió Ricky.

### Las cuatro etapas

1. **Puesto.** Al dar de alta se elige: administrador, ventas, soporte o
   marketing. Decide qué ve la persona cuando entra.
2. **Correo de trabajo.** Alias en `grupodivianco.com` que reenvía a su correo
   personal, vía Cloudflare Email Routing. Sin cambios respecto de la mañana.
3. **Invitación** a ese correo: crea la cuenta y le pide elegir su contraseña.
4. **Legajo.** Apenas entra, la consola le pide sus datos y no la deja pasar
   hasta completarlos.

### Dos ejes que no son el mismo

`rol` (owner | staff) ya existía y contesta **quién reparte el acceso**. Sigue
habiendo un solo dueño (0053). `puesto` es lo nuevo y contesta **qué hace
adentro**.

Mezclarlos era tentador y caro: si el puesto decidiera también quién reparte
accesos, cada administrador podría nombrar administradores y el acceso volvería
a ser transitivo — justo lo que 0053 vino a cerrar. Por eso ningún puesto trae
la pestaña Equipo; la trae el dueño, sea cual sea su puesto. Hay un test que lo
fija para los cuatro.

### Qué puede cada puesto

| | Planes | Negocios | Equipo |
|---|---|---|---|
| Administrador | edita | edita | ve (si es dueño) |
| Ventas | lee | edita | — |
| Soporte | lee | **lee** | — |
| Marketing | lee | **nada** | — |

Soporte ve al cliente para poder atenderlo y no le mueve la suscripción: "me lo
dejaste sin cobrar" no puede salir de una pantalla de ayuda. Marketing no ve la
lista de negocios: quién es cliente y cuánto paga es el dato más delicado de la
consola y no hace falta para comunicar precios.

La matriz vive en `src/modules/rolesDeConsola.js` — misma división que 6f con
los roles del negocio: el DATO a la base, la POLITICA al código. **Lo que mueve
plata baja igual a RLS**: `plans` sólo lo escribe administrador, `tenants`
administrador y ventas. Esconder una pestaña no protege una tabla.

### El legajo

Tabla `staff_legajo`: identidad, documento con foto (frente y dorso),
domicilio, contacto de emergencia y CBU. 17 campos obligatorios.

Es **lo más sensible que guarda el edificio**, y por eso no lo ve ni siquiera un
administrador: sólo la persona y el dueño. Un administrador administra la
plataforma, no el legajo de sus compañeros.

- Las fotos van a un bucket **privado** (`staff-legajo`), al revés que
  `tenant-images`, que es público porque lo mira un comprador sin sesión.
- Se guardan **paths, no URLs**. Una URL firmada vence, y guardar una vencida es
  guardar basura que parece un dato. Se pide una nueva al mostrar y dura 5 min.
- **Quien decide si el legajo está completo es el servidor**, no el navegador:
  lo sella un trigger en `completado_at`. Si lo decidiera el cliente, entrar
  sería cuestión de mandar un request a mano.
- Se puede guardar incompleto y volver — los datos del legajo no siempre están
  todos a mano el mismo día. Lo que no se puede es ENTRAR incompleto.

La regla de "qué es completo" está escrita dos veces a propósito (SQL y
`src/modules/legajo.js`) porque hace dos trabajos distintos: la pantalla dice
qué falta mientras se escribe, el servidor abre la puerta. **Hay un test que
compara las dos parseando la migración**, igual que el de los slugs reservados;
si se separan, alguien completa el formulario, ve todo en verde y no entra.

### Verificado

En la vitrina, con dos escenas para poder comparar: `consola` (dueño
administrador) y `consola-soporte`, la misma pantalla con los mismos datos
vista por soporte — sin pestaña Equipo, los cuatro planes diciendo "los precios
los edita un administrador" y la suscripción sin botón de guardar. Más `legajo`,
que arranca vacío y lista los 17 campos que faltan.

19 tests nuevos. Suite completa: **826** en verde. Build limpio, `staff-invite`
typechequea, los cuatro checks del pre-commit pasan.

**Contra la base, nada todavía**: no se probó con una persona real entrando a
completar su legajo. Es lo primero que hay que hacer después de deployar.

### Lo que sigue bloqueado

**El paso 2 depende del permiso de Cloudflare.** El bloque que Ricky mostró es
el de *Account* (ahí están "Email Routing Addresses" y "Email Routing Account
Rules"); `Email Routing Rules` es de **Zone** y está en otro bloque del editor
de tokens. Por eso crear el destino anda y crear el alias no.

Por decisión de Ricky, **el alta ya no se frena por eso**: si Cloudflare rechaza
la escritura, sigue hasta la invitación y avisa en pantalla. Conviene tener
claro qué compra y qué paga: compra no depender del token; paga que, sin la
regla y con el catch-all apagado, esa dirección no entrega y la invitación se
pierde. El aviso está para que, si no llega, la causa esté a la vista.

---

## 21/ago/2026 — EL ALTA DE UN EMPLEADO CREA EL CORREO SOLA

Cierra el pendiente #2 del 20/ago. Antes, sumar a alguien al equipo eran dos
trabajos en dos lugares: crear el reenvío a mano en el panel de Cloudflare, y
después invitarlo desde la consola. Ahora es una pantalla.

### Estado

| | Dónde está |
|---|---|
| Base | migración **0053**, sin cambios (esto no toca la base) |
| Rama `platform/runtime-tenant` | commit de esta sesión |
| Producción | **falta deployar**: web y la edge function `staff-invite` |

### Lo primero: el HANDOFF decía mal el estado

El pendiente #1 —"deployar, producción atrasada"— **ya estaba hecho**. El
último deploy de producción es `3e2b273`, el commit del propio HANDOFF, y las 8
edge functions se actualizaron 50 segundos después. O sea que `npm run deploy`
corrió al final de la sesión pasada, después de escribir el documento.

Es estructural, no un descuido: la fila `Producción` de la tabla de estado se
escribe ANTES de deployar y nunca se vuelve a tocar, porque el deploy es lo
último que pasa. **Se saca de la plantilla**: es un dato que se consulta en dos
segundos con el MCP de Vercel y que el documento no puede mantener al día.

### Cómo funciona el alta ahora

En Consola → Equipo, el dueño escribe nombre y correo personal. El alias se
sugiere solo (`José Pérez` → `jose.perez`) y se puede pisar.

**Son dos pasos y no puede ser uno.** Cloudflare exige que el dueño del correo
personal confirme el destino con un clic, y no deja apuntar una regla a un
destino sin confirmar. Eso no lo puede hacer ninguna API — es justamente la
protección contra desviarle el correo a un tercero. Así que:

1. **Crear el correo** → crea el destino en Cloudflare, que le manda el mail de
   confirmación a la persona. La pantalla queda en "esperando".
2. La persona hace el clic.
3. **Ya confirmó, seguir** → ahora sí crea la regla `alias@dominio → personal`.
4. **Dar acceso a la consola** → recién acá sale la invitación de Supabase.

La llamada de crear es **idempotente**: apretar el botón dos veces no duplica
nada, y es la forma prevista de retomar el alta después del clic.

### La trampa que esto evita

Si la invitación sale antes de la confirmación, **se pierde en silencio**: el
alias existe, se ve en el panel de Cloudflare y no entrega nada. Y encima vence
a las 24 horas, así que cuando la persona por fin confirma, el link que la
esperaba ya caducó. El síntoma que llega después es "no me llegó nada", que no
dice nada de esto.

Por eso el guard está **en la edge function**, no sólo en la pantalla: antes de
invitar comprueba contra Cloudflare que esa dirección reciba correo hoy, y si
no, contesta 409 con el motivo. La pantalla se puede saltear; la function no.

**El catch-all cuenta.** Las cuentas fundadoras son anteriores a que hubiera
una regla por persona y andan por ahí. Si el guard mirara sólo las reglas, le
diría al dueño de la plataforma que no tiene correo.

### Dónde vive cada cosa

- `src/modules/correoDeEquipo.js` — puro y testeado: qué alias sugerir y si a
  una dirección le llega el correo. Misma división que 6f hizo con los roles.
- `platform/functions/staff-invite/index.ts` — todo lo que le habla a
  Cloudflare. El token no sale de acá.
- La regla de "recibe correo" está escrita **dos veces a propósito**: en el
  módulo decide qué botón mostrar, en la function decide si sale un mail.
- **No se guarda nada en nuestra base.** A dónde va el correo de alguien lo
  sabe Cloudflare; una copia nuestra sería una segunda verdad, y la que manda
  no es la nuestra.

### Verificado

En la vitrina, el flujo entero: alias sugerido con tildes (`José Pérez` →
`jose.perez`), el paso de "esperando confirmación", el segundo intento que
cierra el alta, la invitación, y la persona apareciendo en la lista con su
reenvío. Más los tres estados en la lista del equipo: recibe / esperando /
sin correo.

22 tests nuevos. Suite completa: 805 en verde. Build limpio.

**Contra Cloudflare de verdad, sólo lo que probó Ricky** (ver abajo): el paso 1
anduvo, el paso 2 no. Yo no toqué la cuenta.

### La primera prueba real: funcionó a medias

Ricky lo deployó y probó con una persona. **El paso 1 anduvo entero**: se creó
el destino, le llegó el mail de Cloudflare y confirmó. **El paso 2 se cayó**
con `Cloudflare: Authentication error` y ahí murió — sin regla y sin
invitación.

Y el mensaje no servía para nada. "Authentication error" es lo que contesta
Cloudflare cuando a un token le falta un permiso, **sin decir cuál ni sobre qué
recurso**, y el alta usa cuatro permisos distintos. Yo deduje "le falta Email
Routing Rules: Edit" razonando desde qué llamadas habían andado; Ricky contestó
que el token es de permiso total. O sea: estaba adivinando, y con eso no se
arregla nada.

**Dos cambios, y el segundo es el que importa:**

1. Cada llamada a Cloudflare ahora dice **qué estaba haciendo**, con **qué
   permiso** y con el **código** de Cloudflare (10000 = Authentication error).
   El código vale más que el texto: es el único que significa "el token no
   puede hacer esto"; validaciones y duplicados tienen código propio.
2. Hay un **diagnóstico** en Equipo — "Probar el token de Cloudflare" — que
   corre las cinco llamadas del alta y dice cuál falla, en vez de deducirlo.

**La sonda de escritura no crea nada.** Manda un POST a propósito inválido
(cuerpo vacío): si falta el permiso, Cloudflare contesta 10000 *antes* de mirar
el cuerpo; si el permiso está, contesta un error de validación. Los dos se
distinguen por el código y ninguno deja una regla dando vueltas.

### El diagnóstico corrió, y contestó

Sobre `grupodivianco.com`, con el token en producción:

| Paso | |
|---|---|
| 1. encontrar la zona | ✓ |
| 2. leer los destinos (cuenta) | ✓ 4 |
| 3. leer los reenvíos (zona) | ✓ 1 |
| 4. leer el catch-all (zona) | ✓ apagado |
| 5. **escribir un reenvío** | ✗ **Authentication error [10000]** |

**Lee reglas y no las puede escribir.** Eso es `Email Routing Rules` en Read y
no en Edit sobre esa zona — en el editor de tokens de Cloudflare es UNA fila
con un desplegable Read/Edit, así que un token que uno da por "total" puede
tenerla en Read sin que se note.

Se descartó la otra explicación que parecía razonable —que el segundo paso
estuviera reintentando la verificación del destino— mirando el código: el POST
al destino está detrás de `if (!e.destinos.some(...))` y en la segunda pasada no
se ejecuta. La etiqueta del error lo confirma: dice "crear el reenvío", no
"crear el destino". Y la invitación (Supabase/Resend) no entra: eso es el tercer
botón.

**El segundo botón dejó de ser un callejón sin salida.** Si Cloudflare rechaza
la escritura, el error ahora ofrece la salida: crear la ruta a mano en el panel
(medio minuto) y volver a apretar — la función detecta la regla existente y
retoma en "listo". Verificado en la vitrina.

### Pendiente inmediato

1. **Poner `Email Routing Rules` en Edit** en el token, para la zona
   `grupodivianco.com`. El diagnóstico vuelve a correr y tiene que dar todo ✓.
2. **Retomar el alta de esa persona.** El destino ya está creado y confirmado:
   apretando "Ya confirmó, seguir" se crea la regla y sigue. No hay que
   empezar de nuevo ni pedirle que confirme otra vez.
3. Si hace falta, el nombre del secreto: la function busca `CLOUDFLARE_API_TOKEN`
   (canónico), `CF_API_TOKEN`, `CLOUDFLARE_TOKEN`. Y se puede saltear la
   búsqueda de zona cargando `CLOUDFLARE_ZONE_ID` + `CLOUDFLARE_ACCOUNT_ID`.

### Las edge functions no las typechequeaba nadie

`npm run build` compila `src/`. Las functions son TypeScript que **nadie mira**:
Supabase las deploya sin typecheckear, así que un error de tipos llega a
producción como un 500 en la cara de alguien.

Ahora hay `npm run check:functions` (Deno, por npx). En la primera corrida
encontró dos cosas:

- En `staff-invite`, un `filter(Boolean)` sobre `T | null` que dejaba el `null`
  en el tipo, y el consumidor lo tapaba con un `!`. Arreglado con un predicado.
- **En `submit-order`, uno preexistente**: el costo por producto se lee de una
  relación embebida como si fuera objeto, cuando el tipo dice arreglo. Si en
  runtime llega arreglo, `unit_cost` queda en 0 sin error — y está dentro de un
  try/catch best-effort, así que tampoco se loguea. **Puede ser la causa del
  pendiente "`unit_cost` va en 0"**. No se tocó: es otra tarea.

Por eso `check:functions` NO está en el pre-commit todavía: lo estaría dejando
en rojo por algo ajeno a esta sesión.

### Sigue pendiente de antes

- Registro de cobros en la consola (hoy sólo `paga_hasta`, sin historia ni MRR).
- Cobro automático por MercadoPago Suscripciones.
- El recorte `propio` de 6f, a medias (sólo cocina).
- Agregar `https://divianco.app/consola` a Redirect URLs en Supabase Auth.
- Leaked password protection en el edificio.
- El primer cobro real de MercadoPago: 0 integraciones conectadas.
- Decidir si Cadena lleva los 3 meses al 50%.

### De paso

La vitrina llamaba `createRoot` sobre el mismo nodo en cada HMR y llenaba la
consola del navegador de errores de React — justo la consola que se mira para
saber si la pantalla está rota. Y la escena de la consola mutaba su propio
array de staff, que el fake copia al cargar: los cambios no se veían. Las dos
arregladas.

---

## 20/ago/2026 — DICO PASA A SER UN NEGOCIO: planes, precios y consola

La sesion mas larga hasta ahora: 16 commits, 5 migraciones del edificio
(0049-0053) y una del legacy. El edificio dejo de ser "software que anda" para
tener **con que cobrar**.

### Estado

| | Donde esta |
|---|---|
| Base (`wwwzdgprsooyjgkuyoav`) | migracion **0053**, todo aplicado |
| Rama `platform/runtime-tenant` | **e32cce7** |
| ~~Produccion~~ | ~~atrasada: los ultimos 3 commits no estan~~ — **era falso**, ver 21/ago |

**Hay que deployar.** `npm run deploy` ← se corrió al terminar la sesión, después
de escribir esto. Por eso la fila de arriba mintió durante un día entero.

### Hecho

**Pantalla de cobro (0049).** Cierra 6d. El seed de medios de pago quedo
comentado en 0004 y se corrio una sola vez: los dos negocios nacidos del alta
self-service tenian CERO medios y no podian cobrar nada. Va como trigger sobre
`tenants`, mismo criterio que 0044.

**Alta de mesas y zonas.** Cierra 6c, sin migracion. **Las zonas son un plano
POR zona con pestanias**, y las coordenadas pasaron a ser relativas a la zona —
decidido antes de que nadie dibujara en serio, porque cambiarlo despues obliga
a redibujar a mano.

**ETAPA 6f — roles con alcance (0050).** `tenant_members` es
`(tenant_id, user_id, branch_id, roles[])`. Permisos declarados en
`src/modules/roles.js`. RLS real sobre expenses, suppliers, sales, settings,
staff, audit_log y cash_sessions.

**ETAPA 6g — oportunidades**, sin migracion. Seis reglas puras en
`src/modules/dico/oportunidades.js`. **Con esto el PLAN-LOCAL-Y-ROLES quedo
cerrado entero.**

**MercadoPago por tenant (0051).** Cada negocio cobra en SU cuenta.
`payment_integrations` con RLS habilitada y **cero policies a proposito**: el
token no sale de las edge functions.

**Planes y consola (0052, 0053).** `tenants.plan` existia y no hacia nada.
Ahora hay 4 planes con precios editables desde `divianco.app/consola`, y
`platform_admins` con rol owner/staff.

  Digital $29.000 · Local $59.000 · Cadena $99.000 · Total (fuera de venta)

**Los precios van a la base y QUE INCLUYE cada plan al codigo**
(`src/modules/planes.js`), misma division que 6f hizo con los roles: un UPDATE
mal hecho no puede abrir el ERP entero al plan mas barato.

**Vitrina (`npm run vitrina`).** Sirve UNA pantalla sin base ni sesion.
Ocho escenas. Cierra la deuda de "ninguna pantalla se vio en un navegador".

### Verificado

**En produccion, con curl:** las `og:` por tenant (UA de WhatsApp da "Cochi" y
"La Nona Pato"), la landing y el catalogo de un tenant.

**Contra la base, con roles simulados:** un mozo no lee expenses/sales/settings
/audit_log/nomina, cierra un pedido y la venta se asienta, y sigue sin ver el
facturado. Un duenio de negocio ve los precios pero no los edita y no puede
darse plan Cadena gratis. Un staff entra a la consola pero no reparte accesos.
El token de MP es inalcanzable desde el cliente (ni el duenio lo lee).

**En la vitrina:** cobro con cuenta dividida, alta de mesa, equipo con roles
traducidos, pedidos vistos por la cocina sin un solo importe, y la consola con
el cronograma de promo recalculando en vivo.

### Bugs que aparecieron ejecutando (ninguno leyendo)

1. **`audit_log` tenia DOS policies select** — la nueva y `audit_select`, con el
   nombre viejo. Las permisivas se combinan con **OR**: la vieja anulaba la
   restriccion. Ahora se barren todas antes de crear las nuevas.
2. **Un mozo no podia cerrar un pedido**: `complete_order` termina en
   `insert ... returning *` y el RETURNING exige poder LEER la fila. Se
   resolvio haciendola definer, no aflojando la lectura de `sales`.
3. **`undefined.divianco.app`** (bug propio): el guard evitaba crear el tenant
   pero `destinoTrasLogin()` seguia armando la URL con el slug que ya no venia.
   No se creo ningun tenant; la persona terminaba en un dominio inexistente.
4. Con una sola zona, el boton + mandaba `zone: null` y creaba una pestania
   "Sin zona" espuria.

### DOS "pendientes" que ya estaban hechos

El HANDOFF los arrastraba y casi cuestan otra sesion: **el formulario de
contraseña nueva existe** en `Login.jsx`, y **las `og:` tags estan resueltas**
por `middleware.js` + `api/og.js`. La leccion es de proceso: los pendientes
verificables se comprueban ANTES de listarlos, no se copian de aca.

### Pendiente inmediato

1. **Deployar** (3 commits, incluye el fix de `undefined`).
2. **Alta de empleados con la API de Cloudflare Email Routing.** Hoy hay que
   crear el reenvio a mano por cada uno. La idea: se escribe el correo personal
   + el alias y el sistema crea destino, regla e invitacion. **Cloudflare exige
   que el duenio del correo personal confirme el destino con un clic**: eso no
   lo puede hacer la API, asi que el empleado va a recibir dos mails.
   Necesita un API token de Cloudflare con permiso de Email Routing.
3. **Registro de cobros en la consola.** Hoy guarda "pago hasta tal fecha", que
   dice el estado pero no la historia. Con cinco clientes alcanza; con treinta
   no. Falta cada pago con fecha, importe, medio y si se facturo, mas el MRR.
4. **Cobro automatico por MercadoPago Suscripciones**: que mueva `paga_hasta`
   solo. Hoy se registra a mano desde la consola.
5. El recorte `propio` de 6f, que quedo a medias (solo se hizo el de la cocina).

### Bloqueado por Ricky

- **Agregar `https://divianco.app/consola` a Redirect URLs** en Supabase Auth.
  Sin eso el link de invitacion se rechaza ANTES de llegar a la app: es el
  "acceso denegado" que aparecio al aceptar la invitacion.
- **Deployar** (el clasificador bloquea el comando de Vercel).
- **El primer cobro real de MercadoPago.** Nada de MP se probo contra una
  cuenta de verdad: 0 integraciones conectadas.
- **Leaked password protection** sigue desactivada en el edificio (un clic).
- **Decidir si Cadena lleva los 3 meses al 50%.** Hoy solo Local, siguiendo la
  instruccion literal. Se cambia desde la consola sin tocar codigo.

### Trampas nuevas

- **Reemplazar una policy por nombre no alcanza**: si la vieja se llamaba
  distinto, sobrevive y la anula. Barrer y recrear. Y al tocar RLS, listar
  `pg_policies` antes y despues, y probar con el rol que va a sufrir la
  restriccion — el bug de `complete_order` era del lado del PERMITIDO.
- **Un `insert ... returning` necesita permiso de SELECT**, no solo de INSERT.
  PostgREST agrega RETURNING por defecto.
- **`check-supabase-columns.mjs` NO valida los selects embebidos** de PostgREST
  (`tenant_members(role, roles, branch_id)`): paso en verde con el snapshot
  desactualizado.
- **Las escenas de la vitrina se pisaban entre si**: el glob las evalua todas,
  asi que una que le asignara `supabase.functions` al fake se lo robaba a las
  demas. Ahora todo va por `datos`.
- **La sesion de Supabase es POR ORIGEN**: la del subdominio de un negocio no
  existe en `divianco.app`. Por eso la consola tiene su propio login.
- **La consola NO tiene "olvide mi contraseña"** a proposito: ese link llevaba
  a `/entrar`, que resuelve a que negocio mandarte, y un empleado no tiene
  negocio. El duenio le manda el link desde Equipo.

---

## 20/ago/2026 — AUDITORIA DE ESTADO: dos "pendientes" ya estaban hechos

Se reviso que falta para vender y aparecio que **el HANDOFF arrastraba como
pendientes cosas resueltas**. Verificado contra produccion y contra el codigo,
no contra este documento:

| Lo que decia el HANDOFF | La realidad |
|---|---|
| "Falta el formulario de contrasena nueva tras el reset" | **Existe** en `Login.jsx`: detecta `type=recovery`, valida coincidencia y largo, y hasta usa un mensaje ambiguo al pedir el reset para no revelar que direcciones tienen cuenta |
| "Las `og:` tags son las del build" | **Resuelto** por `middleware.js` + `api/og.js`. Verificado con curl y UA de WhatsApp: `cochi.divianco.app` devuelve "Cochi" y `la-nona-pato` devuelve "La Nona Pato" |
| "5 tenants sin fila en `tenant_members`" | Corregido antes: los 7 tienen duenio |

**La leccion es de proceso, no de codigo:** planificar leyendo el HANDOFF en vez
de la realidad hace perder tiempo en cosas hechas — y casi lo pierde de nuevo
hoy. Los pendientes verificables (migraciones sin aplicar, tablas vacias,
rutas que no existen) se comprueban antes de listarlos.

### Lo unico que se toco

`Login.jsx` detectaba la recuperacion leyendo `type=recovery` del hash en el
primer render. Eso es **ganarle una carrera** al cliente de Supabase, que
procesa y limpia ese hash apenas puede. Si la pierde, la persona ve el login
comun con una sesion de recuperacion abierta, escribe la contraseña vieja —la
que no recuerda, por eso pidio el reset— y no entra. Se sumo el evento
`PASSWORD_RECOVERY` de `onAuthStateChange`, que es el que Supabase emite para
esto y no depende del hash. 7 tests nuevos.

### Estado real para vender

**Lo que anda en produccion, verificado hoy:** las 7 edge functions ACTIVE (las
4 de MP en v1), la landing de `divianco.app`, el catalogo de un tenant con sus
10 productos y su footer legal, y las `og:` por tenant.

**Lo que no existe:** forma de cobrarle al cliente. La columna `tenants.plan`
existe y **no hace nada**: los 7 dicen `free`. No hay limites por plan, ni
suscripcion, ni facturacion. Toda la infraestructura de MercadoPago sirve para
que el TENANT le cobre a sus compradores, no para que Dico le cobre al tenant.

**Lo que no se uso nunca:** 1 pedido real en toda la base, 2 ventas, 0 cuentas
de MP conectadas, 0 suscripciones push. Nada de 6c-6g paso por manos reales.

### Del linter de seguridad (advisors), lo que vale

- `payment_integrations`, `push_subscriptions` y `rate_limits` figuran como
  "RLS sin policies". En los tres es **a proposito** (se accede por RPC o por
  service role). No tocar.
- **Funciones de trigger expuestas como RPC**: `auditar`, `completar_sucursal`,
  `touch_tenant_on_order`, `touch_tenant_on_product`,
  `aplicar_movimiento_al_saldo`, `crear_settings_de_tenant`,
  `espejar_settings_a_tenant` son ejecutables por `anon`. Son triggers: nadie
  deberia poder invocarlos. Se cierra con un `revoke execute`.
- `search_path` mutable en `tocar_settings_updated_at` y
  `libro_es_de_solo_agregar`.
- **Leaked password protection desactivada** en el edificio (un clic en el
  dashboard, Auth > Settings). Ya estaba pendiente para los 3 legacy.

---

## 19/ago/2026 (noche) — MERCADOPAGO POR TENANT (migracion 0051)

Lo mas grande que faltaba. El edificio pasa a poder **cobrarle a un cliente
real**: cada negocio cobra en SU cuenta de MercadoPago.

### Estado

| | Donde esta |
|---|---|
| Base | migracion **0051**, aplicada |
| Rama | commit de esta sesion |
| Produccion | **falta deployar** — web y edge functions |

`npm run deploy`. **Las 4 functions nuevas (`mp-connect`, `mp-status`,
`mp-preference`, `mp-webhook`) no existen en Supabase hasta que corra el deploy
de functions**, asi que hasta entonces la pantalla de cobros no conecta nada.

### Como quedo

**Token manual, no OAuth.** MP no habilita OAuth para apps de tipo "Integracion
propia", que es lo que crea su wizard por default. El negocio copia su Access
Token de produccion y lo pega. Es lo que ya resolvio el legacy y lo que hacen
Tienda Nube y compania.

**El token es inalcanzable desde el cliente.** `payment_integrations` tiene RLS
habilitada y **cero policies a proposito**: ni el duenio del negocio puede
leerla. Solo la service role, desde edge functions. Verificado ejecutando: el
duenio lee 0 filas, no puede insertar y su update afecta 0 filas.

**El agujero del legacy que NO se porto:** `mp-connect-manual` no verifica quien
la llama. En una app de un negocio el danio esta acotado; aca cualquiera podria
apuntar el cobro de OTRO negocio a su propia cuenta de MP y quedarse con sus
ventas. `mp-connect` verifica que quien llama sea OWNER de ese negocio.

**El webhook y el problema circular.** La notificacion de MP no dice de que
negocio es, y para preguntarle a MP por el pago hace falta el token de ese
negocio. Se rompe con el `?tenant=` que `mp-preference` pone en la
notification_url: esa pista NO se cree —se usa para elegir con que token
preguntar— y despues se verifica que el pedido sea de ese negocio. Si no
coincide, se descarta.

**Los importes no vienen del browser.** `mp-preference` arma la preferencia con
lo que dice la base. Si el precio viajara desde el cliente, cualquiera pagaria
$1 un pedido de $20.000 y el webhook lo aprobaria sin notar nada.

**Firma del webhook**: si el negocio cargo el secreto, se valida el HMAC de
`x-signature`. Si no, se sigue igual y queda en el log.

### Lo que falta y hay que decir

- **Nada de esto se probo contra MercadoPago de verdad.** Se probo la RLS
  contra la base y la pantalla en la vitrina, pero no hay una cuenta de MP
  conectada. El primer cobro real es la prueba que falta.
- **El token se guarda EN CLARO.** Lo que lo protege es que la tabla es
  inalcanzable desde el cliente. Cifrarlo con Vault es el paso siguiente y no
  se hizo para no atar la primera version a una pieza mas.
- **Solo Argentina.** `mp-connect` rechaza cuentas de otro pais (`site_id`
  distinto de MLA) y tenants con `country` distinto de AR.
- **La pantalla de "pedido" a la que vuelve el comprador** (`/pedido/:id?pago=ok`)
  no se verifico que exista en el catalogo del edificio.

### Trampas nuevas

- **Las escenas de la vitrina se pisaban entre si.** El glob evalua TODAS al
  cargar, asi que una escena que le asignaba `supabase.functions` al fake se lo
  robaba a las demas: la pantalla de cobros recibia el router de la de equipo y
  contestaba "accion desconocida". Ahora las functions se declaran en
  `datos.functions`, como las tablas.
- **`payment_integrations` existia en el legacy sin migracion.** Se creo a mano,
  como paso con `info_pages`. **Versionada el 20/ago** en
  `supabase/migrations/20260820_version_payment_integrations.sql`, reconstruida
  desde el codigo que la usa (los 3 proyectos estan pausados, no es un volcado).
  Todo idempotente: sobre los tenants que ya la tienen no cambia nada.
  Queda anotado ahi, sin resolver: en el legacy el `access_token` es legible por
  cualquier admin del negocio. En el edificio no (0051, RLS sin policies).
  Cerrarlo exige la base despierta para poder probarlo.

---

## 19/ago/2026 (tarde) — COBRO, MESAS Y ETAPA 6f (migraciones 0049-0050)

Cuatro commits. El edificio pasa de "construido" a **entregable a un local con
empleados**: hasta hoy, darle el panel a un mozo era darle el P&L.

### Estado

| | Donde esta |
|---|---|
| Base (`wwwzdgprsooyjgkuyoav`) | migracion **0050**, todo aplicado |
| Rama `platform/runtime-tenant` | **8423418** |
| Produccion (Vercel) | commit **483892c** — **12 commits atras** |

**Falta deployar.** `npm run deploy`. El asistente no puede: el clasificador de
permisos bloquea el comando de Vercel.

### Hecho

**Pantalla de cobro (6d cerrada).** `register_payment` y `order_balance`
existian desde 6d sin que nadie las llamara. El monto viene cargado con lo que
falta; dividir la cuenta es escribir menos, sin modo aparte. En efectivo
calcula el vuelto pero asienta lo COBRADO: guardar el billete entero haria que
el arqueo diera faltante todos los dias.

**0049 — medios de pago por defecto.** El seed quedo comentado en 0004 para
correrlo a mano; se corrio una vez y nunca mas. Los dos negocios nacidos del
alta self-service tenian CERO medios y no podian cobrar nada. Va como trigger
sobre `tenants`, mismo criterio que 0044.

**Alta de mesas y zonas (6c cerrada).** Sin migracion: todo estaba en 0045. En
modo acomodar se toca el plano y la mesa nace ahi, con el nombre siguiente y la
forma heredada. **Las zonas son un plano POR zona, con pestanias, y las
coordenadas pasaron a ser relativas a la zona** — decidido antes de que nadie
dibujara en serio, porque cambiarlo despues obliga a redibujar a mano.

**ETAPA 6f — roles con alcance.** `tenant_members` es
(tenant_id, user_id, branch_id, roles[]). Permisos declarados en
`src/modules/roles.js`, no en tabla editable. RLS real sobre expenses,
suppliers, sales, settings, staff, audit_log y cash_sessions. Pantalla de
equipo propia del edificio. La cocina no ve importes ni anula.

**Vitrina (`npm run vitrina`).** Sirve UNA pantalla sin base ni sesion,
interceptando `src/lib/supabase.js`. Cierra la deuda de "ninguna pantalla se
vio renderizada en un navegador". Seis escenas.

### Verificado

**Contra la base, con roles simulados** (`set_config('request.jwt.claims',...)`
+ `set local role authenticated`): un mozo no lee expenses, sales, settings,
suppliers, audit_log, cash_sessions ni nomina ajena; si ve productos; no carga
un gasto; al ascenderse a duenio el update afecta 0 filas; cierra un pedido y
la venta se asienta, y sigue sin ver el facturado.

**En el navegador, via vitrina:** cobro con cuenta dividida (dos medios hasta
saldar), alta de mesa tocando el plano (queda en 74.8%/79.7%, la zona correcta),
equipo con roles traducidos por rubro, y pedidos vistos por la cocina sin un
solo importe.

**726 tests, 4 checks del pre-commit, lint y build en verde.**

### Cuatro bugs que aparecieron ejecutando (ninguno leyendo)

1. **`audit_log` tenia dos policies select.** La nueva y `audit_select`, con el
   nombre viejo. Las permisivas se combinan con **OR**: la vieja anulaba la
   restriccion. Ahora se BARREN todas antes de crear las nuevas. Los delete de
   `staff` y `cash_sessions` tenian el mismo agujero.
2. **Un mozo no podia cerrar un pedido.** `complete_order` termina en
   `insert ... returning *` y el RETURNING exige poder LEER la fila; PostgREST
   lo agrega por defecto. Se resolvio haciendo la funcion definer con guard
   explicito, no aflojando la lectura de `sales`.
3. **Con una sola zona, el boton + mandaba `zone: null`**, creando una pestania
   "Sin zona" espuria. Lo agarro un test.
4. **La primera prueba de RLS fue un falso positivo**: el miembro ficticio no
   se habia insertado, asi que "no ve nada" era por no ser miembro.

### Lo que queda de 6f (decirlo con esas palabras)

- **El recorte `propio` esta a medias.** Se implemento el de la cocina (sin
  importes, sin anular). Falta que el mozo vea SUS mesas y SUS ventas, y que el
  encargado quede acotado a su sucursal: hoy el filtro es por modulo entero.
- **`accountant` y `marketer` no tienen pantalla propia.** El contador abre en
  Ventas, que es lo mas cerca que hay. Su pantalla es la lista de sus negocios
  (seccion 4.5) y no existe.
- **El alcance por sucursal no se ejerce en la UI.** `alcanza_branch` existe y
  las policies de caja lo usan, pero el panel todavia no deja elegir sucursal
  ni filtra por ella.
- **`role` sigue en la tabla**, deprecada y sincronizada por trigger. Se elimina
  cuando produccion este al dia y ningun consumidor la lea.

### Trampas nuevas

- **Reemplazar una policy por nombre no alcanza.** Si la vieja se llamaba
  distinto, sobrevive y anula la nueva. Barrer y recrear.
- **`check-supabase-columns.mjs` NO valida los selects embebidos** de PostgREST
  (`tenant_members(role, roles, branch_id)`). Paso en verde con el snapshot
  desactualizado, que es justo el bug que ese checker existe para atrapar.
- **La flakiness de los tests no era azar: era CPU.** Con un dev server
  corriendo fallan 3-4 al azar por timeout; sin el pasan los 726. `testTimeout`
  subio a 15s.
- **Un `insert ... returning` necesita permiso de SELECT**, no solo de INSERT.

### Regla nueva: tocar RLS empieza y termina listando policies

Dos de los cuatro bugs de arriba fueron la misma clase de error —asumir en vez
de mirar— y los dos eran gratis de evitar:

```sql
select policyname, cmd, permissive, qual, with_check
  from pg_policies where schemaname='public' and tablename='<tabla>';
```

Antes, porque **reemplazar por nombre no alcanza**: las permisivas se combinan
con OR y basta que sobreviva una vieja para que la restriccion nueva sea
decorativa. Despues, porque es la unica forma de ver que quedo de verdad.

Y probar con el rol que va a sufrir la restriccion, no solo con el duenio:
`set local role authenticated` + `set_config('request.jwt.claims', ...)`.
Verificar que el permitido pueda es tan importante como que el prohibido no:
el bug de `complete_order` era del lado del permitido.

### 6g — opportunity engine (cerrada el mismo dia, sin migracion)

`src/modules/dico/oportunidades.js`. Seis reglas de la segunda familia: lo que
no rota, capital inmovilizado, clientes fuera de frecuencia, ocupacion baja,
demanda perdida y margen flaco. Misma arquitectura que la capa 2 —funciones
puras sobre lo que el panel ya tiene—, asi que no alucina, no puede filtrar
entre negocios y no cuesta por uso.

Dos reglas que se impusieron a si mismas:
- **`crear()` exige `porque` y `hacer`**, o devuelve null. El titulo solo es
  una afirmacion que hay que creer; con la cuenta al lado es verificable.
- **Nada se afirma sin muestra**: <8 ventas, <21 dias de historia o <4 clientes
  recurrentes y la regla se calla.

"Sucursales desbalanceadas" figura en el plan y **no se construyo**: con un
solo local por negocio seria una regla que no puede dispararse.

`agregarClientes` gano `first_order` — sin el, "cliente perdido" solo podia
decir "hace mucho que no viene", que no distingue al que compra cada semana del
que compra cada trimestre.

**Con esto el PLAN-LOCAL-Y-ROLES queda cerrado entero.**

### Pendiente inmediato

1. ~~Deployar~~ **HECHO** (19/ago, 12 commits). **6g y este bloque quedaron
   despues: hay que volver a deployar.**
2. Cerrar el recorte `propio` que quedo a medias.
3. ~~6g~~ **HECHA**.
4. **MercadoPago multi-tenant: es lo mas grande que queda y lo que mas plata
   mueve.** Ya no compite con ninguna etapa del plan.

---

## 19/ago/2026 — EL LOCAL FISICO: ETAPAS 0, 6a-6e (migraciones 0039-0048)

Sesion larga: 11 commits, **10 migraciones aplicadas**, 663 tests. El edificio
paso de "ERP a distancia" a tener sucursales, salon, caja, propinas y personal.

> **Doc de la etapa: `platform/PLAN-LOCAL-Y-ROLES.md` (v2).** Ahi esta el
> criterio que ordena todo y el registro de que se acepto y que se recorto de
> la revision contra Square/Toast/Fresha/Shopify/7shifts. Leerlo antes de
> seguir con 6f o 6g.

### ATENCION: la base esta ADELANTADA respecto de produccion

| | Donde esta |
|---|---|
| Base (`wwwzdgprsooyjgkuyoav`) | migracion **0048**, todo aplicado |
| Produccion (Vercel) | commit **483892c**, o sea hasta 6b |
| Rama `platform/runtime-tenant` | commit **a6cf0d1** (6e) |

**6c, 6d y 6e NO estan en produccion.** Son 7 commits sin deployar. No rompe
nada —las migraciones son aditivas y ninguna pantalla vieja usa las tablas
nuevas— pero lo que se ve en divianco.app no es lo que dice el repo.

Para deployar: `npm run deploy` (encadena Vercel + edge functions).

### El criterio que ordeno la etapa

**Barato ahora y caro despues -> entra ya, aunque no tenga pantalla.** Todo lo
que cambia la FORMA del dato (branch_id, ledger, business_date, audit log,
claves de idempotencia) se migro ahora; migrarlo con dos anios de operacion
cargada es reescribir. Lo que cuesta lo mismo siempre (pantallas, algoritmos)
espera al cliente que lo pida.

Ese criterio salio de discutir una revision externa que proponia agregar doce
cosas mas. Cada una era correcta por separado; sumadas eran mas trabajo que
todo lo construido hasta hoy, con cero clientes usando el edificio.

### Hecho

**Etapa 0 — idempotencia (0040) y audit log (0043).** El diagnostico previo
decia "falta idempotencia". Verificado contra el codigo: NO era eso.
`complete_order`, `signup_tenant` y `mp-webhook` ya la tenian y bien. Faltaba
en `submit-order`, `register_waste` y `register_purchase`. La clave se ata al
CONTENIDO de la operacion: generarla por llamada no sirve (dos clicks = dos
claves) y guardarla por sesion tampoco (la segunda compra del dia devolveria
la primera). Las firmas viejas de las RPC se eliminaron: si quedaran, una
llamada sin clave las elegiria por sobrecarga y perderia la garantia en
silencio.

El audit log es un trigger generico (no uno por tabla, que se desincroniza) y
guarda el DIFF `{columna: {antes, despues}}`, no la fila: una fila de settings
tiene 50 columnas y guardarla entera hace el log ilegible.

**6a — los ejes del alta (0039).** `operation_mode` (fisico/virtual/hibrido),
`channels[]`, `country`, `currency`, `timezone`. Modo y canales son DOS cosas
porque los canales son varios a la vez; meterlos en uno obligaria a inventar
`fisico_con_delivery`. El pais es el punto de entrada del adaptador fiscal:
solo AR tiene integracion y la UI lo dice en vez de prometerlo.

**6b — sucursales (0041) y el libro del stock (0042).** `branch_id` en lo que
ocurre EN un lugar, no en lo que es del negocio: un cliente que compra en dos
locales es un cliente, no dos. `business_date` calcula el dia operativo en la
zona del local y con hora de corte configurable.

El stock dejo de ser un numero: `inventory_movements` + `inventory_balances`
mantenido por trigger. El libro es de SOLO AGREGAR —se corrige con asiento
contrario— porque si se pudiera editar, el saldo cacheado quedaria mintiendo.
`ingredients.stock` NO se elimino: corre en paralelo hasta compararlo con
datos reales. Cambiar la fuente de verdad del stock a ciegas es el error caro.

**0044 — ninguna operacion nueva queda sin sucursal.** Con un trigger y no
tocando cada escritor: son media docena y crecen.

**6c — recursos y reservas (0045).** `appointments` ya tenia desde 0005 un
EXCLUDE que impide turnos solapados del mismo barbero; se agrego el equivalente
por recurso y se reuso todo lo demas. `staff_id` paso a nullable (una reserva
de mesa no tiene barbero) con un CHECK que exige al menos uno de los dos. El
status paso a flujo real: `booked -> confirmed -> arrived -> in_service ->
done`. Las senias se modelaron aunque el cobro llegue con MercadoPago. Waitlist
como entidad: `status='left'` es demanda perdida.

`MapaDeMesas.jsx`: coordenadas en PORCENTAJE (el mismo plano en el monitor y
en el telefono), dos modos sobre el mismo plano y **arrastre apagado por
defecto** — un toque torcido no puede mover una mesa en hora pico. Dibujar el
salon es opcional: lo no ubicado se reserva igual.

**6d — caja, comanda y Dicotip (0046, 0047).** `cash_sessions` existia desde
0004 sin usarse. Se agrego el indice unico de UNA caja abierta por sucursal, y
el esperado suma SOLO efectivo: lo de tarjeta no esta en el cajon y sumarlo
haria que el arqueo diera mal siempre.

No hay estado "cuenta abierta" (`orders.status` ya tiene `active`) ni tabla
para dividir la cuenta (`payments` ya soporta varios pagos por pedido).

Propinas como DOMINIO, no como campo: `employee_direct` (Dicotip, no pasa por
la caja), `employee_pool`, `merchant_collected`. Sin distinguirlos, el local
declara propinas que no recibio o el mozo cobra dos veces. `get_tip_target` es
publica y por SLUG, y devuelve el alias del mozo y NADA mas de el.

**6e — personal (0048).** Turnos con EXCLUDE por persona, disponibilidad
declarada por el EMPLEADO, ausencias, fichaje y costo laboral.

**La biometria no entra nunca.** WebAuthn guarda clave publica y contador; la
huella no sale del telefono. Geocerca y selfie quedaron como senial opcional:
acumular ubicacion e imagen de cada empleado todos los dias para resolver "que
no fiche un companiero" es desproporcionado cuando la passkey ya lo resuelve.

`labor_cost_vs_sales` cruza horas FICHADAS (no programadas: lo programado es
una intencion) por costo/hora contra las ventas del dia operativo.

**Reclasificacion del checker de columnas.** Los 4 avisos eran tres problemas
distintos: `activeTenant.js` mal clasificado; `account.js` e `infoPages.js`
son DUALES (bifurcan por `business.platform`) y el checker no lo contemplaba
—se agrego `DUAL_PATHS`, validados contra la union—; y el snapshot LEGACY
estaba viejo (5/jun, sin `waste_log`, `info_pages`, `push_subscriptions`).

### Verificado

**En produccion, con curl:** el checkout con la misma clave dos veces devuelve
el MISMO orderId con `deduplicated:true` y un solo pedido en la base. El alta
en divianco.app/registro muestra los 7 campos, 3 modos y 9 paises.

**Contra la base, con datos reales y limpieza** (~60 casos): merma y compra
idempotentes; el libro contesta "purchase 20, waste -3, adjustment -2 = 15";
rechaza update y delete; doble reserva de la misma mesa rechazada por el
EXCLUDE; `available_resources` no ofrece la mesa de 8 para 2 personas; arqueo
con faltante guarda -200 y cerrar de nuevo no lo pisa; la propina directa no
cambia el esperado en caja; turno solapado rechazado; jornada 20:00-04:00 da 8
horas y el MISMO dia operativo; costo laboral 12%; `staff_credentials` sin
ninguna columna biometrica (verificado contra `information_schema`).

**663 tests, build, 4 checks del pre-commit y lint en verde.**

### Tres bugs que aparecieron probando (y no antes)

1. **La clave del libro no incluia la cosa movida.** Una compra de 3 insumos
   con una sola clave chocaba en la segunda linea y el guard devolvia el
   movimiento de la primera: **la compra entraba INCOMPLETA y sin error**.
2. **Las escrituras nuevas quedaban sin `branch_id`.** El backfill de 0041
   llenaba lo historico pero no lo nuevo. Se detecto probando el checkout
   contra produccion. Arreglado en 0044.
3. **El CHECK del fichaje era `>` estricto.** Con una salida en el mismo
   instante que la entrada, el empleado quedaba con el fichaje ABIERTO PARA
   SIEMPRE, y una jornada abierta sigue sumando horas. Pasa a `>=`.

Los tres se encontraron ejecutando, no leyendo. Es el argumento a favor de
probar cada migracion contra la base antes de commitear.

### Lo que quedo A MEDIAS (decirlo con esas palabras)

- **No se puede crear una mesa desde la UI.** El boton "Nueva mesa" muestra un
  toast que dice que llega con el editor. Las 5 de `barberia-demo` se cargaron
  por SQL. Falta el formulario de alta de recursos.
- **No hay pantalla de cobro.** `register_payment` y `order_balance` existen en
  `platformCaja.js` pero nadie los llama todavia: la caja abre, arquea y
  cierra, pero el cobro sigue sin UI.
- **No hay pantalla para armar la semana.** `PersonalPanel` acepta un
  `onVerSemana` que el panel no le pasa. Se puede fichar y ver el costo, no
  programar turnos.
- **Dicotip no tiene ni QR impreso ni pantalla publica.** Las RPC
  (`get_tip_target`, `submit_service_review`, `register_tip`) estan probadas
  contra la base, pero falta la pagina que abre el cliente al escanear.
- **`agenda` y `variants` siguen en `implementado: false`.** Sus tablas estan
  desde 0005 y 0007; falta la UI. Un modulo en la nav sin pantalla es peor que
  uno ausente.
- **Ninguna pantalla de 6c/6d/6e se vio renderizada en un navegador.** El panel
  pide sesion y el asistente no la tiene: la verificacion fue por tests de
  render (34 casos). Si algo se ve mal, hay que mirarlo.

### Pendiente inmediato (en orden)

1. **Deployar.** `npm run deploy`. Hay 7 commits sin publicar.
2. **Cerrar los a-medias de arriba**, empezando por el alta de mesas y la
   pantalla de cobro: sin esas dos, 6c y 6d no se pueden usar de verdad.
3. **6f — vistas por rol.** El esquema completo (7 roles, que ve cada uno,
   donde abre) esta en la seccion 8 de `PLAN-LOCAL-Y-ROLES.md`. Incluye ampliar
   `tenant_members.role` y pasar a una fila por (tenant, usuario, sucursal) con
   `roles[]`.
4. **6g — opportunity engine.** Las reglas de Dico hoy son 9 y **todas son de
   higiene** ("te falta el precio"). La segunda familia —stock muerto, demanda
   perdida, clientes fuera de frecuencia, ocupacion baja— esta desbloqueada por
   los datos que dejo esta sesion.
5. **MercadoPago multi-tenant.** Sigue siendo lo mas grande que falta y lo que
   mas plata mueve. Bloquea las senias de reserva y el pre-cobro anti no-show.

### Bloqueado por Ricky

- **Deployar** (ver arriba). El asistente no puede: el clasificador de permisos
  bloquea el comando de Vercel.
- **El encuadre legal de la propina electronica.** El modelo contempla
  distribucion y settlement, pero la regulacion 2024 + LCT es cumplimiento, no
  arquitectura, y **no esta verificada**. Antes de que un mozo cobre por
  Dicotip, tiene que mirarlo un contador.
- **Verificar que "Dicotip" este libre** como marca y dominio. Va impreso en
  cada ticket. (El nombre anterior, "Tipco", ya estaba tomado.)
- **Probar el salon, la caja y el fichaje con datos reales.** Es la leccion que
  se repite: la Etapa 3 dio 4 correcciones al probarla, y esta sesion dio 3
  bugs mas al ejecutar contra la base. Nada de 6c-6e lo uso una persona.
- **Push sigue sin probarse de punta a punta** (`push_subscriptions` en cero,
  pendiente desde el 18/ago).

### Trampas nuevas para el que siga

- **El snapshot legacy no se puede regenerar**: los 3 proyectos estan pausados.
  Si falta una tabla, las columnas salen de `supabase/migrations/`.
- **Hay DOS `submit-order`** con codigo distinto: `supabase/functions/`
  (legacy) y `platform/functions/` (edificio). `scripts/deploy-functions.mjs`
  apunta al legacy; el del edificio es `platform/scripts/deploy-functions.mjs`,
  que arma un workdir temporal porque el CLI busca en `supabase/functions/`.
  Usar el equivocado sube el codigo legacy al edificio **sin fallar**.
- **La flakiness de los tests existe y se manifesto**: el pre-commit fallo una
  vez en los smoke tests (`utils.test.js` + `schemas.test.js`) y paso a la
  siguiente sin cambiar nada. Tambien habia 4 `async` sin `await` en
  `mapaDeMesas.test.jsx` que daban timeouts — se sacaron, pero el fallo del
  smoke es otro caso y sigue sin identificar.
- **Al probar RPC con el MCP de Supabase** hay que simular la sesion con
  `set_config('request.jwt.claims', ...)`: el MCP corre sin `auth.uid()` y
  todos los guards de membresia cortan. Y **no usar `raise` para revertir**: se
  lleva puesta la tabla temporal de resultados y el test devuelve vacio. Hay
  que limpiar con `delete` explicito.

---

## 18/ago/2026 — EL ERP QUEDO COMPLETO Y LA PERIFERIA CERRADA

Sesion larga: 12 commits, migraciones **0032 a 0038**, 3 edge functions.
El edificio pasó de "panel de productos y pedidos" a **ERP entero**: Etapas 4
(ventas y P&L), 5a (CRM) y 5b (cuenta del comprador), mas TODA la periferia
(merma, imagenes propias, push, QRs, paginas de info, equipo). Ademas Dico
capa 1 y el arreglo de las `og:` tags.

### Lo mas reutilizable que salio

**Antes de asumir que un RPC devuelve algo, mirarlo.** Escribi las RPCs de
push pidiendo `tenant_id` asumiendo que `get_tenant_brand` devolvia el `id`.
**No lo devuelve.** Verificarlo antes cambio el diseño: las RPCs publicas del
edificio reciben el **slug**, que ya viaja en la URL, y asi no hubo que
exponer un endpoint nuevo solo para traducir slug→uuid. Vale para
`upsert_push_subscription`, `get_info_page` y `resolve_qr`.

**Dos caminos de lectura, no uno.** Todo lo que un visitante SIN SESION tiene
que ver (paginas de info, QRs, catalogo) va por RPC con el slug; lo que edita
un miembro va por tabla con RLS. Mezclarlos obliga a exponer de mas.

**Portar no es copiar: revisar que se hereda.** Dos agujeros del legacy que
NO se portaron, los dos por la misma razon (lo que en una app de un negocio
esta acotado, en una plataforma se multiplica):

1. `admin-users` **pisa la contraseña** de un email que ya tiene cuenta. Aca
   cualquier dueño podria "agregar a su equipo" a otra persona y quedarse con
   su cuenta, incluidos los negocios que ella administra.
2. `upsert_push_subscription` aceptaba `role` sin validar. Los push de admin
   llevan nombre del cliente y monto.

### Hecho (todo aplicado, commiteado y pusheado)

**Etapa 4 — ventas y P&L (0032).** `sales` + RPC `complete_order`: completar
un pedido cambia el estado y asienta sus ventas en UNA transaccion (en el
legacy es un bucle de `createSale` desde el navegador). El costo se congela
dos veces: `submit-order` lo escribe al crear el pedido y `complete_order` lo
recalcula si vino en 0. El P&L del mes va **sin** el colchon de pricing — es
el doble conteo que ya se arreglo una vez el 12/jun.

**Etapa 5a — CRM (sin tabla nueva).** Correccion al plan: el CRM del legacy no
lee una tabla de clientes, **agrega sobre `orders`**. `addresses`/`favorites`
eran de otra mitad (la 5b).

**Etapa 5b — cuenta del comprador (0035).** Arreglaba **tres roturas
silenciosas**: `addresses`/`favorites` no existian, MyAccount leia `recipes`,
y —la que no estaba en el plan— **un comprador logueado no podia ver sus
propios pedidos** porque la unica policy de select de `orders` era para
miembros. Ninguna daba error: un `.select()` que falla devuelve `{error}`.
`addresses` y `favorites` **sin `tenant_id` a proposito**: son de la persona,
no del negocio. Se toco `orders_select`, asi que el test incluye la
no-regresion del dueño.

**Periferia completa:**

- **Merma (0033)** — RPC `register_waste`, asiento + descuento juntos.
- **Imagenes propias (0034)** — bucket `tenant-images`, UNO para todos,
  aislado por carpeta `<tenant_id>/`. Un bucket por tenant obligaria a
  provisionar infraestructura en cada alta self-service. El alta de producto
  pedia "Imagen (URL)": un panadero no tiene una URL.
- **Push (0036)** — UNA VAPID para toda la plataforma (identifica al SERVIDOR,
  no al negocio). `send-push` corta con 400 sin tenant: un fallback a "todos"
  seria notificarle a los clientes de otro local.
- **QRs y paginas (0037)** — `resolve_qr` resuelve y cuenta la visita en UNA
  llamada; desde un telefono recien escaneando, un segundo request a veces no
  llega. Por eso `incrementQrVisit` **no hace nada** en el edificio.
- **Equipo (0038)** — `tenant-users` + `find_user_id_by_email` (solo
  service_role: expuesto a `authenticated` seria un oraculo de emails
  registrados). No se puede sacar ni degradar al ultimo dueño.

**`og:` tags por tenant.** Compartir cualquier local por WhatsApp mostraba
"Cochi". La causa NO era el endpoint sino el ruteo: **Vercel resuelve el
filesystem antes que los rewrites**, y para `/` ya existe `index.html`, asi
que la regla por User-Agent nunca se evaluaba. Se resolvio con
**`middleware.js`** (Edge Middleware), que corre antes del filesystem. Va
defensivo: try/catch y cualquier duda termina en dejar pasar — corre en TODAS
las visitas de documento y una excepcion ahi tira el sitio entero.

**Reset de contraseña**: `/entrar` detecta `type=recovery` en el hash.

**morning-health reescrito**: miraba los 3 legacy pausados, o sea rojo todas
las mañanas. Ahora mira lo vivo (landing, tenants con conteo de productos,
`submit-order`, drift del snapshot, Sentry 24h).

**Dico capa 1**: `src/components/dico/DicoCara.jsx` + `dico.css`, 5 estados,
enchufado en `DicoAvisos` con la expresion atada al nivel del aviso mas grave
— o sea la misma informacion que el color. **SVG y no video**: los mp4 no
tienen canal alfa (el "fondo transparente" sale blanco; harian falta WebM/VP9
para Chrome y HEVC para Safari) y 13 clips pesan mas que toda la app, que se
usa desde el telefono de una cocina.

**Tooling**: `_chain.js` daba a todos los metodos del builder el MISMO
`vi.fn`, asi que un `not.toHaveBeenCalled()` no podia pasar nunca. Arreglado
(la trampa estaba anotada en este handoff y cai en ella igual).

### Verificado

**En produccion, con curl:** las `og:` tags por tenant (UA de WhatsApp da "La
Nona Pato", de Telegram en cochi da "Cochi", el humano recibe la SPA con 200);
los guards de las 3 edge functions (sin tenant 400, sin auth 401, y **con la
anon key —que es publica y viaja en el bundle— 401**); catalogo 200.

**Contra la base, con BEGIN/ROLLBACK:** ~50 casos entre las 7 migraciones. Lo
importante: aislamiento entre negocios en storage, push, paginas y QRs;
no-regresion del dueño al tocar `orders_select`; el colado que pide rol admin
queda como customer; anon no ve ni escribe nada.

**Estado de la base al cierre:** 7 tablas nuevas, 6 RPCs, bucket. Todo ahi.

**569 tests + build.** Una corrida fallo una vez y paso las 3 siguientes:
**hay flakiness**, no identificada.

### LO QUE NO SE PROBO (importante)

1. **Push de punta a punta: `push_subscriptions` tiene CERO filas.** Nadie
   activo el banner todavia, asi que no llego ninguna notificacion nunca. La
   VAPID publica esta en el bundle; la privada solo se puede comprobar con una
   llamada autorizada. **Hasta que alguien active el banner y entre un pedido,
   esto no esta probado.**
2. **Dico no se vio nunca con ojos humanos.** El pane del navegador no
   renderiza archivos locales. El ajuste fino de las curvas sale de mirarlo.
3. Las pantallas nuevas (equipo, QRs, paginas, favoritos, direcciones) estan
   deployadas pero **nadie las uso con datos reales**. Las listas de que probar
   estan al final de cada seccion del `PLAN-ERP.md`.

### Pendiente inmediato (en orden)

1. **Probar lo de arriba.** Son 3 etapas y toda la periferia sin tocar por un
   usuario real. La leccion de la Etapa 3 fue exactamente esa: probarla saco
   cuatro correcciones.
2. **MercadoPago multi-tenant** — lo mas grande que queda y lo que mas plata
   mueve: un negocio que no cobra online pierde ventas. OAuth por tenant.
3. Canales de venta y zona de riesgo (los `false` que quedan en
   `CAPACIDADES_EDIFICIO`).
4. Packs de rubro: agenda (barberia), variantes (retail), caja.
5. **Dico capa 3 (LLM)** — ya desbloqueada: su plan pedia Etapas 4 y 5, que
   estan. Pero antes conviene que el P&L se valide con datos reales: una IA
   que opina sobre numeros no probados dice cosas equivocadas con seguridad.

### Bloqueado por Ricky

- **Activar el banner de push y hacer un pedido.** Sin eso, push no esta
  probado (ver arriba). Las VAPID ya estan cargadas en Supabase y Vercel.
- **Mirar a Dico** y decir que se siente mal. Ricky genero 3 videos de
  animacion con sus prompts; **el asistente no puede reproducir video**, asi
  que si hay que ajustar curvas hace falta que describa el movimiento o mande
  capturas.
- **Decision: historial por telefono del invitado.** Hoy devuelve vacio A
  PROPOSITO. El RPC del legacy deja ver los pedidos de cualquier numero que
  se escriba; en una plataforma con muchos locales es el mismo agujero
  multiplicado. Tres salidas planteadas en el `PLAN-ERP.md` (portarlo igual /
  scopear a tenant + ultimos N dias / pedir el codigo de pedido).
- **Decision: que pasa con `main`.** Sigue congelada sirviendo a los 3 legacy.
  Cuanto mas conviven las ramas, mas se parece a una bifurcacion permanente.
- **Secrets opcionales del morning-health**: `PLATFORM_SUPABASE_*` (activa el
  check de drift) y `SENTRY_*` (activa el de errores) en GitHub Actions. Sin
  ellos anda igual, saltea esos dos checks. **OJO**: el cron corre desde
  `main`; hasta el merge, probarlo con workflow_dispatch eligiendo la rama.

### Trampas nuevas para el que siga

- **Al probar aislamiento, ojo con dos cosas.** (a) El dueño de prueba es
  miembro de los 6 tenants, asi que "escribir en la carpeta de cochi" **esta
  permitido** y parece un bug: hay que crear un tenant sin membresia dentro de
  la transaccion. (b) Al pasar a rol `anon` hay que **limpiar
  `request.jwt.claims`**; si quedan las del usuario anterior, `auth.uid()`
  sigue devolviendo su id y el "anonimo" ve todo.
- **Los deploys NO salen del push.** Van por CLI
  (`npx.cmd vercel --prod --scope diviancocorp-a11ys-projects --yes`). Se
  verifico: hubo commits pusheados sin deployar durante horas.
- **PowerShell rompe los here-strings** con parentesis o comillas en el texto.
  Para commits largos, `git commit -F archivo.txt`.

---

## 16/ago/2026 (noche) — CORRECCIONES DE LA ETAPA 3, PROBADA EN PRODUCCION

Ricky probó la Etapa 3 con datos reales y salieron cuatro cosas. Migración
0031. **Dico quedó planificado en `PLAN-DICO.md`** (capas 1 y 2 primero, la
del LLM recién después de las Etapas 4 y 5; personaje sin piernas dentro de la
app, con piernas sólo para marketing).

1. **Una compra volvió a ser UN movimiento.** 0030 la partía en una fila por
   categoría de alimento, copiando al legacy. En pantalla no se sostiene: la
   lista reescribe la descripción de toda compra de materia prima a
   `Compra · <proveedor>`, así que las filas quedaban **idénticas** y parecían
   varias compras al mismo proveedor — la etiqueta por la que se partía
   ("Secos", "Lácteos") no se ve en ningún lado. Ahora el desglose viaja
   dentro de `items` (cada línea con su `food_category`) y no se pierde nada.
   **La lección: si el que carga no puede distinguir dos filas en pantalla,
   están mal partidas.** El criterio no puede ser sólo qué necesita el cálculo.
2. **`suppliers.scope`.** `category` dice de qué rubro es el proveedor y sirve
   para leerlo, no para filtrar: la carnicería salía en el desplegable de
   "Registrar gasto". `scope` (insumos | servicios | ambos) decide en qué
   pantalla aparece. Default `ambos` para no hacer desaparecer nada, y el alta
   inline hereda el contexto (desde un gasto nace `servicios`).
3. **`ToggleSwitch` mostraba un interruptor pelado.** `label` iba sólo a
   `aria-label` y `hint` **ni siquiera era una prop** — se descartaba en
   silencio. Los dos lugares que pasaban las dos cosas esperando verlas
   ("Este proveedor factura" y el **"Tengo local físico"** de la marca, que ya
   estaba así en producción) mostraban un switch sin una palabra de qué
   prendía. Con lector de pantalla se entendía; mirando, no.
4. **Barbería también stockea.** Compra gel, toallas y repuestos: eso es una
   compra que ingresa mercadería, no un gasto suelto. `stock` pasó a estar en
   los tres rubros. Lo que la barbería no tiene es **receta** — nadie carga
   cuánto gel lleva un corte, así que `usaReceta` sigue siendo sólo de gastro.

**Verificado contra la base:** la compra mixta da 1 fila con el desglose
adentro, y el insumo sin clasificar sigue cayendo en `dry` sólo en gastro.
499 tests.

**Trampa para el que escriba tests: ARREGLADA el 18/ago.** En
`src/test/_chain.js` todos los métodos del builder eran **el mismo** `vi.fn`,
así que `.in` acumulaba también los `.eq` y los `.order`, y un
`not.toHaveBeenCalled()` no podía pasar nunca. Ahora cada método tiene su
propio mock (siguen devolviendo `self`, así que encadenar funciona igual).
Se corrió la suite entera al cambiarlo: 569 tests, ninguno dependía de la
acumulación. Los tests viejos que filtran por argumento siguen siendo
correctos, sólo que ya no hace falta.

---

## 16/ago/2026 (tarde) — ETAPA 3: GASTOS, COMPRAS Y PROVEEDORES

El edificio ya sabía cuánto cuesta producir (Etapa 2). Ahora sabe cuánto sale
todo lo demás. Migración 0030 + dos RPCs.

### Lo más reutilizable que salió

**Antes de portar una tabla, buscar quién la escribe hoy.** El plan pedía
`expenses`, `suppliers` y `purchases`. `purchases` y `purchase_items` existen
en el legacy desde el schema inicial y **ninguna pantalla las escribe**: una
compra son N filas de `expenses` (una por categoría de alimento, con el
detalle en `items` jsonb) más los ajustes de stock. `fetchPurchases` estaba en
`services/finance.js` sin un solo llamador. Un `grep` al principio se ahorra
una etapa de trabajo inútil.

**Regla nueva del molde: si toca varias filas y es plata, va a una RPC.** Es
la primera etapa que no se resuelve solo con tabla + service. Anular un gasto
y registrar una compra eran bucles desde el navegador con un rollback escrito
a mano en JavaScript — si el navegador se cierra en el medio, queda mercadería
ingresada sin su gasto. Ahora son `void_expense` y `register_purchase`, las
dos `security invoker`: la RLS sigue decidiendo quién toca qué, lo único que
cambia es que todo pasa en una transacción. Los guards contables (no anular
dos veces, no anular una anulación, no tocar un mes cerrado) viven en la DB, y
el email de quien anula sale del token y no de lo que mande el cliente.

**La trampa de los hijos que guardan solos volvió a aparecer**, tal como
estaba anotado: `ExpForm` y `Purchase` cargan y crean **proveedores** por su
cuenta, salteando cualquier saver de la pantalla que los contiene. Se revisó
antes de portar, así que esta vez no costó un bug.

### Hecho

- **0030**: `suppliers` y `expenses` con las mismas columnas del legacy +
  `tenant_id`. `expenses` **no tiene policy de DELETE** a propósito: un gasto
  se anula, no se borra, y esa regla la sostiene la base y no la buena
  voluntad de la pantalla.
- **Índice único de proveedores** por `(tenant_id, lower(btrim(name)))` —
  novedad contra el legacy, donde el campo era texto libre y generó duplicados.
  El `btrim` no es cosmético: sin él `"  Carniceria"` entraba como fila nueva.
  Se probó y pasaba.
- **`FinanzasPanel`**: las tres pantallas entran como UNA pestaña con tres
  solapas. La barra inferior se usa con el pulgar y seis ítems no entran.
  `Suppliers` va con `asPage` porque su raíz normal es `.ag-page-over`, que
  esconde el topbar y el nav — el bug de esta mañana, ahora con test.
- **Registry**: `finanzas` en los tres rubros; `contabilidadUsar` solo en
  gastro. Ningún componente pregunta por el vertical.
- **`schema:sync` ahora lee `.env.scripts`.** Con el archivo ya creado seguía
  respondiendo "sin credenciales — salteado", que se lee como "no hace falta"
  y deja el snapshot viejo sin que nadie se entere.

### Decisiones que conviene conocer

- **Un insumo sin `food_category` se resuelve por rubro.** En gastro cae en
  `dry` como el legacy: dejarlo sin clasificar lo sacaría del costo de comida
  del P&L y el food cost daría más bajo de lo real, en silencio — y no es raro,
  porque el alta rápida de insumo dentro de la compra no pide la categoría. En
  barbería y retail queda sin `usar_category`.
- **La foto del ticket quedó apagada.** Necesita un bucket de Storage y el
  edificio no tiene ninguno (las imágenes de producto se cargan pegando una
  URL). Se apagó entera con `permiteComprobante={false}` en vez de dejar un
  botón que falla.

### Verificado

**Contra la base, con `BEGIN`/`ROLLBACK`:** la compra completa (agregación de
líneas repetidas, stock, costo, desglose por categoría) y la anulación; y 11
casos negativos — insumo de otro negocio, compra vacía, tenant ajeno, anular
dos veces, anular una anulación, anular un mes cerrado, borrar un gasto,
proveedor duplicado (con y sin espacios), mismo nombre en otro negocio, y el
insumo sin clasificar en gastro vs barbería.

**Solo tests y build:** 494 tests. **Nadie lo tocó todavía con un usuario
real** — la lista de qué probar está al final de la Etapa 3 en `PLAN-ERP.md`.

---

## 16/ago/2026 — EL PANEL DEL EDIFICIO EXISTE Y EL ERP EMPEZO A MUDARSE

Sesion larga (19 commits, migraciones 0022 a 0029). El edificio paso de "un
cliente se registra y no tiene donde cargar nada" a tener panel con productos,
pedidos, configuracion, stock y recetas con costo real.

### El metodo que salio de esta sesion (lo mas reutilizable)

Las pantallas del admin legacy **no le hablan a la base, le hablan a un
service**, y los calculos (`useFinancials`) son funciones puras. De las tres
capas —pantalla, service, tabla— **se rehace una sola**.

Cada pantalla se porta asi: se le inyecta el saver por prop con **default
legacy** (asi el admin viejo no cambia en nada) y se apaga por `capacidades`
lo que dependa de tablas que todavia no estan. Encender un modulo despues es
cambiar un `false` por `true`. El molde completo esta en `PLAN-ERP.md`.

**Trampa que ya nos mordio:** al portar una pantalla hay que revisar si sus
**componentes hijos escriben por su cuenta**. `CatChipsEditor` y
`PaymentAccountsEditor` llamaban a `updateSettings` directo, salteando el
`onSave` inyectado. En el edificio eso es un cambio que no persiste y no
avisa — y en cuentas de pago era el dueno cargando su CBU, viendo el toast de
exito, y un checkout que seguia sin cuentas.

### Hecho

**Panel del edificio** (`src/pages/PlatformAdmin.jsx`) — panel NUEVO, no una
bifurcacion del legacy: `pages/Admin.jsx` carga recipes, ingredients, sales,
expenses y waste_log, y de eso el edificio no tiene ninguna tabla. Lo decide
`business.platform` en la ruta `/admin`, igual que `fetchCatalog`. **Los dos
paneles conviven y no comparten una sola tabla: no intentar unificarlos.**

**`attach_owner` (0024)** + `platform/scripts/attach-owner.mjs` — vincula un
dueno a un tenant que YA existe. Los 5 portados/demo se habian cargado sin
dueno y por eso nadie podia abrirles el panel. Ya estan los 7 con dueno.

**Registry de rubros** (`src/modules/registry.js`) — declara QUE ES cada rubro
(como se llama lo que vende, que campos carga, que modulos tiene). Ningun
componente vuelve a preguntar `vertical === 'barber'`. `implementado:
true|false` es la unica fuente de verdad de que existe hoy; la nav filtra por
ahi, asi que declarar un modulo futuro no ensucia la UI.

**Etapa 0 — settings en tabla (0025).** Fue tabla y no jsonb porque el bug
recurrente del repo (campo que se agrega a la UI, no al Zod, y se descarta en
silencio) tiene toda su red de contencion construida alrededor de columnas.
**El puente es lo importante:** habia dos lectores del jsonb en produccion
(`get_catalog` y la edge function `submit-order`). En vez de migrar los tres a
la vez —todo o nada, con plata en juego— la tabla es la verdad y un trigger
espeja al jsonb las claves que ellos leen. Siguen andando sin tocarlos.
**No escribir `tenants.settings` a mano: se pisa en el proximo guardado.**

**Etapa 1 — stock (0026).** `Stock.jsx` reusada con `onUpsert`/`onArchive`
inyectados. Indice unico parcial por `(tenant_id, lower(name))` sobre no
archivados. `adjustStock` **no es atomico**: lee y escribe en dos pasos;
cuando los pedidos descuenten stock solos tiene que pasar a RPC.

**Etapa 2 — recetas y costo (0028).** **No se porto `Recipes.jsx`**: en el
legacy "receta" y "producto" eran la misma fila, y en el edificio esa fila ya
es `products`. Traerla habria dejado dos lugares para cargar lo mismo. La
receta se edita dentro del formulario del producto. **Combos pospuestos** por
decision explicita (son recursivos, media etapa de complejidad, un cliente
nuevo no los necesita el primer dia).

**Tooling que se arreglo en el camino** (todo esto fallaba en silencio):
- `check-supabase-columns.mjs` medía TODO contra el schema legacy y ademas
  solo entendia `.select('literal')` — los archivos con `.select(COLS)` se
  salteaban ENTEROS. Los "✓ N archivos validan" incluian archivos que ni
  miraba. Ahora distingue las dos bases (`PLATFORM_PATHS`) y resuelve
  constantes de modulo.
- `npm run schema:sync` **ahora existe** (antes la doc lo mencionaba y no
  estaba), sobre el RPC `schema_snapshot()` (0023). Y hay un guard offline de
  frescura que corre en el pre-commit sin credenciales.
- `check-integrity-all` armaba UN comando con los ~225 paths de `src/`: al
  cruzar el limite de 8191 caracteres de Windows **dejo de dejar commitear**.
  Va por lotes.
- Los scripts de `platform/scripts/` no corrian en Windows
  (`import.meta.url === file://argv[1]` nunca da true con backslashes): salian
  con codigo 0 sin hacer nada.

### Bugs de esta sesion que vale conocer (todos fallaban sin avisar)

1. **Aislamiento entre tenants.** Las lecturas se apoyaban solo en RLS, que
   dice "las filas de cualquier tenant del que seas miembro" — correcto como
   frontera de seguridad, **inutil como filtro de alcance**. Con un dueno en
   5 tenants, el panel de cada uno mostraba los productos de todos. **RLS
   decide QUE PODES ver; el filtro por `tenant_id` decide QUE ESTAS MIRANDO.
   Hacen falta los dos.** Nunca hubo filtracion a terceros.
2. **El panel sin engranaje ni nav.** Las pestanias usaban `ag-page-over` como
   contenedor raiz: es un overlay full-screen y `admin-shared.css` tiene una
   regla que esconde el topbar y el bottom nav mientras exista uno en el DOM.
   El chrome se renderizaba y quedaba tapado — el DOM estaba perfecto, asi que
   leyendo el codigo no se veia nada raro.
3. **La marca del build en todos los tenants.** El login leia `settings`, que
   desde 0025 tiene RLS, y sin sesion caia al `business` compilado: todos
   decian "Cochi". Se resolvio con el RPC publico `get_tenant_brand` (0027).
   El `<title>` tenia lo mismo: `applyTenantHead` solo se llama desde
   `Catalog.jsx`, nunca desde `/admin`.
4. **`Number(null)` es 0.** El colchon de merma no se aplicaba: la pantalla
   mostraba `waste_pct ?? 5` (5%) y el costeo calculaba `Number(null)` (0%).
   Misma familia que `Number('')` en el precio, dos veces en un dia. Ahora
   null/undefined/'' es "sin definir" y un **0 explicito sigue valiendo 0**.
   0029 ademas puso defaults en la DB para que no haya una tercera lectura.
5. **El PWA no se podia actualizar.** La deteccion de version nueva andaba,
   pero `reload` era un `location.reload()` pelado y el service worker volvia
   a servir el build cacheado. Ni Ctrl+Shift+R ni cerrar todas las pestanias
   alcanzaban. `src/lib/hardReload.js` vacia los caches antes de recargar, y
   lo usan el banner **y** el rescate por chunk roto de `App.jsx` — ese
   segundo era peor: recargaba, el SW devolvia el mismo index con el mismo
   chunk inexistente, y el usuario quedaba con la pantalla rota.

### Verificado

**En produccion, por Ricky:** el panel entero (productos, pedidos, config,
stock, recetas), la separacion por tenant con datos reales, la terminologia
por rubro, el costo y el margen con el colchon aplicado. Quedaron 2 insumos y
2 lineas de receta cargadas de esas pruebas.

**Contra la base, con `BEGIN`/`ROLLBACK`:** `attach_owner` (idempotencia y los
3 guards), el puente de settings (escribir en la tabla se refleja en
`get_catalog` sin pisar lo que la tabla no modela).

**Solo tests y build:** 462 tests. Lo que NO se probo con un usuario real es
el checkout del edificio de punta a punta desde que existe la tabla settings.

### Pendiente inmediato

1. **Etapa 3 del `PLAN-ERP.md`**: compras, gastos y proveedores. Alimenta el
   otro lado del P&L y depende de la 1, que ya esta.
2. **`order_items.unit_cost` sigue en 0.** Ya hay con que calcularlo (la
   receta existe); falta que `submit-order` lo escriba al confirmar el pedido.
   Va con la Etapa 4, que es la que necesita ese dato.
3. Encender en la config del edificio lo que sigue apagado: QRs, paginas de
   info, pasarelas, canales de venta, zona de riesgo. Cada uno con su tabla.
4. Las `og:` tags siguen siendo las del build (compartir por WhatsApp muestra
   la marca equivocada). Necesita render en el edge — el `<title>` ya se
   arreglo, esto no.

### Bloqueado por Ricky

- **Nada tecnico.** Los scripts leen las credenciales de `.env.scripts`
  (ignorado por git), asi que no hace falta exportar nada por terminal.
- **Una decision, sin urgencia:** que pasa con `main`. Hoy sirve a los 3
  negocios legacy y esta congelada (0 commits desde que salio la rama). La
  rama lleva +9465 lineas, casi todo archivos nuevos, con 104 borradas
  repartidas en 10 archivos legacy — **no hay riesgo de conflicto**. Pero
  cuanto mas tiempo convivan las dos, mas se parece a una bifurcacion
  permanente. Las salidas son mergear cuando el edificio este maduro, o que
  esta rama pase a ser la principal y main quede archivada.

---

## 00. Actualizacion 14/ago/2026 — EL ALTA SELF-SERVICE FUNCIONA

**El producto se llama Dico. Divianco es la empresa.** No son
intercambiables: textos legales y copyright -> Divianco; marketing y
producto -> Dico. `dico.app` esta tomado por un tercero, por eso la
plataforma se queda en `divianco.app`.

**Probado punta a punta en produccion (14/ago):** alta nueva completa
(registro -> mail -> confirmacion -> tenant creado -> redirect al subdominio)
y recuperacion de una cuenta huerfana via login. Las dos OK.

### Hecho en esta sesion

**Correo (Resend)** — dominio `send.divianco.app`, region sa-east-1.
Los 4 registros DNS verificados a mano en Cloudflare (DKIM, MX, SPF, DMARC).
SMTP cargado en Supabase Auth. Limite de envio: 30 mails/hora en Supabase,
pero **el techo real es Resend free = 100/dia**; subir Supabase sin subir el
plan de Resend solo mueve donde rebota.

**Signup self-service** (`/registro`, `/bienvenido`, `/entrar`):
- `0016`+`0019` `signup_tenant()`: sin argumentos, toma la identidad de
  `auth.uid()` y lee los datos del negocio del `raw_user_meta_data`. NO se
  reuso `provision_owner` porque recibe el `user_id` como parametro: darle
  grant a `authenticated` dejaria crear tenants a nombre de otro. Es
  idempotente — devuelve el tenant existente con `already_existed=true`.
- `0020`+`0021` slugs reservados: UNA fuente en SQL (`is_reserved_slug`) y
  una en JS (`tenantHost.js`), con un test que las compara parseando la
  migracion. Incluye los subdominios de correo y `dico`.
- Los datos del negocio viajan en `user_metadata`, NO en localStorage: el
  mail se confirma a veces desde otro dispositivo.

**Login** (`/entrar`) — *nacio de un bug real*: en la primera prueba el Site
URL de Supabase estaba en `localhost:3000`, el redirect fallo y quedo una
cuenta CONFIRMADA sin forma de entrar. Resuelve los dos casos con la misma
llamada gracias a la idempotencia de `signup_tenant`. Los mensajes de error
son **ambiguos a proposito** (no distinguen mail inexistente de clave
incorrecta): precisarlos permitiria enumerar cuentas.

**Ciclo de vida** (`0017`) — `status` / `activated_at` / `first_order_at` /
`last_activity_at` + triggers. `release_dormant_tenants()` agendada con
pg_cron (4am UTC): a los 45 dias sin un solo producto, el slug se libera
(se RENOMBRA a `dormant-<id>`, no se borra). Ataca la ocupacion del
namespace, que es el danio caro, sin friccion en el alta.

**Rename a Dico** — landing, signup, bienvenida, login, manifest, favicon
generado, y el catalogo/admin legacy. Los identificadores internos
(`HermesMark`, `HERMES_BUSINESS_COPY`) y los nombres de infraestructura
(repo, proyecto Supabase, proyecto Vercel) se dejan: renombrarlos rompe
imports y deploys a cambio de nada.

### Bloqueado por Ricky
- Nada critico. Si abre el registro al publico, vigilar el consumo de
  Resend (100 mails/dia en el plan free).

### Pendiente inmediato (en orden)
1. **El panel del admin no esta conectado al edificio.** Un tenant nuevo se
   registra, entra a su subdominio y NO TIENE DONDE CARGAR PRODUCTOS. Es el
   bloqueante para que el signup sirva de algo. Bloque grande.
2. **Module registry por vertical**: hoy una barberia ve "Recetas" y el
   filtro "Vegetariano". La UI sigue siendo la gastronomica.
3. Formulario de contrasena nueva tras el reset (el link ya cae en
   `/entrar` con sesion, falta el form).
4. `og:` tags por tenant — compartir por WhatsApp muestra la marca del
   build. Necesita render en el edge.
5. `unit_cost` en 0: sin modelo de costos, el P&L no da.

---

## 0. Actualizacion 12/ago/2026

**Deploy vivo:** https://hermes-platform-sigma.vercel.app — proyecto Vercel
`hermes-platform` (`prj_3WSWrxws27VLbIDebl8mDqyTPxCC`), aparte de los 3 legacy.
OJO: `hermes-platform.vercel.app` SIN el `-sigma` es de un tercero (proyecto PHP),
no es un deploy roto. Se deploya por CLI (`npx vercel --prod`), NO por git: el WIP
del edificio no esta commiteado y pushear a main redeployaria los 3 legacy.

**Decisiones tomadas esta sesion:**
1. Un solo proyecto Vercel para TODOS los tenants, con el tenant resuelto en
   RUNTIME por hostname — no un proyecto por cliente. Un proyecto por cliente
   hace imposible el alta self-service (habria que crear carpeta + proyecto +
   envs + deploy por cada registro).
2. Wildcard `*.<dominio-propio>` para dar a cada tenant su puerta. Vercel NO da
   wildcard en `*.vercel.app`, asi que esto exige dominio comprado (pendiente).
3. Orden: checkout -> runtime multi-tenant + wildcard + signup self-service ->
   recien despues ERP y migracion de los 3 legacy.

**Por que ese orden:** migrar los 3 legacy = reconstruir el ERP entero
multi-tenant. Legacy `orders` tiene 42 columnas y `settings` 47; el edificio no
tiene `recipes`, `ingredients`, `recipe_ingredients`, `settings`, `customers`,
`expenses` ni `sales`. Un cliente NUEVO en cambio arranca vacio y no necesita
nada de eso, asi que el signup puede salir meses antes que la migracion.

**Hecho (checkout del edificio):**
- `0012_checkout_core`: `orders` de 8 a 25 columnas (envio, pago + snapshot
  anti-spoof, propina, descuento, regalo, cupon), `order_items.subtotal`,
  tabla `coupons` con RLS por tenant, `rate_limits` + `check_rate_limit`.
- `0013_get_catalog_v2_checkout`: **fix** — v1 mandaba `sold_out_override:false`
  y eso significa "forzar agotado" (ver src/lib/stockAvailability.js), asi que
  TODO el catalogo salia AGOTADO. Va `null`. Ademas expone `payment_accounts`
  (filtradas server-side: sin cuentas de proveedor) y `delivery_pricing`.
- `platform/functions/submit-order/index.ts`: version multi-tenant, deployada
  con verify_jwt=false. Probada: pedido OK, aislamiento entre tenants OK
  (producto de otro tenant -> 400), sin tenant_slug -> 400.
- `src/services/catalog.js`: manda `tenant_slug` solo si `business.platform`.

**Hecho (resolucion de tenant en runtime, 13/ago/2026):**
- Dominio `divianco.app` + wildcard `*.divianco.app` en el proyecto, cert
  emitido. DNS en Cloudflare: `A @` y `A *` -> 76.76.21.21, **DNS only /
  nube gris** (Cloudflare free no proxea wildcards).
- `0014_tenant_host_resolution`: `tenants.domain` (dominio propio del cliente),
  CHECK de formato de slug + lista de slugs RESERVADOS (que nadie registre
  `www`, `admin`, `api`...), y RPC publico `get_tenant_by_host`.
- `src/lib/tenantHost.js`: parseo puro host -> tenant/root/unknown. 14 tests
  en `src/test/tenantHost.test.js` (incluye multi-nivel, reservados y
  dominios que se le parecen). Suite completa: 313 tests OK.
- `src/lib/activeTenant.js`: subdominio sincronico (sin red), dominio propio
  via RPC, fallback a `business.slug` para local y previews.
- `src/services/catalog.js`: `fetchCatalog` y `submitOrder` usan el slug
  resuelto por hostname, no el del build.
- `src/pages/PlatformLanding.jsx` + gate en App.jsx: la raiz sirve landing,
  no el catalogo de nadie (antes `fetchCatalog` devolvia null y el catalogo
  lo leia como "Supabase caido").

VERIFICADO en produccion: `mala-miga.divianco.app` sirve los 8 productos de
Mala Miga y `barberia-demo.divianco.app` los suyos, DESDE EL MISMO BUILD que
tiene `CLIENT=hermes-cochi` horneado. `divianco.app` sirve la landing.

**Lo que sigue acoplado al build (el `<head>`):** para TODOS los tenants,
`document.title` dice "Cochi", el meta `theme-color` es `#c91b14` y el favicon
apunta a `/clients/hermes-cochi/favicon.png`. Los genera el plugin de
vite en index.html. Falta tambien el manifest PWA por tenant. El `--ac` del
catalogo SI sale bien (viene del sistema de temas, no de business.js).

**Pendiente inmediato:**
- Verificar el formulario de checkout en un browser real (el pane headless de
  la sesion no entrega clicks a React; el carrito SI funciona, verificado por
  DOM click).
- `tenants.settings` de cochi tiene delivery_pricing y prep_time_min, pero
  `payment_accounts` VACIO a proposito = solo efectivo. No cargar CBU/alias
  inventados en un negocio real.
- `unit_cost` de order_items va en 0: el edificio no tiene modelo de costos.
- Consola del catalogo: `fetchSettings` (App.jsx:107) sigue pegandole a la
  tabla `settings` que no existe en el edificio, y falta el RPC
  `get_weekly_top`. Ninguno bloquea el pedido.
- Los placeholders `__BIZ_TITLE__`, `__BIZ_SUPABASE_URL__` y 6 mas quedan sin
  reemplazar en el HTML — bug PREEXISTENTE del build, pasa igual en local.

---

## 1. Que estamos haciendo

Pivot de hermes-gastro (SaaS single-vertical gastro) a **plataforma multi-rubro
multi-tenant**: gastro / barberia / ropa, en UN codebase y UNA base de datos
compartida con RLS por `tenant_id`. Los 3 gastro viejos estan dormidos y se
consolidan como tenants del edificio nuevo (no se migra data transaccional).

## 2. Infra

| Que | Valor |
|-----|-------|
| Org Supabase | `lidtvkdatrcxcpmvioup` |
| **Edificio** (proyecto nuevo) | `hermes-platform` ref `wwwzdgprsooyjgkuyoav`, sa-east-1 |
| URL | https://wwwzdgprsooyjgkuyoav.supabase.co |
| anon/publishable key | `sb_publishable_8gMlo42jYdK8epcD-Zr9TQ_eKmY2nW-` |
| service role | solo del dashboard, NUNCA en repo/chat |
| gastro viejos (PAUSADOS, data intacta) | cochi `nzrzfknvlnddpexghynq` · mala-miga `tszcksppdglktcmzgepd` · la-nona-pato `rewzotanfurutjolghkf` |

Free tier = 2 proyectos activos. Hoy solo `hermes-platform` activo. Para leer los
gastro viejos hay que pausar uno y restaurar el otro (reversible, tarda minutos).

## 3. DB del edificio (migraciones aplicadas, en `platform/migrations/`)

- **0001** fundacion: `tenants`, `tenant_members`, `products` (con `type`:
  composite|simple|variant_parent|service) + RLS. Helper `current_user_tenants()`.
- **0002** helper movido a schema `private` (linter).
- **0003** core Pedidos: `orders`, `order_items`.
- **0004** POS/Caja: `payment_methods`, `cash_sessions`, `payments` (split).
- **0005** pack barberia: `staff`, `appointments` (exclusion constraint anti-solape),
  `products.duration_min`.
- **0006** `btree_gist` a schema `extensions`.
- **0007** pack ropa: `product_variants` (talle/color/sku/barcode/stock),
  `store_credits`, `product_returns`, `products.stock`.
- **0008** auth: `profiles` + `provision_owner()` (tenant+owner+profile atomico).
- **0009** `products` gana category/description/image_url.
- **0010** `products.requires_age_gate` (+18 mala-miga).
- **0011** `get_catalog(slug)` RPC publico (shape de catalog-pro).

Patron RLS (toda tabla de negocio): `tenant_id uuid not null references
tenants(id)` + `enable row level security` + policies `using/with check
(tenant_id in (select private.current_user_tenants()))`.

Advisors de seguridad: **limpio salvo 2 warnings INTENCIONALES** de `get_catalog`
(es endpoint publico, anon debe poder llamarlo).

Test de aislamiento (correr si tocas RLS): `platform/tests/tenant_isolation.sql`
(SQL rapido) y `platform/tests/isolation_e2e.mjs` (RLS real via API con JWT).

## 4. Tenants y datos actuales

| slug | vertical | datos |
|------|----------|-------|
| la-nona-pato | gastro | 43 productos, 10 cat (sin desc/img: backfill pendiente) |
| cochi | gastro | 10 productos, 4 cat (con desc+img) |
| mala-miga | gastro | 11 productos, 5 cat (2 con +18) |
| barberia-demo | barber | 2 barberos, 2 turnos demo, 1 servicio |
| tienda-demo | retail | 1 producto padre + 3 variantes (S/M/L) |

Catalogo gastro real portado (recipes -> products composite). Las imagenes
apuntan al storage de los proyectos viejos (viven mientras existan; copiar
buckets = paso aparte).

## 5. Auth (decidido: por script)

- **`platform/scripts/create-owner.mjs`**: recibe email+name+vertical+slug ->
  crea auth user -> `provision_owner` (tenant+owner+profile atomico) -> si el
  vinculo falla, borra el user (rollback). Exporta `createOwner()` para reuso.
- Reusa lo mismo: el test e2e y, en B6, el boton de signup self-service.
- Correr con env `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
  Requiere `npm i @supabase/supabase-js`. (No se corrio en la sesion: necesita
  service role.)
- **`platform/scripts/attach-owner.mjs`** (15/ago): linkea un dueno a un tenant
  que YA existe — los 5 portados/demo, que se cargaron sin dueno y por eso no
  se les podia abrir el panel. Usa la RPC `attach_owner` (migracion 0024), que
  es idempotente. `create-owner` no servia para esos: crea el tenant.
  `node platform/scripts/attach-owner.mjs --email x@y.com --slug cochi`

## 6. Front (reuso de hermes-gastro)

- Build nuevo tipo "platform": `.env.hermes-cochi` (apunta al edificio) +
  `clients/hermes-cochi/business.js` (`platform: true`, `slug: 'cochi'`).
- `src/services/catalog.js` -> `fetchCatalog()` bifurca: si `business.platform`,
  usa RPC `get_catalog(slug)`; si no, deja el camino viejo (single-tenant sobre
  `recipes`) intacto para los clients legacy.
- Se reusa TAL CUAL: `src/catalog-pro/*`, `src/contexts/AuthContext.jsx`,
  `src/components/admin/LoginScreen.jsx`, `src/lib/supabase.js`
  (env `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`).
- Correr (git bash): `bash platform/dev-cochi.sh` o
  `cd ~/Proyectos/hermes-gastro && npm install --include=dev && CLIENT=hermes-cochi npm run dev`.

## 7. Operativo vs pendiente

**Operativo hoy:** catalogo publico de cochi (home/categorias/producto) leyendo
del edificio via `get_catalog`.

**Pendiente para dejar todo vivo:**
1. Deploy de edge functions al edificio: `submit-order`, `validate-coupon`,
   `mp-*`, + RPCs `get_server_time`, `upsert_customer` (para el checkout).
   Recordar `verify_jwt=false` en las publicas (bug #6 CLAUDE.md).
2. `attach_owner` + login admin + apuntar Orders/Stock/Finance al edificio.
3. Module registry (`src/modules/registry.js`) + nav que se arma segun
   `tenant.vertical` (Recetas|Servicios|Productos, etc.).
4. UI de los packs: agenda (barberia) y grilla de variantes (ropa).
5. B6: signup self-service (boton -> `createOwner`).
6. Backfill desc/imagenes de LNP; copiar buckets de storage.

## 8. Gotchas (de CLAUDE.md + esta sesion)

- NO escribir via el mount Linux; solo herramientas del lado Windows. UTF-8 strict.
- `NODE_ENV=production` global se come devDeps -> `npm install --include=dev`.
- git bash: env var inline (`CLIENT=x npm run dev`), NO `set CLIENT=x&&` (eso es CMD).
- Toda tabla nueva: tenant_id + policy patron + test de aislamiento ANTES (TDD).
- `get_catalog` SECURITY DEFINER expuesto a anon = intencional (endpoint publico).
- Restaurar proyecto pausado tarda varios minutos y la conexion "flapea" al final.

## 9. Orden sugerido para seguir

1. `attach_owner` + correr `create-owner` -> login admin del edificio andando.
2. Edge functions `submit-order` (+deps) al edificio -> checkout vivo.
3. Module registry + nav por vertical.
4. UI packs barberia/ropa.
5. B6 signup self-service.
