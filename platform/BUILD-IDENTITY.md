# Identidad del artefacto — fail closed

Cómo se decide qué commit representa un build, por qué falla en vez de
inventar, y cómo se construye y se publica el edificio.

---

## 1. El problema que resuelve

Hasta el 30/ago/2026, `vite.config.js` armaba el identificador así:

```js
const BUILD_ID = (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 8) || String(Date.now())
```

El deploy de producción de ese día salió desde un **git worktree**. En un
worktree `.git` es un archivo, no un directorio: el CLI de Vercel no resolvió el
remoto de GitHub, no mandó la metadata `github*` y Vercel no inyectó
`VERCEL_GIT_COMMIT_SHA` en el entorno de build. El `||` se comió el vacío y
produjo un timestamp.

Producción quedó sirviendo `{"buildId":"1788133097993"}` y el release de Sentry
en `dico@1788133097993`. **Nada falló.** El sitio andaba, el banner de
actualización andaba, los sourcemaps se subían. Simplemente ningún stack trace
podía atribuirse a un commit.

Es la misma familia que `var(--x, fallback)` y que el `catch {}` de
`featureFlags`: un default silencioso que tapa la ausencia del dato en vez de
gritarla.

## 2. El contrato

**Fuentes permitidas, en orden:**

1. **`DICO_BUILD_ID`** — la aporta explícitamente el proceso de build.
2. **`VERCEL_GIT_COMMIT_SHA`** — sólo por compatibilidad con deployments hechos
   por integración Git, donde la inyecta Vercel.

**Formato válido:** SHA de git hexadecimal completo, 40 caracteres,
normalizado a minúsculas y sin espacios en los bordes. El identificador público
son exactamente sus **primeros 8 caracteres**.

**En release** (`DICO_RELEASE=1`, o el entorno de producción de Vercel:
`VERCEL=1` + `VERCEL_ENV=production`):

- sin SHA válido, **el build falla**;
- no se usa `Date.now()`;
- no se usa `unknown`;
- no se inventa nada;
- no se sigue con warning.

**En desarrollo local** el identificador es `dev-<timestamp>`. Lleva prefijo
`dev-`, así que no puede confundirse con un SHA, y sigue cambiando en cada
build para que el banner de actualización local siga sirviendo. `Date.now()`
vive únicamente en esta rama y es inalcanzable en un release.

Un mismo id corto alimenta **exactamente**:

| Consumidor | Dónde |
|---|---|
| `version.json` | `vite.config.js` → `versionJsonPlugin` |
| `__BUILD_ID__` | `vite.config.js` → `define` |
| comparación de actualización | `src/hooks/useAppUpdate.js` |
| release de Sentry (uploader) | `vite.config.js` → `SENTRY_RELEASE` |
| release de Sentry (runtime) | `src/lib/release.js` → `dico@<buildId>` |

La resolución **no está duplicada**: vive en `scripts/build-identity.mjs` y
`vite.config.js` la consume. `src/test/sentryRelease.test.js` sigue comparando
uploader y runtime.

### Por qué no se escribe `VERCEL_GIT_COMMIT_SHA` a mano

Es una variable que **inyecta Vercel** para describir su propio contexto de
git. Escribirla nosotros sería falsificar la fuente: el build quedaría
indistinguible de uno hecho por integración Git y volvería a esconder el caso
"Vercel no sabe en qué commit está" — exactamente el que causó el incidente.
`DICO_BUILD_ID` es nuestra variable, la ponemos nosotros, y se lee como lo que
es: un dato que aporta el proceso de build.

## 3. `npm run build:platform`

El build del edificio con identidad explícita. `npm run build` a secas **no
sirve para producción**: sin `CLIENT` cae a `la-nona-pato` y produce el
artefacto de otro tenant.

Hace, en orden:

1. `git rev-parse HEAD` — anda igual en un repo normal y en un worktree;
2. valida que sea un SHA completo de 40 hex;
3. exige worktree limpio (`--allow-dirty` sólo para probar, y avisa que lo
   producido no es publicable);
4. fija `DICO_BUILD_ID=<HEAD>`, `CLIENT=hermes-cochi`, `DICO_RELEASE=1`;
5. corre el build;
6. audita `dist/`: `version.json` = short SHA, el short SHA aparece en algún
   bundle, `<title>` y `manifest.name` son `Cochi`, cero sourcemaps;
7. falla ante cualquier divergencia.

El SHA se resuelve **antes** de arrancar el build. No se depende de que Vercel
sepa interpretar `.git`.

## 4. `npm run deploy:web -- --build-only`

