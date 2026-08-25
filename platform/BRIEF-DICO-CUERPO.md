# Brief — el cuerpo de Dico

> **Un solo render, y sin cara.** Reemplaza al brief de seis poses: con la cara
> de tinta encima, las expresiones son SVG y no hacen falta renders por estado.

---

## Por qué uno solo

La cara es una capa de tinta plana dibujada en SVG arriba del render. Eso
cambia el pedido de raíz:

| | Seis poses | Un cuerpo + cara de tinta |
|---|---|---|
| Imágenes a generar | 6, y tienen que calzar entre sí | **1** |
| Consistencia entre estados | el riesgo principal | **no existe: es la misma imagen siempre** |
| Una expresión nueva | otro render | dos curvas |
| Parpadeo y pupilas | imposibles en un PNG | ya funcionan |
| A 30px | el sombreado 3D se empasta | la tinta se lee |

Y de paso resuelve lo que dijiste de la última versión: una cara 3D con
mejillas y nariz esculpidas se ve "humana" —cae en el valle inquietante— y una
de tinta no puede caer ahí, porque no pretende ser real.

---

## El prompt

Lo que va en mayúscula es lo que el modelo se saltea si no se lo grita. Los
generadores tienden a grabarle una cara o un número a cualquier moneda: por eso
la negación va repetida.

```
3D render of a gold coin character body, front view, facing the camera straight
on, centered, floating.

Polished gold coin, perfectly circular, seen face-on. Visible milled reeded edge
around the rim and a beveled border with embossed concentric ring detail.

THE FACE OF THE COIN IS COMPLETELY BLANK AND SMOOTH. NO FACE, NO EYES, NO MOUTH,
NO NOSE, NO TEXT, NO NUMBERS, NO ENGRAVING, NO SYMBOLS in the center. Just clean
empty polished gold.

Thin copper-orange rubber-hose arms coming out from behind the coin at the sides,
with white four-finger cartoon gloves, relaxed and hanging down. NO LEGS, NO FEET.

Soft studio lighting from the upper left, subtle ambient occlusion, glossy
metallic gold material.

Plain flat neutral grey background, no ground shadow.

Square composition, the coin fills about 62% of the frame with empty margin on
all sides.

Pixar-style 3D product render, high detail, clean, professional.
```

**De frente y no en 3/4**, aunque el 3/4 haya salido más lindo. Dos razones: la
cara plana se monta sobre un círculo sin deformarla (sobre una elipse hay que
proyectarla y calibrarla a ojo), y de frente se lee mejor a 30px. El 3/4 que ya
tenés queda para el hero del alta y para marketing, donde entra a 190px.

---

## Requisitos

| Qué | Cómo |
|---|---|
| Nombre | `moneda.webp` (o `.png` / `.avif`) |
| Dónde | `src/components/dico/poses/` |
| Fondo | **Transparente.** Se genera sobre gris plano y se recorta después |
| Lienzo | Cuadrado, moneda centrada, ~62% del alto |
| Tamaño | **512×512** |
| Peso | Bajo 80 KB |

**La cara del disco tiene que estar limpia de verdad.** Cualquier grabado en el
centro va a competir con los ojos de tinta. Si el generador insiste en ponerle
algo, se borra a mano: es una imagen sola, no seis.

---

## Cuando esté

No hay nada que cablear: el componente busca `poses/moneda.*` y si lo encuentra
lo usa; si no, dibuja una moneda provisoria en SVG. Se verifica acá:

```bash
npm run vitrina
```

`http://localhost:5199/?escena=dico`. Lo que hay que mirar:

1. **Que la cara caiga sobre el disco.** Si el render tiene la moneda más
   grande o más chica que la provisoria, la tinta va a quedar corrida. Se
   corrige con `CAMPO` en `src/components/dico/CaraDeTinta.jsx` — un centro y
   un radio, nada más.
2. **A 30px**: que se distinga `contento` de `preocupado`.
3. **Sobre fondo oscuro**: que no haya quedado un halo gris del recorte. Es el
   error más común y sólo se ve sobre negro.

---

## Lo que ya está hecho

- `CaraDeTinta.jsx` — los cinco estados en tinta, estilo rubber hose.
- `DicoCara.jsx` — elige render o moneda provisoria, misma API de siempre:
  `<DicoCara estado="contento" size={30} />`.
- `dico.css` — todo el movimiento: boya, bamboleo, follow-through, sacadas,
  parpadeo doble irregular, salto con squash, ladeo, y la entrada girando.
- `BurbujaDico.jsx` — el globo de historieta, con tipeo letra por letra.

---

## Los ojos: en qué formato mandarlos

La cara que hay ahora está dibujada **a ojo desde una referencia chica**, y por
eso no se parece. No es cuestión de intentarlo de nuevo: con una imagen de
100px no hay forma de sacar las curvas exactas. Lo que cambia el resultado es
el formato.

### 1. SVG — el bueno, y por lejos

La hoja de caras que pasaste dice **"EDITABLE STROKE"**: es un pack vectorial.
Si tenés el archivo original (`.svg`, `.ai` o `.eps`), es la solución completa:

- Leo el markup y **levanto los paths exactos**. Cero interpretación.
- La hoja tiene ~28 expresiones, así que **los cinco estados salen del mismo
  pack** y en el mismo trazo. El problema de consistencia desaparece para
  siempre, y agregar un estado nuevo es elegir otra cara de la hoja.

Cómo conseguirlo:
- El pack que descargaste ya trae `.eps` o `.ai`. Abrilo en Illustrator,
  Inkscape (gratis) o Figma y exportá **SVG**.
- En Figma alcanza con pegar el vector, botón derecho → *Copy as SVG*.

Dónde ponerlo: `src/components/dico/poses/cara.svg`. Si son varias, una por
estado: `cara-idle.svg`, `cara-contento.svg`, etc. **No hace falta separar
ojos de boca**: mandá la cara entera y yo la parto.

> Si el pack es de stock, revisá que la licencia habilite uso comercial dentro
> de un producto. No es un detalle menor cuando el personaje es la marca.

### 2. PNG con transparencia — el segundo

Sólo la cara, **sin la moneda**, sobre fondo transparente, de 1024px o más,
tinta plena. Lo calco a paths. Sale bien, pero hay interpretación mía en el
medio: las curvas las reconstruyo, no las copio.

### 3. JPG con fondo — el que ya probamos

Redibujo a ojo. Es lo que falló dos veces. Sirve para decidir el estilo, no
para clavar el dibujo.

### Cómo "subirlo"

Guardá el archivo en `src/components/dico/poses/` y decime el nombre. Leo
directo de ahí — así llegaron los dos renders de la moneda.

### Qué pasa cuando llegue

Se cambian los paths de `CaraDeTinta.jsx` y nada más. El armado, los cinco
estados, el parpadeo, las sacadas y todo el movimiento **no se tocan**: están
enganchados por clase (`dico-ojo-tinta`, `dico-pupila`, `dico-boca--neutra`…),
no por la forma del dibujo.
