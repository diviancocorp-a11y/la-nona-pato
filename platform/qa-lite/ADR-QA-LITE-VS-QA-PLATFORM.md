# ADR — QA Lite vs QA Platform

- Estado: aceptado.
- Fecha: 2026-08-28.
- Alcance: migracion Machine Soul.

## Contexto

Phase 1 establece la infraestructura de tokens y debe ser visualmente neutral.
Construir Supabase/Vercel staging, CI visual remoto, governance de baselines y
fixtures multi-tenant completos antes del canary `/registro` convierte una
validacion puntual en un proyecto de infraestructura.

## Decision

DICO-QA-Lite es un instrumento local, sintetico y descartable para comparar
directamente `621c492^` con `621c492`. Usa Supabase local, un tenant, estado
serial, contrato DOM/computed/layout y ocho capturas bloqueantes.

DICO-QA-Platform se difiere hasta antes del rollout transversal de Machine Soul
sobre Admin. En ese momento se evalua como inversion propia e incluye staging
remoto, CI, aislamiento multi-tenant, artifacts persistentes y politica formal
de rebaseline.

## Consecuencias

- QA Lite puede desbloquear `/registro` sin infraestructura remota.
- El instrumento no modifica `src/**`, el objeto que esta verificando.
- Phase 1 no admite rebaseline: igualdad o explicacion/correccion.
- La matriz ampliada es evidencia no bloqueante.
- QA Platform sigue siendo obligatoria antes de migrar Admin en forma masiva.

## Trigger de QA Platform

Abrir DICO-QA-Platform antes del primer rollout de Machine Soul que afecte
varias superficies de Admin o varios tenants simultaneamente. El piloto aislado
`/registro` no activa ese trigger.
