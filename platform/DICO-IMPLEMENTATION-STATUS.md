# DICO — estado real de implementación

Fecha de corte: 2026-08-31

Rama integrada: `feat/dico-panorama-v1`

Base funcional autorizada: `0304f28`

Este documento registra evidencia, no intención. `CLOSED` sólo aparece cuando
existe un gate o una aprobación ya persistida en el repositorio.

## Matriz Phase 0–10

| Fase | Estado | Evidencia | Commit | Gate | Deuda | Siguiente paso |
|---|---|---|---|---|---|---|
| Phase 0 — Baseline | **CLOSED** | Baseline histórico fijado como BASE de la validación de Phase 1. | `21b33e5` | Captura BASE reproducible usada por QA Lite. | No ampliar su alcance retroactivamente. | Conservar como referencia histórica. |
| Phase 1 — Foundation `--ds-*` | **CLOSED / ORIGINAL GATE PASSED** | `platform/qa-lite/PHASE-1-VALIDATION.md`: 27/27, BASE↔BASE 3/3, CANDIDATE↔CANDIDATE y BASE↔CANDIDATE exacto; DOM igual; raw pixels 0; `blockingDiffPixels: 0`; tráfico externo 0. | `621c492`, evidencia `e1652ce` | Gate original completo y verde. | El baseline queda superseded sólo para cambios visuales intencionales posteriores. | No reabrir ni documentar como “visualmente no verificada”. |
| Phase 2A — `/registro` canary | **CLOSED** | Primer canary Machine/Soul persistido y usado como padre funcional de Phase 2B. | `066d820` | Canary aceptado en la continuidad histórica y promovido a Phase 2B. | Logo master y texturas quedaron fuera de alcance. | Mantener; no recalibrar desde Stage A. |
| Phase 2B — Theme ownership | **CLOSED** | `platform/PHASE-2B-VALIDATION.md`: tipografía, `/registro` y ownership aprobados visualmente. | `c165943`, cierre `ea6f85e` | Aprobación humana registrada. | Logo master y texturas siguen como refinamiento posterior. | Respetar `.ag-root` y autoridades tipográficas. |
| Phase 3A — Admin correctness | **CLOSED** | `platform/PHASE-3A-CORRECTNESS.md`: contraste, navegación mobile, Dialog/focus trap y capas medidos; 39 tests nuevos. | `7ef8ec6` | QA Lite 27/27; same-ref `blockingDiffPixels: 0`, DOM y scroll trace iguales. | Overlays legacy y deuda visual de módulos permanecen fuera de este lote. | Preservar contratos durante el cierre 3B. |
| Phase 3B — Machine Soul Shell | **IMPLEMENTED / NEEDS INTEGRATED CLOSURE** | Shell Machine Soul hasta `9e77b0a`, reconciliado con la base funcional y el recovery Presence/Slot. | `a570854` → `9e77b0a`; merge `cf8f47c`; checkpoint Stage A actual | Tests integrados y build deben quedar verdes; falta el gate de cierre específico de A3 (browser, light/dark, mobile, navegación, focus y overflow). | No confundir integración técnica con cierre visual del shell. | Ejecutar A3 y recién entonces crear `chore(dico): close integrated phase3 shell`. |
| Phase 4 — Admin Home Golden Screen | **NOT STARTED** | No hay checkpoint de Golden Screen ni aprobación humana. | — | No ejecutado. | Depende de Panorama y de aprobación visual. | No iniciar antes de cerrar Phase 3 y Panorama. |
| Phase 5 — Primitives | **PARTIAL / NOT FORMALLY COMPLETE** | Phase 3A ya aporta `Dialog`, `OverlayPortal` y `useFocusTrap`, pero no existe extracción validada desde Golden Screen y una segunda pantalla. | línea `7ef8ec6` | Contratos unitarios de Phase 3A; gate formal de Phase 5 ausente. | Evitar crear una librería UI paralela. | Extraer sólo lo demostrado por Golden Screen. |
| Phase 6 — Admin rollout | **NOT STARTED** | No hay batches A–D del plan unificado. | — | No ejecutado. | Pantallas funcionales siguen fuera del lote actual. | Esperar Golden Screen y primitives. |
| Phase 7 — POS / Catalog | **NOT STARTED** | `cp-root` y temas `ambar/noche/carbon` siguen siendo autoridad del catálogo; ownership DICO/white-label no fue decidido. | — | No ejecutado. | No mezclar storefront y admin. | Resolver ownership antes de migrar. |
| Phase 8 — Dico Native 2D | **IN PROGRESS — B1/B2/B3/B4 CLOSED** | Pose nativa, cara modular y presencia separada de avisos integradas. B1 agrega `DicoPresence` como autoridad única. B2 confirma que `DicoSlot` es controlado. B3 ubica la burbuja en flujo arriba de Native; B4 conserva el typewriter y reserva su geometría completa desde el primer frame con una sola fuente accesible. `9741b96` fue auditado como equivalente conceptual de `0304f28`; se conserva una sola implementación. | `0304f28`, recovery `67e95ce`, B1 `be5d6b5`, B3 `f429722`, B4 `f33d8eb` | 6 archivos / 61 tests dirigidos; suite 77 / 1.044 PASS. QA same-ref: DOM 8/8, screenshots 8/8, `blockingDiffPixels: 0`, scroll 40/40; geometría estable en 320/375/768/1440. | Queda la discrepancia de escala Native/Physical: misma anatomía, pero en Physical los ojos miden 10,21 % del ancho de la moneda contra 23,24 % en Native. Es acabado, no fuente: pertenece al lote de Physical o a B6. | Detenerse hasta GO explícito para B6. |
| Phase 9 — Slot / Physical | **IN PROGRESS — B2 CLOSED** | Frontera física, asset Physical, retorno completo y reserva de espacio integrados. `DicoSlot` recibe su estado de `DicoPresence`; no controla notice ni existencia Native. Physical queda excluido de Native durante opening/open/closing y el notice no se restaura al volver. | `a3b07bc`, `de5568a`, `7f40419`, `7b17e97`, B1 `be5d6b5`, auditoría B2 en `f429722` | Exclusión Native/Physical, fin real de closing, no-restauración y Reduced Motion cubiertos; suite completa verde. | Falta validación visual específica de Physical abierto, proporción y materiales; no pertenecía a B2–B4. | Conservar control único y esperar el lote Physical correspondiente. |
| Phase 10 — Cleanup | **DEFERRED** | El plan conserva explícitamente aliases, overlays, CSS/assets y tokens legacy hasta inventariar consumidores. | — | No aplica todavía. | Borrar ahora rompería continuidad o mezclaría scopes. | Ejecutar sólo después del rollout. |

