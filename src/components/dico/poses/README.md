# El cuerpo articulado de Dico

El Core usa dos fuentes visuales, **sin cara ni galera**:

```
moneda-sin-brazos.webp  base limpia de la moneda
moneda.webp             fuente de los dos brazos y guantes
```

`DicoCara.jsx` recorta cada brazo del segundo archivo y lo articula desde el
hombro. La cara la dibuja `CaraDeTinta.jsx` encima, en SVG. Por eso no hay una
imagen por estado: expresiones y poses son curvas y transforms, no renders.

`moneda-retro-galera.webp` conserva el cuerpo anterior como fuente para una
futura escena Retro. Los globs de `DicoCara` cargan sólo los dos archivos
nombrados arriba; el cuerpo con galera no forma parte de Dico Core.

- Mientras falte cualquiera de los dos sprites activos, `DicoCara` dibuja una
  moneda **provisoria** en SVG. Es a propósito: un `import` de un archivo que
  no existe rompe el build.
- Si al ponerla la cara queda corrida, se ajusta `CAMPO` en `CaraDeTinta.jsx`
  —centro y radio del disco liso, en el viewBox de 120— y nada más.

El prompt para generarla y los requisitos están en
`platform/BRIEF-DICO-CUERPO.md`.

## Poses completas heredadas

Los archivos `escena-*.webp` son para `DicoEscena` y conservan la identidad
anterior. No se usan en el flujo operativo ni se cargan en su bundle. Quedan
para migracion futura, campañas o Retro Moments. Las composiciones grandes de
producto usan `DicoCoreEscena`, que monta el mismo `DicoCara` modular.

| Pose | Uso |
|---|---|
| `idle` | Presentacion neutra |
| `explica` | Consejo o explicacion |
| `pregunta` | Confirmacion delicada |
| `descubre` | Sorpresa o hallazgo |
| `celebra` | Exito o bienvenida |
| `senala` | Estado vacio con una accion |
| `fatal` | Falla irrecuperable; no usar para errores comunes |

Los derivados de produccion son WebP de 800x800 y menos de 100 KB. Los PNG
fuente no se cargan desde la app.
