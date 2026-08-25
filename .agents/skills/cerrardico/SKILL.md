---
name: cerrardico
description: Cierra una sesión de trabajo en la plataforma Dico dejando el estado listo para retomar. Usar cuando el usuario escribe /cerrardico, o pide cerrar, resumir o guardar el trabajo de la sesión antes de limpiar el chat.
---

# Cerrar la sesión de Dico

El objetivo NO es escribirle un resumen bonito a Ricky: es dejar el proyecto
en un estado del que `/dico` pueda levantar todo el contexto la próxima vez.
El resumen en el chat se pierde cuando limpia; lo que queda es lo que
escribas en el repo.

## Protocolo Codex ↔ Claude (obligatorio)

`platform/HANDOFF.md` es el mensaje entre agentes. Toda sesión con avances,
decisiones o trabajo a medias se registra ahí antes de cerrar, sin importar si
la hizo Codex o Claude. No alcanza con resumir en el chat.

El registro debe permitir que el otro agente continúe sin pisar nada: indicá
qué archivos quedaron modificados, cuáles son trabajo en curso, qué parte está
terminada y qué no debe rehacerse. Nunca reviertas cambios locales que ya
estaban al abrir la sesión; separalos explícitamente de los cambios nuevos.

## Paso 1 — Ver qué pasó de verdad

No lo reconstruyas de memoria, verificalo:

- `git status --short` — ¿quedó algo sin commitear?
- `git log --oneline <ultimo-commit-de-la-sesion-anterior>..HEAD` — qué entró.
- `git log origin/platform/runtime-tenant..HEAD` — ¿hay commits sin pushear?
- `ls platform/migrations/` — ¿se aplicaron migraciones nuevas?
- Si hubo deploy: confirmá que el último quedó `READY`.

## Paso 2 — Actualizar `platform/HANDOFF.md`

**Este es el paso importante.** Agregá o actualizá una sección fechada arriba
de todo (después del encabezado), con:

- **Hecho**: qué se cerró, con los nombres de archivo y migración. Incluí el
  *por qué* de las decisiones no obvias — eso es lo caro de reconstruir.
- **Verificado**: qué se probó de verdad y cómo. Distinguí lo verificado en
  producción de lo que sólo compila.
- **Pendiente inmediato**: lo próximo, en orden.
- **Bloqueado por Ricky**: lo que necesita una acción suya (credenciales,
  paneles externos, decisiones de negocio). Sé explícito.
- **Trabajo local vivo**: archivos modificados o sin seguimiento, quién los
  venía trabajando si se sabe, para qué sirven y si están listos o a medias.

Reglas para escribirlo:
- Sin tildes en los comentarios de código; el markdown sí las lleva.
- Un pendiente sin el motivo por el que está pendiente no sirve.
- Si algo quedó a medias, decilo con esas palabras. Un handoff optimista
  hace perder más tiempo del que ahorra.

## Paso 3 — Dejar el repo sano

- Si quedó trabajo sin commitear, **commitealo** (rama
  `platform/runtime-tenant`, nunca `main`) y **pusheá**. Un commit local no
  protege de nada.
- Si algo no se puede commitear (roto a medias), decilo en el HANDOFF y
  avisale a Ricky explícitamente antes de que limpie el chat.
- Nunca dejes secretos en el repo: `.env*` está ignorado, verificá que siga así.

## Paso 4 — Actualizar la memoria si cambió algo estructural

Si en la sesión cambió algo que sobrevive al proyecto —un dominio nuevo, una
decisión de arquitectura, una trampa de infraestructura— actualizá el archivo
correspondiente en el directorio de memoria. No dupliques ahí lo que ya está
en el repo.

## Paso 5 — El resumen en el chat

Recién ahora, y corto. A Ricky le sirve:
1. Qué quedó funcionando (verificado, no "debería andar").
2. Qué quedó pendiente y por qué.
3. **Qué tiene que hacer él** antes de la próxima sesión.
4. Con qué se sigue.

Cerrá confirmando que `/dico` en un chat nuevo va a levantar todo esto.

## Lo que NO hay que hacer
- No inventes que algo funciona si no lo probaste en esta sesión.
- No declares la sesión cerrada con trabajo sin pushear.
- No escribas un HANDOFF que repita lo que ya dice `AGENTS.md`: sumá lo nuevo.
