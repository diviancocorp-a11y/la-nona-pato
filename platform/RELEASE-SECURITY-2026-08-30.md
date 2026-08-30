# Release de seguridad — React Router 7.18.3 (30/ago/2026)

**Estado: `APROBADO CON EXCEPCIÓN DE TRAZABILIDAD`**

El objetivo de seguridad está cumplido y verificado en producción. Hay una
excepción documentada en el identificador de build, que **no es un fallo
funcional**. Se decidió explícitamente no redeployar ni hacer rollback.

---

## 1. Qué se desplegó

| | |
|---|---|
| Commit | `d86c8a9015a03853db84d31fb6fbaaae46f7f8e8` |
| Padre | `3c541ba1db19591d15a88915bdd8467baaaa7417` |
| Rama | `release/platform-security-2026-08-30` |
| Deployment | `dpl_FZ2nat2egg6gorYYj2QPbat1FLLx` |
| URL | `hermes-platform-nc8qhc686-diviancocorp-a11ys-projects.vercel.app` |
| Estado | **READY** · target `production` · región `iad1` · build 21.6 s |
| Dominio | `https://divianco.app` (+ `*.divianco.app`, `aliasError: null`) |
| Proyecto | `hermes-platform` |

### El cambio

`react-router-dom`: `^7.13.2` (resolvía **7.15.1**) → **`7.18.3` exacta**.
`react-router` es transitivo y quedó también en **7.18.3**.

Diff acotado: `package.json` una línea, `package-lock.json` 8 inserciones y 8
borrados, únicamente en los bloques `node_modules/react-router` y
`node_modules/react-router-dom`. **Ningún otro paquete cambió de versión.**
No se corrió `npm audit fix`.

## 2. Advisories corregidos

Los cinco de `react-router < 7.18.0` / `< 7.18.2`:

| GHSA | Título | Severidad | Afectadas | ¿Aplicaba a esta SPA? |
|---|---|---|---|---|
| `GHSA-wrjc-x8rr-h8h6` | Open redirect via backslash en `<Link>` y `useNavigate` (bypass CVE-2025-68470) | moderate | `>=6.0.0 <7.18.0` | **SÍ** |
| `GHSA-h8fp-f39c-q6mh` | RSCErrorHandler missing protocol validation (XSS) | moderate · 6.9 | `>=7.11.0 <7.18.0` | no (RSC) |
| `GHSA-337j-9hxr-rhxg` | Constructor injection vía `deserializeErrors()` en hydration | moderate · 6.1 | `>=6.4.0 <7.18.0` | no (SSR) |
| `GHSA-chx6-hx7r-mcp5` | DoS no autenticado por route matching ineficiente | **high** | `>=7.0.0 <7.18.0` | no (server-side) |
| `GHSA-qwww-vcr4-c8h2` | RSC mode CSRF bypass | **high** | `>=7.12.0 <7.18.2` | no (RSC) |

Se eligió **7.18.3** y no 7.18.0 porque el CSRF de RSC recién se corrige en
7.18.2.

**Alcance verificado, no supuesto**: `main.jsx` monta `BrowserRouter` con
`createRoot`; `grep` sobre `src/` da cero resultados para `renderToString`,
`renderToPipeableStream`, `createStaticHandler`, `StaticRouter`, `hydrateRoot`,
`react-router/rsc` y `RSCErrorHandler`. Sin SSR y sin RSC. `<Link>` /
`useNavigate` se usan en 9 archivos, así que el open redirect **sí** tenía
superficie real.

`npm audit`: **9 vulnerabilidades (1 low, 1 moderate, 7 high) → 7 (1 low, 6
high)**. Desaparecen `react-router` y `react-router-dom`; no aparece ninguna
nueva. Las 7 restantes (`@babel/core`, `brace-expansion`, `js-yaml`, `nanoid`,
`postcss`, `undici`, `vite`) son dev-deps o transitivas que no llegan al
bundle, y quedaron fuera de este lote a propósito.

## 3. Gates ejecutados

