# Dico 2D — assets productivos

Los siete estados de `nativeState`, a 256x256, **con el alfa normalizado**.

**No se editan a mano.** Se generan desde `platform/brand/dico-2d-masters/` con:

```
node scripts/dico-2d-derivar.mjs           # regenera
node scripts/dico-2d-derivar.mjs --check   # falla si el disco no coincide
```

## Que se le hizo al master

**Sólo el canal alfa.** El RGB quedó byte a byte idéntico: verificado, 0
diferencias en los siete archivos.

| | |
|---|---|
| `a == 0` | queda en 0 — el fondo ya era transparente de verdad (51% del canvas) |
| `1..244` | **intacto** — es el antialiasing del borde |
| `a >= 245` | pasa a 255 |

Los masters venían con el cuerpo en alfa **251-254**: un export casi-opaco. No
era checkerboard ni fondo incrustado, pero dejaba hasta un 1,6% de mezcla con lo
que hubiera debajo. Medido sobre damero, el mismo píxel de oro daba distinto
según cayera en cuadro claro u oscuro: diferencia media **0,378-0,400** sobre
255. Después de normalizar: **0,000**.

## Verificado sobre blanco, Zinc/Carbon oscuro y damero técnico

| | |
|---|---|
| Halo | **no** — 0 píxeles con alfa 0 y RGB residual |
| Borde duro | **no** — el AA 1-244 no se tocó |
| Gold y Blue lavados | **no** — RGB idéntico |
| Ojos y cejas | idénticos por construcción |
| Geometría | caja idéntica: `988x974 @ (132,116)` antes y después |

## Registro

Los siete comparten canvas y geometría **exactos** — dispersión 0,000pp en
centro, ancho y alto — así que alternar estados no mueve un píxel del encuadre.

| | |
|---|---|
| Centro del personaje | 49,80% X / **48,05% Y** — no está en el medio |
| Tamaño | 78,91% de ancho / 77,73% de alto |
| Aro azul | r/R **0,67** del radio del personaje — no está en el borde |

Esos tres números son los que necesita `DicoPulso` para calzar sobre el aro.

## Reglas

- No recrear en SVG.
- No modificar ojos ni cejas.
- No agregar boca: Dico 2D comunica con cejas y ojos.
- No editar estos archivos: editar el master y regenerar.

## Nota sobre `public/`

Vite copia `public/` tal cual: estos archivos se referencian por URL, **no pasan
por el grafo de imports**. El gate de B5 que impide que un asset legacy entre al
bundle no los cubre. Si se suman más assets acá, conviene extender ese gate.
