# Dico 3D final — contrato y preparación

**Stream B aislado.** Auditoría: 2026-09-02. Rama `prep/dico-3d-final`, base
`7f528b9`. Fuente inspeccionada sin modificar:
`C:\Users\ricar\OneDrive\Desktop\Dico 3D`.

Este documento prepara el paquete final de Dico Physical. No monta assets en
runtime, no cambia `DicoSlot`, `DicoPresence`, sidebar ni `DicoPulso`.

## 0. Resultado

- Las ocho poses oficiales existen en el set actual.
- La identidad es la correcta: moneda Gold, aro azul oscuro, pestañas, sin
  galera ni bigote legacy.
- Los ocho archivos son PNG RGB (`color type 2`) sobre negro opaco: **0 píxeles
  transparentes**.
- Ninguno es apto para runtime. No se intenta recuperar alfa por luminancia.
- `error` tiene una escala de moneda aproximadamente 13,7 % mayor que la
  mediana de las otras siete poses y requiere reencuadre.
- `processing` y `question` están disponibles, pero quedan fuera del vocabulario
  `physicalPose` cerrado.

> **FINAL_3D_ALPHA_EXPORT_REQUIRED**

## 1. Vocabulario y nombres finales

El vocabulario público tiene exactamente ocho poses:

`idle` · `explain` · `pointDown` · `pointUp` · `thinking` · `worried` ·
`success` · `error`

| `physicalPose` | Archivo actual auditado | Nombre final exigido |
|---|---|---|
| `idle` | `dico_face-idle.png` | `dico-3d-idle.png` |
| `explain` | `dico_body-explaining.png` | `dico-3d-explain.png` |
| `pointDown` | `dico_body-pointing.png` | `dico-3d-point-down.png` |
| `pointUp` | `dico_body-attention.png` | `dico-3d-point-up.png` |
| `thinking` | `dico_face-thinking.png` | `dico-3d-thinking.png` |
| `worried` | `dico_face-worried.png` | `dico-3d-worried.png` |
| `success` | `dico_face-success.png` | `dico-3d-success.png` |
| `error` | `dico_face-error.png` | `dico-3d-error.png` |

Los nombres finales de archivo usan kebab-case; la API conserva camelCase para
`pointDown` y `pointUp`.

## 2. Método de medición

Las dimensiones, el tipo de color y el alfa salen del PNG, no de una captura.
Como el set auditado no tiene alfa, la caja del personaje se estimó sólo para
diagnóstico separando del matte negro los píxeles a distancia RGB mayor que 22.
Esa máscara **no se exporta ni se usa como recorte**.

El centro se obtiene de los extremos robustos del aro Blue. El diámetro de
moneda se estima radialmente sobre Gold + Blue y usa la mediana de 360 radios.
El método evita que brazos y manos desplacen la medida. La caja y el diámetro
son mediciones técnicas con tolerancia de aproximadamente 2 px, no un nuevo
master.

## 3. Matriz de las ocho poses

En `bbox` se usa `L,T–R,B (ancho×alto)`. Padding se expresa
`top/right/bottom/left`. Todos los SHA-256 son completos.

| Pose | Resolución / canvas | Alfa | Bbox personaje | Centro moneda | Ø moneda | Padding T/R/B/L | Clipping | Luz / identidad | Runtime |
|---|---:|---|---|---:|---:|---:|---|---|---|
| `idle` | 1024×726 RGB opaco | no · type 2 | 331,184–739,562 (409×379) | 530,350 | 330,96 | 184/284/163/331 | no | estudio sup-izq · correcta | **no**: sin alfa y canvas distinto |
| `explain` | 1488×1057 RGB opaco | no · type 2 | 278,264–1251,753 (974×490) | 772,504,5 | 480,36 | 264/236/303/278 | no | estudio sup-izq · correcta | **no**: sin alfa |
| `pointDown` | 1488×1057 RGB opaco | no · type 2 | 454,265–1073,822 (620×558) | 770,505,5 | 480,36 | 265/414/234/454 | no | estudio sup-izq · correcta | **no**: sin alfa |
| `pointUp` | 1487×1058 RGB opaco | no · type 2 | 423,182–1075,816 (653×635) | 772,509,5 | 482,58 | 182/411/241/423 | no | estudio sup-izq · correcta | **no**: sin alfa y canvas distinto |
| `thinking` | 1488×1057 RGB opaco | no · type 2 | 483,267–1074,816 (592×550) | 771,5,508 | 480,36 | 267/413/240/483 | no | estudio sup-izq · correcta | **no**: sin alfa |
| `worried` | 1488×1057 RGB opaco | no · type 2 | 482,266–1073,816 (592×551) | 771,508 | 482,22 | 266/414/240/482 | no | estudio sup-izq · correcta | **no**: sin alfa |
| `success` | 1488×1057 RGB opaco | no · type 2 | 481,267–1078,820 (598×554) | 773,510 | 485,10 | 267/409/236/481 | no | estudio sup-izq · correcta | **no**: sin alfa |
| `error` | 1484×1060 RGB opaco | no · type 2 | 373,240–1123,794 (751×555) | 747,515 | 548,70 | 240/360/265/373 | no | estudio sup-izq · correcta | **no**: sin alfa y escala fuera de registro |