| Gate | Resultado |
|---|---|
| `npm ci` | exit 0 |
| `npm run check:integrity` | exit 0 · 307 archivos |
| `npm run check:schema` | exit 0 · 6 schemas Zod en sync |
| `npm run check:freshness` | exit 0 · snapshot al día hasta 0062 |
| `npm run check:columns` | exit 0 · 306 archivos validan |
| `npm run typecheck` | exit 0 |
| `npm run test` | exit 0 · **66/66 archivos · 896/896 tests** |
| `npm run build` (CLIENT=hermes-cochi) | exit 0 |
| `git diff --check` | exit 0 |

Los tests dieron exactamente los mismos números que la base `3c541ba`: cero
variación por el bump.

**QA Lite no corrió porque no existe en esta base**: no hay scripts `qa:*` ni
`e2e/qa-lite/`, `scripts/qa-lite/`, `platform/qa-lite/`. El harness vive sólo
en las ramas de Codex, que descienden de `621c492`, un commit que no está en
`platform/runtime-tenant`.

## 4. Verificación en producción

### El chunk desplegado es el validado

La prueba fuerte no es `version.json` sino el hash del artefacto. Vite hashea
por contenido, así que mismo nombre y mismo sha256 significan mismo bytecode:

```
assets/react-vendor-mmV_xyY0.js
  sha256 producción : ba0fdc5ca3c65e81ca534177254d60bfb2e1000832d89612c86b5d55328bde89
  sha256 local      : ba0fdc5ca3c65e81ca534177254d60bfb2e1000832d89612c86b5d55328bde89
```

Ese chunk contiene `react-router`, `react-router-dom` y
`react-router-scroll-positions`. **React Router 7.18.3 está en producción.**

### Rutas y comportamiento

| Verificación | Resultado |
|---|---|
| `https://divianco.app/` | HTTP 200 |
| `/registro` | 200 · formulario de alta completo |
| `/entrar` | 200 · formulario de login completo |
| `/admin` | 200 |
| `<title>` estático de `index.html` | `Cochi` |
| `manifest.json` name | `Cochi` |
| Pantalla en blanco | ninguna |
| Errores JS no controlados (`pageerror`) | **0** |
| Datos creados durante la verificación | **ninguno** |

**Navegación client-side de React Router**: desde una ruta inexistente
(`NotFound`) se hizo click en su `<Link href="/">`. Resultado: la ruta cambió a
`/`, la landing renderizó y una variable global previa **sobrevivió** — o sea
transición manejada por el router, sin recarga de documento.

Aclaración para no confundir a quien lea esto después: los enlaces entre
`/entrar` y `/registro` son `<a href>` planos (`Login.jsx:264`,
`PlatformLanding.jsx:87`), no `<Link>`. Que recarguen el documento es diseño
previo, no una regresión del bump.

## 5. Errores preexistentes observados

Cuatro por carga, idénticos en las cuatro rutas, **ninguno relacionado con
React Router ni con este release**:

| Error | Origen | Causa |
|---|---|---|
| 404 | `rest/v1/feature_flags?select=key,enabled` | la tabla **no existe** en el edificio: 0 migraciones la crean |
| 404 | `rest/v1/theme_config?select=*&is_active=eq.true` | ídem, 0 migraciones |
| 401 | `rest/v1/settings?select=*&limit=1` | RLS |
| `permission denied for function tiene_rol` | consecuencia del anterior | `fetchSettings` |

Salen de `src/services/featureFlags.js:36` y `src/services/theme.js:28`,
invocados desde `main.jsx` en todo arranque, catálogo incluido. Los tres se
tragan el error y siguen con valores por defecto: por eso nunca se vieron.
Quedan como **deuda operativa**; no justifican reabrir este hotfix.

**Logs del build**: sin errores. Sólo el warning preexistente de chunks
>300 kB y `.git can't be found` de husky, inocuo porque Vercel buildea desde un
tarball. Vercel restauró la caché del deployment anterior e instaló
`changed 2 packages in 2s`, consistente con el parche quirúrgico.

## 6. Excepción de trazabilidad

```
https://divianco.app/version.json
  devuelto : {"buildId":"1788133097993"}
  esperado : {"buildId":"d86c8a90"}
```

