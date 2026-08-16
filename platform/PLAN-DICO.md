# Plan: Dico, el asistente

> Estado al 16/ago/2026. **Nada de esto está hecho todavía.** Es el plan
> acordado para no construir la parte cara antes que la barata.

Dico es el personaje que le da cara a la plataforma y, más adelante, el
asistente que le cuenta al dueño qué está pasando en su negocio.

---

## El personaje

- **Sin piernas.** Dentro de la app Dico es una moneda con bracitos: entra en
  espacios chicos, se anima barato y funciona a cualquier tamaño.
- **La versión con piernas y zapatos es para marketing**, no para la app.
  Landing, redes, material de venta.

Tener una sola versión adentro es lo que hace que veinte poses se sientan el
mismo personaje. Antes de generar más arte, cualquier pose nueva se hace sobre
el cuerpo sin piernas.

---

## Las tres capas, de la más barata a la más cara

El orden no es de importancia: es de **costo y riesgo**. Las dos primeras no
usan IA y son las que dan casi todo el valor percibido.

### Capa 1 — Dico como cara de la app

Loading, estados vacíos, errores, confirmaciones, éxito. Cero IA, cero costo
por uso, no depende de ninguna etapa del ERP.

Las expresiones que ya existen mapean casi uno a uno con los estados que la
app ya tiene hoy:

| Estado en la app | Hoy | Con Dico |
|---|---|---|
| Cargando | "Cargando..." | Dico esperando |
| Lista vacía | "Sin gastos registrados" | Dico señalando el botón |
| Error / chunk roto | texto de error | Dico preocupado + qué hacer |
| Guardado OK | toast "✓" | Dico con el pulgar arriba |
| Confirmación destructiva | slide to confirm | Dico con cara de "¿seguro?" |

Es la misma información con otra sensación. **Se puede hacer en cualquier
momento y no bloquea nada.**

### Capa 2 — Dico que suelta datos, sin LLM ✅ PRIMERA VERSIÓN (16/ago)

`src/modules/dico/reglas.js` (funciones puras, 19 tests) +
`DicoAvisos.jsx` en la pestaña de entrada del panel. Nueve reglas, ordenadas
por gravedad y **cortadas en 4** — veinte avisos son cero avisos.

Tres cosas que quedaron decididas y conviene no reabrir:

- **`listo` es obligatorio.** Mientras el panel carga, las listas llegan
  vacías. Sin ese corte, Dico le dice "todavía no cargaste ningún producto" a
  alguien que tiene cuarenta. Un asistente que se equivoca una vez así no se
  vuelve a leer.
- **Se puede cerrar, y vuelve cuando cambia lo que tiene para decir** (se
  compara la firma de los avisos, no un booleano). Cerrar es "ya lo vi", no
  "no me hables nunca".
- **Sin receta no opina del margen.** Con costo 0 el margen daría 100% y todo
  parecería rentabilísimo — la misma decisión que ya se tomó en el costeo.

Falta: el arte. El lugar está reservado (`.dico-cara` en `DicoAvisos.jsx`) y
no se puso un placeholder para no tener que ir a buscarlo después.

#### El truco 2.5D (decidido 16/ago, arte en manos de Ricky)

Para que Dico se sienta "3D" siendo 2D (referencia: Miss Minutes de Loki), no
hace falta 3D ni un runtime de animación. Son cinco trucos, todos transforms
de CSS sobre capas de UN SVG. Prototipo funcionando en
`platform/dico-prototipo-2.5d.html` (abrirlo en el browser y tocar los
botones):

1. **La luz nunca se mueve.** Gradiente radial, brillo especular y media-luna
   de sombra quedan clavados al mundo aunque el cuerpo gire o salte. Es lo que
   convierte un círculo plano en una esfera iluminada.
2. **La cara viaja más que el cuerpo** (parallax) y se angosta al acercarse al
   borde (foreshortening), recortada por un `clipPath` de la moneda. Los
   rasgos flotan SOBRE la superficie, no están pegados al cuerpo.
3. **El canto de la moneda aparece al girar** — una elipse finita oscura que
   asoma del lado opuesto. Grosor con una sola forma.
4. **Squash & stretch conservando volumen** (se estira a lo alto = se angosta
   a lo ancho), con anticipación y aterrizaje.