### SHA-256

| Pose | SHA-256 |
|---|---|
| `idle` | `e48d164090d7b9f9aa62d62e1ee935676179f4172ef3bff0070b3a12cb5976f6` |
| `explain` | `dac0fe4a9170ad5e25f90929bdb7a42e98d86f20ce80d503b84ff0529fe0402e` |
| `pointDown` | `ae02f2a39b908d3eee00a9a7a62b5a5dc93d7428be8b8da22183d438dc485dfe` |
| `pointUp` | `90cf4c284a8ab21e0e9360f4449b0eb48cb18915ec573634e1a731dace1556bd` |
| `thinking` | `6b1f836ada58d167156059485d63f7560af47d11df2d1f021bf469932e7928a5` |
| `worried` | `80906daaf8ffc98f379fd5615b034a45a6f4d8910ff55f870c4775a3e35f4af3` |
| `success` | `61a57f6ea28745250d171e6ed18ccb108c2309fecf5335bce53c17cd744c0cca` |
| `error` | `5e7bbde11ce32aedc4a2b818eae1a81928a5dcc7236e845b6959731108bc6670` |

### Extras excluidos

| Archivo | Resolución | SHA-256 | Decisión |
|---|---:|---|---|
| `dico_face-processing.png` | 1301×924 | `f6bd000cfec6ad67669811b2a8d0f2e70047c91f74adc92352b3896b1de694ab` | no es `physicalPose`; archivar fuera del paquete final |
| `dico_face-question.png` | 1303×924 | `e3a240baf2a837f63e941767c42381d163ad0fa8d33c3ee5cdf47e0d83140c90` | no es `physicalPose`; archivar fuera del paquete final |

## 4. Registro entre poses

Las medidas siguientes están normalizadas contra cada canvas actual.

| Pose | Centro X | Centro Y | Ø / alto canvas | Framing relevante |
|---|---:|---:|---:|---|
| `idle` | 51,76 % | 48,21 % | 45,59 % | resolución menor; proporción conservada |
| `explain` | 51,88 % | 47,73 % | 45,45 % | pose más ancha: 65,46 % del canvas |
| `pointDown` | 51,75 % | 47,82 % | 45,45 % | extensión inferior máxima |
| `pointUp` | 51,92 % | 48,16 % | 45,61 % | pose más alta: 60,02 %; menor padding superior |
| `thinking` | 51,85 % | 48,06 % | 45,45 % | estable contra idle/explain |
| `worried` | 51,81 % | 48,06 % | 45,62 % | estable |
| `success` | 51,95 % | 48,25 % | 45,89 % | escala +0,97 % contra mediana |
| `error` | **50,34 %** | **48,58 %** | **51,76 %** | outlier: escala +13,7 % y centro desplazado |

Sin `error`, la dispersión es pequeña: 0,20 puntos porcentuales en X, 0,52 en
Y y menos de 1 % relativo en diámetro. El recorrido
`idle → thinking → explain → pointDown` ya comparte escala perceptual, aunque
los canvases no sean iguales. `error` no puede cruzarse sin salto.

## 5. Frame 3D canónico propuesto

| Propiedad | Valor final |
|---|---:|
| Canvas master | **1600×1136 px** |
| Formato | PNG 8-bit RGBA, no interlazado |
| Centro de moneda | **(800, 545)** = (50 %, 48 %) |
| Diámetro de moneda | **517 px** = 45,5 % del alto |
| Safe area mínima | **96 px** en cada borde |
| Tolerancia por pose | centro ±8 px; diámetro ±1,5 % |
| Dispersión máxima del set | centro 8 px; diámetro 1,5 % |