`1788133097993` cae dentro de la ventana de build. Es el fallback `Date.now()`
de `vite.config.js:13`: `VERCEL_GIT_COMMIT_SHA` llegó vacío al entorno de
build.

**Medido:**

1. La metadata de este deployment trae `gitCommitSha` / `gitCommitRef`
   (genéricas de git). Los 20 deployments anteriores traían el juego completo
   `githubCommitSha`, `githubRepo`, `githubDeployment: "1"`, `githubRepoId`…
2. El log del build dice `.git can't be found` durante `husky`.
3. El `buildId` servido es un timestamp, no un SHA.

**Inferido:** los campos `github*` son los que hacen que Vercel inyecte
`VERCEL_GIT_COMMIT_SHA`. Este deploy salió de un **git worktree**, cuyo `.git`
es un archivo y no un directorio, y el CLI no resolvió el remoto de GitHub. El
mecanismo exacto no está probado; los tres hechos de arriba sí.

**Impacto real:**

- **Sin regresión funcional.** El chequeo de actualización compara el
  `__BUILD_ID__` bakeado contra `version.json`; ambos son el mismo timestamp,
  así que sigue funcionando.
- **Se pierde la correlación commit↔release de Sentry.** El release es
  `dico@1788133097993` en vez de `dico@d86c8a90`. Uploader y runtime siguen
  coincidiendo —el test anti-drift de `src/test/sentryRelease.test.js` no se
  viola— pero el nombre del release ya no mapea a un commit. Es exactamente la
  trazabilidad que se construyó el 29/ago.

**Decisión: no se redeploya ni se hace rollback.** El código correcto está
desplegado y demostrado por hash; corregir el identificador dentro de este
mismo release agregaría riesgo sin mejorar la seguridad de nadie. Se resuelve
como lote técnico independiente (sección 8) antes del próximo deployment.

## 7. Lo que NO se hizo

- **Edge Functions: no se desplegaron.** Se ejecutó únicamente
  `npm run deploy:web`, que es sólo el deployment web de producción. Nunca se
  corrió `npm run deploy`, que encadena `deploy:functions`.
- **Migración 0062: no aplicada.** Verificado contra la base: `sumar_staff`
  sigue teniendo 2 firmas vivas. Dropea un overload sin consumidores y se
  trata como una operación de base separada.
- Sin merge, rebase, checkout, pull ni reset.
- Sin cambios de variables ni de configuración del proyecto Vercel.
- Sin `npm audit fix`.
- Sin desplegar ningún otro proyecto o tenant.

## 8. Deuda técnica registrada: "Build identity fail-closed"

**No implementado en este release.** Es el lote que sigue, antes del próximo
deployment.

El problema de fondo: hoy el `BUILD_ID` depende de que Vercel adivine el
commit, y cuando no lo adivina el build **se inventa un identificador en
silencio** en vez de fallar. Es la misma familia de fallas silenciosas que ya
documentó el baseline de Phase 3 (`var(--x, fallback)` que nunca falla, el
`catch {}` de `featureFlags`).

Diseño esperado:

- No depender únicamente de `VERCEL_GIT_COMMIT_SHA`.
- Usar una variable propia explícita, por ejemplo `DICO_BUILD_ID`.
- Obtenerla de `git rev-parse HEAD` antes del build.
- Compartir exactamente el mismo valor entre `version.json`, `__BUILD_ID__` y
  el release de Sentry.
- En producción, **fallar el build** si el identificador no existe.
- Permitir fallback sólo en desarrollo local.
- Soportar repositorios normales **y git worktrees**.
- Separar build verificable y deploy: `vercel build --prod` seguido de
  `vercel deploy --prebuilt --prod`.
- Fijar la versión del CLI de Vercel.
- Tests para: SHA válido, variable ausente y consistencia entre artefactos.

## 9. Orden de trabajo acordado

1. Proteger el trabajo Dico en su propia rama.
2. Implementar "Build identity fail-closed".
3. Retomar Phase 3 Admin Shell (ver `platform/PHASE-3-ADMIN-SHELL-BASELINE.md`,
   que está en `COMPLETE — IMPLEMENTATION BLOCKED BY CORRECTNESS ISSUES`).
