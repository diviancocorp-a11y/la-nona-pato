# Dico Physical 3D — paquete final versionado

- **Estado:** `PACK PASS`
- **Rama de preparación:** `prep/dico-3d-final`
- **Fecha de cierre:** 2026-09-02
- **Integración runtime:** fuera de alcance de esta rama

Los masters oficiales viven en `platform/brand/dico-3d-masters/`. Son los PNG
RGBA aprobados y no se modifican para generar runtime. Los derivados WebP
lossless viven en `public/brand/dico/physical/` y se regeneran con
`npm run dico:3d:derive`.

> **FINAL_3D_ALPHA_EXPORT_REQUIRED = RESOLVED**

El bloqueo queda resuelto porque los ocho masters RGBA están versionados, sus
hashes están fijados por el validador y tanto el pack master como sus derivados
1:1 vuelven a pasar el gate integral.

## Vocabulario cerrado

`idle` · `explain` · `pointDown` · `pointUp` · `thinking` · `worried` ·
`success` · `error`

`processing` y `question` no pertenecen al vocabulario oficial. Tampoco se
admiten nombres o archivos legacy.

## Masters vinculantes

| Pose | Archivo | SHA-256 | Bytes |
|---|---|---|---:|
| `idle` | `dico-3d-idle.png` | `a08dfb896562140b4b8126b51714e0feb7d34e5447d5e8f1e811435534110a7b` | 372.605 |
| `explain` | `dico-3d-explain.png` | `d366d9772426bac0cf8f35956f3033d7ff5f150a81623b19b3a19e3e6e7b81c1` | 379.942 |
| `pointDown` | `dico-3d-point-down.png` | `089d50ef9ad42e3bd8ee8e5fdef185471f4af8ebf0b64874722a951f3963086b` | 370.340 |
| `pointUp` | `dico-3d-point-up.png` | `d117ff936ffc15b38ddbc9c4b663e7e15622e7bb4ef50fc7f6f302d3209a582d` | 377.899 |
| `thinking` | `dico-3d-thinking.png` | `813ede8b378d879050c9b9939ce400f4ddabe89e215e0950a4fdf73a486f424a` | 399.494 |
| `worried` | `dico-3d-worried.png` | `517bc8583230f8e13cbfafc8ced31ead1c379cdd2763e6cbd0a940aaa2957ea3` | 425.652 |
| `success` | `dico-3d-success.png` | `764c5857dc7ddceb48773958f8d45a46f7137632a56c6465d73d6d511978eb23` | 406.968 |
| `error` | `dico-3d-error.png` | `ac0aaa0f3c60577e42bd16fc2191bf3fd3ec614f7791b0bf75c92592e49e0752` | 413.394 |

Peso total master: **3.146.294 bytes**.

`idle` permanece declarado `CANONICAL_3D_FRAME_REFERENCE`: canvas 1600×1136,
centro de moneda `(800, 546.5)`, diámetro 517,02 px, Blue 453,5 px y safe area
mínima 96 px. Las siete poses restantes quedan registradas contra esa geometría.

## Derivados runtime

Formato elegido: **WebP lossless con alfa exacto** (`lossless=1`, `exact=1`,
`method=6`). El encoder WebAssembly queda fijado en dependencias de desarrollo;
el proceso no depende de una herramienta global.

Peso total derivado: **1.901.094 bytes**, equivalente al **60,42 %** de los
masters. Al decodificar, cada WebP reproduce exactamente los 7.270.400 bytes
RGBA de su PNG: no cambia geometría, alfa, borde, Gold, Blue, ojos, pestañas,
guantes ni detalle fino. Por esa equivalencia, la composición sobre blanco,
Zinc/Carbon y damero también es idéntica y no puede introducir halo, matte ni
ringing.

El manifest aislado `platform/brand/dico-3d-assets.mjs` mapea las ocho poses a
sus nombres master, runtime y rutas públicas. No está importado por `src`.

## Gates reproducibles

```powershell
npm run dico:3d:derive
npm run dico:3d:validate
node tools/dico-3d/generar-plancha.mjs platform/brand/dico-3d-masters .qa-lite/dico-3d/plancha-final.svg
```

El validador fija nombres y hashes de los ocho masters, rechaza
`processing`/`question`/legacy, verifica canvas, RGBA, transparencia, RGB bajo
alfa cero, antialiasing, ausencia de Volt, bbox, safe area, centro, escala y
registro. El gate de derivados exige correspondencia 1:1 y equivalencia RGBA
pixel a pixel. Los tests incluyen gemelos positivos y mutaciones negativas.

## Próximo paso mínimo

En una rama de integración separada, importar solamente el manifest en el
componente Physical, mantener el fallback actual y ejecutar tests de presencia,
capturas responsive y QA Lite same-ref antes de retirar cualquier asset previo.