El deploy web pasó a ser un wrapper en dos mitades: primero se construye y se
**audita el artefacto localmente**, y recién después se sube ya construido
(`--prebuilt`). Antes era un solo `vercel --prod` que buildeaba remoto: lo que
llegaba a producción no se podía inspeccionar hasta después de estar publicado.

Pasos:

1. worktree limpio;
2. resolver y validar el HEAD;
3. el HEAD existe en `origin` (si no, el deploy no sería reproducible);
4. `.vercel/project.json` apunta al proyecto autorizado `hermes-platform`;
5. `vercel pull --yes --environment=production`;
6. exportar `DICO_BUILD_ID` y `CLIENT=hermes-cochi`;
7. `vercel build --prod`;
8. auditar `.vercel/output/static`;
9. exigir `version.json` = short HEAD, consistencia de bundle y Sentry release;
10. **sólo entonces** `vercel deploy --prebuilt --prod --yes`.

**`--build-only`** hace todo menos el paso 10. Es el modo por defecto: sin
`--deploy` explícito el script sale con error antes de tocar nada. Un deploy
real requiere autorización explícita en el turno.

**No despliega Edge Functions.** Eso sigue siendo `deploy:functions`, aparte y
a propósito: son dos sistemas con ventanas de riesgo distintas. `npm run deploy`
encadena los dos y mantiene la separación visible.

## 5. CLI de Vercel fijado

`59.10.0`, en `scripts/release-lib.mjs` (`VERCEL_CLI_VERSION`), consumido como
`npx --yes vercel@59.10.0`. Nunca `latest`.

**Por qué esa versión**: es la que resolvió `npx --yes vercel` en el deploy de
producción del 30/ago (`dpl_FZ2nat2egg6gorYYj2QPbat1FLLx`). El `vercel whoami`
corrido en ese mismo worktree, minutos antes del deploy, imprimió
`Vercel CLI 59.10.0`.

**Por qué `npx@versión` y no una devDependency**: agregar `vercel` a
`devDependencies` mete ~200 paquetes en el árbol de todos —incluido CI y el
build remoto, que no lo necesitan— y toca `package-lock.json`, que está en
coordinación con otras ramas. El `npx --yes vercel@<versión>` centralizado en
`vercelCommand()` da el mismo pinning con cero cambios de dependencias. Si
alguna vez hace falta trabajar sin red, conviene revisar la decisión.

El builder remoto de Vercel corre **su propio** CLI (59.3.0 en ese deployment).
Eso no se puede fijar desde el repo; lo que se fija es el cliente que arma y
envía el artefacto.

## 6. `npm run check:install-state`

Que `node_modules` sea de verdad lo que dice el lockfile.

El 30/ago el worktree principal tenía `react-router-dom` 7.18.2 y
`react-router` 7.15.1 instalados mientras el lockfile resolvía 7.18.3 para los
dos. La suite corrió contra ese árbol y pasó: no probaba lo que se iba a
publicar.

Detecta:

- `package.json` desalineado con `package-lock.json` (en los dos sentidos);
- dependencia instalada con versión distinta a la resuelta por el lockfile;
- dependencia directa declarada y no instalada;
- lockfile inválido (sin sección `packages`).

Es **general**: recorre todo el lockfile, no una lista de paquetes. Lee
metadata real de los tres lados; no mockea la salida de npm.

Los opcionales por plataforma (`optional: true`, o `os`/`cpu` que no matchean)
se informan aparte y **no rompen** el check: un `npm ci` limpio en Windows deja
44 de esos y hacerlos fallar volvería el gate inservible.

Está enganchado al pre-commit, después de la integridad de `src/`.

## 7. Recuperación

**"El build de release falla por identidad"** — es el comportamiento correcto:
falta el SHA. Verificá que estés corriendo `build:platform` y no `vite build` a
mano. Si el worktree está sucio, commiteá o guardá los cambios; un artefacto de
release tiene que corresponder a un commit.

**"El HEAD no está en ninguna rama remota"** — pushear la rama antes de
deployar. Un deploy de un commit que no existe en `origin` no se puede
reproducir ni revisar después.

**"El output no coincide con la identidad"** — no subas nada. Es exactamente el
caso del 30/ago, detectado antes de publicar. Revisá qué consumidor quedó
desalineado con el mensaje del audit y arreglá eso.

**"check:install-state falla"** — `npm ci`. Reinstala exactamente lo que dice
el lockfile.

**Verificar qué hay publicado**: `https://divianco.app/version.json` devuelve el
short SHA del commit desplegado. Si devuelve un número largo, el deploy salió
sin identidad y hay que rastrearlo por el hash de los assets.
