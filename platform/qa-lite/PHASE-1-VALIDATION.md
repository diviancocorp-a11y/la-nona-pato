# Phase 1 validation

Fecha: 2026-08-30

## Alcance

- BASE: `21b33e541ffd4e146d008dd4b7758a06073c8db3`
- CANDIDATE: `621c4925365506862035fdd66fc6a4dec6d1b42b`
- `qa:lite:test`: 27/27 PASS
- TypeScript (`tsc --noEmit`): PASS
- Motion inventory: PASS
- BASE vs BASE: PASS 3/3
- CANDIDATE vs CANDIDATE: PASS
- BASE vs CANDIDATE: PASS exacto, raw pixels 0
- DOM: igual
- `blockingDiffPixels`: 0
- Trafico externo: 0

## Contrato visual

- Pixelmatch: `7.2.0`
- `threshold`: `0.01`
- `includeAA`: `false`
- Las animaciones finitas se esperan mediante quiescencia verificable: tres frames consecutivos sin motion finito pending/running.
- La pila visual de Dico se inventaria antes de canonicalizar y usa el contrato dirigido `static-neutral-dico` para DOM y screenshot.
- El gate conserva las metricas raw, antialiasing, redondeo subcanal y diferencias bloqueantes. Solo pasa cuando `blockingDiffPixels === 0`.

## Evidencia

- Motion inventory: `2026-08-30T06-07-15-585Z-motion-inventory`
- BASE vs BASE 1/3: `2026-08-30T06-10-23-075Z`
- BASE vs BASE 2/3: `2026-08-30T06-17-39-366Z`
- BASE vs BASE 3/3: `2026-08-30T06-25-01-874Z`
- CANDIDATE vs CANDIDATE: `2026-08-30T06-32-31-711Z`
- BASE vs CANDIDATE: `2026-08-30T06-40-01-534Z`

Esta validacion cubre exclusivamente las superficies y contratos incluidos en QA Lite. No sustituye pruebas funcionales futuras ni amplia por si sola el alcance verificado del producto.