5. **Follow-through:** la cara llega ~0,1s tarde a lo que hace el cuerpo.
   Parpadeo con `scaleY` (nunca opacity), easing con overshoot
   (`cubic-bezier(.34,1.56,.64,1)`).

**Decisión de implementación:** componente `DicoCara.jsx` a mano — SVG en
capas + estados como clases CSS (`idle`, `mira`, `contento`, `preocupado`,
`esperando`). Cero dependencias, ~3KB, tematizable con los tokens. Rive o
Lottie solo si algún día hacen falta veinte poses de animador; para cinco
emociones es un runtime de 60-100KB al pedo.

**Ojo para producción:** la boca del prototipo usa `d: path()` en CSS, que no
anda en Safari. Cambiarla por dos paths con crossfade o `<animate>`.

Ricky está desarrollando el diseño canónico del personaje sobre esta base y
manda un producto más terminado; el prototipo es la referencia técnica, no el
arte final.

<details>
<summary>El razonamiento original</summary>

Reglas sobre datos que ya existen, escritas a mano. Se siente inteligente, no
cuesta un peso, **no puede alucinar**, y no puede filtrar entre negocios si la
consulta ya está acotada por `tenant_id`.

Lo que ya se puede calcular hoy, con lo que hay:

- **Stock bajo mínimo** — `bajoMinimo()` ya existe en `platformInventory.js`.
- **Margen negativo o sospechoso** — el costeo de la Etapa 2 ya lo calcula.
- **Producto sin receta** — el margen da `null`; hoy simplemente no se muestra.
- **Mes sin gastos cargados** — van N días del mes y `expenses` está vacía.
- **Insumo sin clasificar** (gastro) — ensucia el food cost del P&L.
- **Proveedor sin tipo** — aparece en las dos pantallas y confunde.

**El registry ya sirve para esto.** `src/modules/registry.js` sabe cómo se
llama cada cosa en cada rubro, así que Dico puede hablar el idioma del negocio
sin un `if` por vertical: "te faltan turnos cargados" en una barbería,
"te faltan insumos" en una cocina.

Dónde vive: un módulo `src/modules/dico/reglas.js` de **funciones puras** sobre
los datos que el panel ya tiene en memoria — mismo criterio que `useFinancials`
y que el costeo de recetas. Nada de consultas nuevas por regla.

</details>

### Capa 3 — Dico conversacional (LLM)

**No antes de las Etapas 4 y 5 del ERP.** Tres razones, por orden de gravedad:

1. **Filtración entre negocios.** Ya pasó dos veces que la RLS alcanzaba como
   frontera de seguridad y no como filtro de alcance. Un LLM que consulta la
   base multiplica esa superficie: alcanza una consulta sin filtro, o un
   prompt injection escondido en el nombre de un producto, para que un negocio
   vea los números de otro. Eso no es un bug, es el fin del producto.
   **Regla dura: el LLM no genera SQL y no toca la base.** Recibe un resumen
   ya calculado y ya acotado al tenant.
2. **El costo es por uso y por tenant**, en un SaaS con márgenes finitos. Sin
   techo por plan, es un costo que no se puede predecir ni trasladar.
3. **La calidad del dato.** Hoy el P&L del edificio no cierra: `unit_cost` va
   en 0 y no existe el módulo de ventas. Una IA que "suelta datos relevantes"
   sobre datos incompletos dice cosas equivocadas con total seguridad, que es
   peor que no decir nada.

---

## Orden

```
Capa 1 (cara)      ── independiente, cuando se quiera. Falta el arte como asset.
Capa 2 (reglas)    ── ✅ primera versión, 16/ago
Capa 3 (LLM)       ── después de Etapa 4 (ventas y P&L) y 5 (clientes)
```

## Qué probar de la capa 2

En **la-nona-pato**, en la pestaña de entrada del panel:
1. Debería aparecer el cartel de Dico con lo que esté mal hoy (hay insumos sin
   clasificar y probablemente productos sin receta).
2. Tocar el botón de un aviso te lleva a la pestaña que corresponde.
3. Cerrarlo con la ✕ y cambiar de pestaña y volver: **no** tiene que volver.
   Arreglar lo que decía y romper otra cosa: **sí** tiene que volver.
4. En un tenant vacío (`prueba-disco`) tiene que decir "todavía no cargaste
   ningún producto" — y **nunca** decirlo en uno que sí tiene.
5. En **barberia-demo** no puede hablar de recetas ni de tipo de comida.