`1600×1136` conserva el aspect ratio medido del lote (aprox. 1,408:1), evita
recortar la pose más ancha y la mano elevada, y sus dos dimensiones son
múltiplos de 16. No se impone un cuadrado ni 1536×1536 porque sumarían área
vacía sin mejorar el registro. El master puede derivarse a menor tamaño para
runtime.

El centro X final se lleva a 50 % deliberadamente. El offset de aproximadamente
1,8 % del set actual no aporta significado y complicaría el anclaje futuro. El
centro Y queda en 48 % para reservar más recorrido debajo de la moneda a
`pointDown` sin comprometer `pointUp`.

## 6. Especificación exacta del re-export

Producción debe entregar una carpeta de masters con **sólo** los ocho nombres de
§1 y estas condiciones:

1. PNG 8-bit RGBA (`color type 6`), 1600×1136, no interlazado.
2. Alfa real: fondo en alfa 0, sujeto opaco, borde con alfa parcial de
   antialiasing. Sin negro horneado, damero ni halo.
3. Centro (800,545) y diámetro 517 px en todas las poses, dentro de tolerancia.
4. Manos, dedos y brazos completos; bbox dentro de la safe area de 96 px.
5. Mismo Gold, Blue, material, cámara, perspectiva e iluminación de estudio
   superior izquierda en las ocho poses.
6. Identidad vigente: aro azul oscuro, pestañas, sin galera, bigote ni otro
   rasgo legacy.
7. Perfil de color uniforme para todo el lote.
8. `processing` y `question` no se mezclan con el paquete oficial.

El PNG RGBA es el master. El WebP lossless de runtime se deriva después y debe
conservar exactamente canvas, centro, escala y alfa; no reemplaza al master.

No se acepta luma/chroma key destructivo. El aro, pupilas, pestañas y trazos
oscuros comparten luminancia con el fondo y se dañarían.

## 7. Registro del pulso Volt

- Blue 3D observado: aproximadamente `#2A3369`.
- Volt de señal: `#3D6BFF`.
- En el frame canónico, el futuro overlay se ancla al mismo centro
  **(800,545)**.
- El diámetro exterior observado del aro Blue es aproximadamente 88,6 % del
  diámetro de moneda: referencia inicial **458 px** sobre el master.

La cifra de 458 px se vuelve a medir sobre los RGBA finales antes de montar el
overlay. No se implementa otro `DicoPulso` en este stream.

## 8. Transición futura, sólo contrato

API conceptual:

```jsx
<DicoPhysical
  physicalPose="thinking"
  transitionDuration={140}
  position={{ x: 800, y: 545, anchor: 'coin-center' }}
/>
```

- Dos imágenes ocupan el mismo frame y ancla durante el cambio.
- Crossfade recomendado: 140 ms, `ease-out`.
- Entrada opcional: `opacity: 0 → 1` y `translateY(2px) → 0`.
- Salida opcional: `opacity: 1 → 0` y `translateY(0) → -2px`.
- Nada de morphing, interpolación de brazos, rig, skeleton o lipsync.
- `prefers-reduced-motion` conserva el cambio de pose con duración 0; no cambia
  el estado lógico.
- `position` mueve el frame completo. Nunca compensa una pose individual.

## 9. Blink futuro, no bloqueante

Sólo experimentar si producción entrega un frame de párpado cerrado con el
mismo canvas, centro, diámetro e iluminación. El blink sería un swap/crossfade
corto entre dos rasters registrados. No se deforma el ojo, no se escala su
altura por CSS y no se recorta una región del PNG. Si no existe ese export,
blink queda fuera sin bloquear Physical.

## 10. Gate automatizado y límite de alcance

`scripts/dico-3d-validar-assets.mjs` valida la carpeta final directamente con
Node: vocabulario, nombres, canvas, RGBA, transparencia, bbox, safe area,
centro, escala, registro y nombres legacy. La identidad visual correcta sigue
teniendo un gate humano: un script no puede demostrar la ausencia de un bigote
si el archivo fue renombrado de forma engañosa.

La plancha bajo `tools/dico-3d/` usa estos datos para revisar escala, saltos,
clipping y framing. No es una nueva dirección artística.

## 11. Bloqueos para la implementación

1. Re-export de las ocho poses con alfa verdadero.
2. Reencuadre de `error` al frame canónico.
3. Confirmación visual final de material e iluminación después del re-export.
4. Derivación WebP sólo después de que el master pase el validador.

Hasta resolverlos, no copiar el set a `public/brand/dico-3d/` y no montarlo en
`DicoSlot`.
