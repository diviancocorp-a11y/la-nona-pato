# Dico 2D — masters

Los siete PNG entregados por producto el 1/sep/2026 (`DICO_2D_FINAL_ASSETS.zip`).
**Son la fuente visual oficial de Dico 2D.** No se recrean, no se reconstruyen en
SVG, no se modifican ojos ni cejas, no se agrega boca.

Viven aca y **no en `src/`** a proposito: nada los importa, asi que no entran al
bundle. El runtime usa los derivados de `src/components/dico/native/`, generados
a 256px desde estos mismos archivos.

## Medido

| | |
|---|---|
| Canvas | 1024x1024 los seis expresivos, 1254x1254 el neutral |
| Alfa | RGBA real: 51% totalmente transparente |
| Cuerpo | alfa 251-254, no 255 — menos del 2% de mezcla, imperceptible |
| Centro del personaje | 49,90% X / 48,05% Y |
| Tamanio del personaje | 78,81% de ancho / 77,64% de alto del canvas |
| Dispersion entre los 7 | centroX 0,022pp · centroY 0,001pp · ancho 0,021pp |
| Aro azul | r/R 0,62 a 0,72, centro 0,67 |

La dispersion casi nula es lo que permite alternar estados sin salto de encuadre.
La diferencia de canvas del neutral NO implica diferencia geometrica.

## SHA-256 de los masters

Ver `platform/DICO-FINAL-ASSET-MANIFEST.md`.
