# QA-CATALOG-DETERMINISM

Lote propio, separado de Option A. Rama `fix/qa-catalog-determinism`, desde
`DICO_OPTION_A_FEATURE_COMPLETE_GATE_PENDING`.

**Objetivo único:** que el gate same-ref sea reproducible, sin subir
thresholds, sin excluir píxeles, sin esconder animaciones productivas, sin
sleeps y sin desactivar funcionalidad real.

---

## Cómo se investigó

Se escribió un forense (`e2e/qa-lite/catalog-carousel-forensics.spec.ts`) que
se instala **antes de navegar** y registra, con marca de tiempo: el atributo de
tema, las capas del carrusel con su identidad y estado visual, el conjunto de
animaciones vivas, y los montajes/desmontajes sobre la tarjeta. No es un gate:
instrumenta y reporta.

Es lo que convirtió tres teorías en tres respuestas.

## Causa raíz 1 — la preferencia de movimiento nunca se aplicaba

**Era el harness, no el producto.**

`reducedMotion` declarado en el `use` del config de Playwright **no surtía
efecto**: con el config pidiendo `reduce`, la página reportaba

```
matchMedia('(prefers-reduced-motion: reduce)').matches === false
```

mientras que `page.emulateMedia({ reducedMotion: 'reduce' })` sí funcionaba.
Medido en los dos sentidos, en la misma corrida.

Consecuencias, las dos silenciosas:

1. **Toda la QA corría con el movimiento encendido**, incluidos los tres specs
   que ponían `test.use({ reducedMotion: 'no-preference' })` a propósito: no
   declaraban una excepción, no hacían nada.
2. El carrusel del catálogo **auto-avanzaba en cada superficie**. Su transición
   monta una segunda capa durante 744 ms, y de ahí salían los dos
   `cp-pcg-horiz` y la tanda de animaciones que aparecía justo después de que
   el chequeo de quietud diera cero.

Medido con el forense, 12 s de observación:

| | momentos con 2 capas | mutaciones en la tarjeta |
|---|---|---|
| antes | 83 | 12 |
| después | **0** | **0** |

Ahora la preferencia se aplica explícitamente **y se comprueba que llegó**: un
`emulateMedia` que dejara de funcionar volvería a fallar en silencio.

## Causa raíz 2 — el contrato de Dico describía un estado roto

Aplicar la preferencia de verdad destapó la contracara: con `reduce` real, el
pulso de Dico y su entrada se apagan por CSS, así que `DICO_NEUTRAL_STRATEGY`
—que espera la entrada de 1050 ms y el pulso de 1872 ms ×2— **no podía
converger nunca**. Ese contrato describía un estado que sólo existía porque el
harness estaba roto.

Capturar todo bajo `reduce` habría "arreglado" el gate escondiéndole al QA las
animaciones productivas. Se resolvió al revés:

- **el default vuelve a ser movimiento encendido**, que es lo que tiene la
  mayoría, y lo que congela el movimiento continuo sigue siendo el registro de
  motion;
- el caso que el registro **no puede** congelar —el `setInterval` del
  carrusel— se pausa con la afordancia que el producto ya tiene: tocar la
  tarjeta significa "la estoy mirando". Como el harness fija `Date.now()`, esa
  pausa no vence durante la captura.

Sin sleeps, sin thresholds, sin desactivar nada.

## Causa raíz 3 — el panel de cobro se medía mientras entraba

`expectStableLayout` compara dos frames consecutivos. El panel de cobro del POS
entra con animación, y medir apenas aparece agarraba el último tramo: la
primera medición daba 403,31 / 403,38 / 403,49 según la corrida y la segunda
**siempre** 403,25. No era inestabilidad: se estaba asentando.

Se aisló por commit temporal descartando las dos reglas sospechosas de la
sidebar —el `padding-bottom` del main y el `padding-left` del riel—: **ninguna
era la causa**. Recién ahí los números mostraron el patrón.

## Lo que NO era un bug — el tema

`data-cp-theme` está **ausente** los primeros ~630 ms (antes ~1,7 s, con el
carrusel compitiendo) y después aparece `ambar`. Nunca queda en vacío: el
anti-flash de `index.html` guarda `if (t && bgs[t])` y el efecto de `App.jsx`
siempre cae en `ambar`. El `Received: ''` era Playwright reportando un atributo
ausente.

`openCatalog` ya espera la señal semántica (`toHaveAttribute`), que es
exactamente lo que corresponde. Queda anotado que para un visitante nuevo sí
hay un estado intermedio sin tema —el anti-flash depende de `localStorage` de
una visita anterior—; eliminarlo requiere conocer el tema antes de pintar y es
un cambio de producto fuera de este lote.

## Hallazgo lateral — `generateId` colisionaba

`Date.now().toString(36) + Math.random().toString(36).slice(2, 6)` deja 4
caracteres de azar: ~1,68 M combinaciones. Cien ids en el mismo milisegundo
colisionan con ~0,3 % de probabilidad, y el test de unicidad fallaba solo cada
tantas corridas **bloqueando commits al azar**. Apareció así, en el pre-commit.
Con 8 caracteres baja a ~2e-9; mismo formato.

## Mejoras de diagnóstico que quedaron

Los guards decían cuánto, no qué ni dónde. Ahora:

- el conteo del registro nombra superficie, selector y **el camino de ancestros
  de cada match** — lo que distingue "hay dos tarjetas" de "hay dos capas en la
  misma";
- el chequeo de layout informa **qué animación estaba corriendo** cuando se
  movió;
- el observer del stack de Dico informa, selector por selector, cuántos
  esperaba y cuántos encontró, **y qué sí está corriendo en su lugar**;
- `QA_SPEC` corre un spec suelto (~5 min) en vez de un compare completo
  (~15 min).
