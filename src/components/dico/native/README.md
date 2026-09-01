# Dico 2D — derivados de runtime

Los siete estados de `nativeState`, a 256x256, generados desde los masters de
`platform/brand/dico-2d-masters/` por promedio de area con alfa premultiplicada.

**El master no se toca.** Estos son derivados: si hay que regenerarlos, se hace
desde alla, no editando estos.

## Por que 256 y no el master

Dico 2D se pinta a 32-44px en la sidebar. Incluso a 3x de densidad son 132px.
Servir el master seria mandar 4,7 MB para dibujar un icono; los derivados pesan
392 KB en total.

## Por que alfa premultiplicada al reducir

Sin premultiplicar, los pixeles totalmente transparentes arrastran su color al
promedio y aparece una orla clara alrededor del personaje. Verificado sobre
fondo claro y oscuro: no hay orla.

## Registro

Los siete comparten canvas y geometria EXACTOS —dispersion 0,000pp en centro,
ancho y alto— asi que alternar estados no mueve un pixel del encuadre.

| | |
|---|---|
| Centro del personaje | 49,80% X / 48,05% Y |
| Tamanio | 78,91% de ancho / 77,73% de alto |
| Aro azul | r/R 0,67 del radio del personaje |

Esos numeros son los que necesita `DicoPulso` para calzar sobre el aro: el
personaje NO esta centrado en la caja y el aro NO esta en el borde.

## Reglas

- No recrear en SVG.
- No modificar ojos ni cejas.
- No agregar boca: Dico 2D comunica con cejas y ojos.
