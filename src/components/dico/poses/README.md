# El cuerpo de Dico

Acá va **una sola imagen**: el render de la moneda, **sin cara ni galera**.

```
moneda.webp     (o .png / .avif)
```

La cara la dibuja `CaraDeTinta.jsx` encima, en SVG. Por eso no hay una imagen
por estado: las expresiones son curvas, no renders.

`moneda-retro-galera.webp` conserva el cuerpo anterior como fuente para una
futura escena Retro. El glob de `DicoCara` carga solo `moneda.webp`, por lo que
ese archivo no forma parte de Dico Core ni aumenta el bundle de la app.

- Mientras no exista `moneda.*`, `DicoCara` dibuja una moneda **provisoria** en
  SVG. Es a propósito: un `import` de un archivo que no existe rompe el build,
  y producción muestra esto hoy.
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