## Evidencia del checkpoint Stage A

- Build identity integrado en `4ba926d` y `4338df8`.
- Línea Machine Soul integrada manualmente hasta `9e77b0a` mediante `cf8f47c`.
- React Router preservado exactamente en `7.18.3`.
- Bundle `DICO_RECOVERY_PRESENCE_SLOT.bundle` verificado antes de importarlo:
  SHA-256 `735fefa1d12face5caa41adc0d40896698ccf31d0c14c3e5318eee6692329931`,
  8.658.041 bytes, HEAD `7b17e97e7d35638109f634b81892135b2a146036`.
- Cadena recovery lineal y completa sobre `9e77b0a`: `67e95ce` → `a3b07bc` →
  `de5568a` → `9741b96` → `7f40419` → `7b17e97`.
- `platform/HANDOFF.md` fue reconciliado por contenido. No se usó una
  resolución masiva `ours`/`theirs`.
- El checkpoint no cambia DB, migraciones, RLS, RPC, auth, Edge Functions,
  lógica comercial, dependencias ni producción.

## Estado formal de Stage B

| Bloque | Estado | Evidencia |
|---|---|---|
| B1 — `DicoPresence` | **CLOSED** | `be5d6b5`; máquina única Native/Notice/Physical. |
| B2 — `DicoSlot` controlado | **CLOSED** | Auditoría estática y tests en `f429722`; no requirió código productivo nuevo. |
| B3 — aviso encima de Native | **CLOSED** | `f429722`; DOM/layout, cola, hit target y transiciones cubiertos. |
| B4 — typewriter estable | **CLOSED** | `f33d8eb`; fake timers, Reduced Motion, accesibilidad y gate real en cuatro viewports. |
| B5 — cara canónica | **CLOSED FOR PREVIOUS CANONICAL-FACE ARCHITECTURE / SUPERSEDED BY FINAL ASSET DIRECTION** | `platform/PHASE-B5-CANONICAL-FACE.md`. Arquitectura ya cumplida: `CaraDeTinta` es el único módulo productivo con geometría facial, Native y Physical la montan y el cuerpo Physical está limpio. Sin refactor productivo: 12 contratos estructurales cuyo gate camina el grafo de imports desde `src/main.jsx`, no rutas. `DicoEscena` y los 7 renders legacy se conservan para la vitrina. Same-ref: DOM igual, pixels bloqueantes 0, scroll trace idéntico. |
| B6 — expresiones canónicas | **CLOSED** | `platform/PHASE-B6-EXPRESSIONS.md`. Siete estados emocionales + tres frames de habla sobre una sola anatomia. Vocabulario canonico explicito (idle/processing/thinking/success/worried/question/error) mas un eje de habla; los nombres en espaniol quedan como alias que resuelven al canonico. Nuevos `thinking` y `error`; los cinco previos no se reimplementaron. `error` usa la FORMA (X sobre la esclera) y el rojo solo como acento. Physical dejo de estar clavado en `idle`. Proporcion Physical corregida en el wrapper: de 2,28x de desvio a menos de 12,5%, jerarquia ojos/boca identica. 20 contratos, 14 mutaciones verificadas. Same-ref: 1 de 2 corridas dio 1 pixel bloqueante en la esquina de un boton de la burbuja (no la cara); la segunda dio 0. Umbral de antialias marginal anotado como deuda. Pendiente: ningun codigo emite `pensando`, `contento` ni `error` todavia. |
| B6R — final asset & motion system | **IN PROGRESS — B6R.QA1 PARCIAL** | `platform/DICO-FINAL-ASSET-MANIFEST.md`. El personaje nuevo (aro azul, sin galera, 2D sin boca) esta definido pero NO existe como asset de produccion: las 10 poses 3D nuevas vienen sobre negro opaco y el recorte por luminancia no es viable porque el 47,9% de la zona central tambien es casi-negro. El Dico 2D y el isologo solo existen como laminas de presentacion. Bloqueado en re-export con alfa (FINAL_ASSET_ALPHA_EXPORT_REQUIRED). B6R.2A cerro los TRES vocabularios (nativeState / physicalPose / activity, ejes independientes) y `DicoPulso`: capa SVG separada, cinco modos, cero reflow, reduced motion sin perder significado. Blue base #2A3369 vs Volt #3D6BFF resuelto midiendo el arte. B6R.QA1 reparo el nondeterminismo del CTA (line-height 20,3px -> 20px): 0 bloqueantes en 4 de 4 corridas. Pero el gate sigue sin ser repetible por dos causas que estaban tapadas detras: carrera de fuente remota en catalog--ambar y margen auto inestable en .ag-dico-stack. Dico 2D NO se monto: los 7 assets estan registrados y verificados, sin integrar. |

Los resultados completos y las rutas de artifacts están en `platform/HANDOFF.md`.
Este documento no autoriza avanzar automáticamente a B5.
