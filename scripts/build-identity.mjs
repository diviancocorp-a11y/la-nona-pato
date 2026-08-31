// scripts/build-identity.mjs
//
// La identidad del artefacto. UN solo lugar que la resuelve, la valida y la
// acorta.
//
// ── EL BUG QUE PREVIENE (30/ago/2026) ──
// `vite.config.js` armaba el id asi:
//
//   const BUILD_ID = (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 8)
//                    || String(Date.now())
//
// El deploy de produccion del 30/ago salio desde un git worktree. En un
// worktree `.git` es un ARCHIVO, no un directorio: el CLI de Vercel no resolvio
// el remoto de GitHub, no mando la metadata `github*` y por lo tanto Vercel no
// inyecto `VERCEL_GIT_COMMIT_SHA` en el entorno de build. El `||` se comio el
// vacio y produjo un timestamp.
//
// Resultado: produccion sirviendo `{"buildId":"1788133097993"}` y el release de
// Sentry en `dico@1788133097993`. Nada fallo. El sitio andaba, el banner de
// actualizacion andaba, los sourcemaps subian. Simplemente ningun stack trace
// se podia atribuir a un commit.
//
// Es la misma familia que `var(--x, fallback)` y que el `catch {}` de
// featureFlags: un default silencioso que tapa la ausencia del dato en vez de
// gritarla. Por eso este modulo es FAIL-CLOSED: en un build de release, sin SHA
// valido no hay artefacto.
//
// ── POR QUE NO SE ESCRIBE VERCEL_GIT_COMMIT_SHA A MANO ──
// Es una variable que INYECTA Vercel para describir su propio contexto de git.
// Escribirla nosotros seria falsificar la fuente: quedaria indistinguible de un
// deploy por integracion Git y volveria a esconder el caso "Vercel no sabe en
// que commit esta". `DICO_BUILD_ID` es nuestra variable, la ponemos nosotros y
// se lee como lo que es: un dato que aporta el proceso de build.

/** Un SHA de git completo: 40 hexadecimales. */
export const SHA_RE = /^[0-9a-f]{40}$/;

/** Cuantos caracteres del SHA son el identificador publico. */
export const SHORT_LENGTH = 8;

/** Prefijo de los identificadores de desarrollo. Nunca puede ser un SHA. */
export const DEV_PREFIX = 'dev-';

export class BuildIdentityError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BuildIdentityError';
    this.code = 'DICO_BUILD_IDENTITY';
  }
}

/**
 * Normaliza un candidato a SHA: saca espacios de los bordes y baja a minusculas.
 * No valida. Devuelve string vacio para null/undefined/no-string.
 */
export function normalizeSha(raw) {
  if (typeof raw !== 'string') return '';
  return raw.trim().toLowerCase();
}

/** True solo para un SHA completo de 40 hex, ya normalizado o no. */
export function isValidSha(raw) {
  return SHA_RE.test(normalizeSha(raw));
}

/**
 * El identificador publico: los primeros 8 caracteres del SHA.
 * Exige un SHA valido — acortar algo que no lo es es justamente el error que
 * este modulo existe para impedir.
 */
export function shortId(raw) {
  const sha = normalizeSha(raw);
  if (!SHA_RE.test(sha)) {
    throw new BuildIdentityError(`No es un SHA de git completo: ${JSON.stringify(raw)}`);
  }
  return sha.slice(0, SHORT_LENGTH);
}

/**
 * Es este un build de release?
 *
 * Dos formas, las dos explicitas:
 *   - `DICO_RELEASE=1`, que ponen `build:platform` y el wrapper de deploy.
 *   - el entorno de build de Vercel en produccion (`VERCEL=1` +
 *     `VERCEL_ENV=production`), para que un build disparado desde el dashboard
 *     o por integracion Git tampoco pueda caer al identificador de desarrollo.
 *
 * Deliberadamente NO mira NODE_ENV: el pre-commit corre `vite build` para
 * verificar imports y ese build no es un release.
 */
export function isReleaseBuild(env = process.env) {
  if (env.DICO_RELEASE === '1') return true;
  return env.VERCEL === '1' && env.VERCEL_ENV === 'production';
}

/**
 * Resuelve la identidad del build.
 *
 * Fuentes permitidas, en orden:
 *   1. `DICO_BUILD_ID`  — la aporta explicitamente el proceso de build.
 *   2. `VERCEL_GIT_COMMIT_SHA` — solo por compatibilidad con deployments hechos
 *      por integracion Git, donde la inyecta Vercel.
 *
 * En release, si ninguna trae un SHA valido, tira. No hay tercer camino: ni
 * timestamp, ni 'unknown', ni warning.
 *
 * Fuera de release devuelve `dev-<timestamp>`, que no puede confundirse con un
 * SHA (tiene guion) y sigue cambiando en cada build para que el banner de
 * actualizacion local siga sirviendo.
 *
 * @returns {{ buildId: string, source: string, sha: string|null, release: boolean }}
 */
export function resolveBuildIdentity(env = process.env, { now = Date.now } = {}) {
  const release = isReleaseBuild(env);
  const candidatos = [
    ['DICO_BUILD_ID', env.DICO_BUILD_ID],
    ['VERCEL_GIT_COMMIT_SHA', env.VERCEL_GIT_COMMIT_SHA],
  ];

  for (const [source, raw] of candidatos) {
    const sha = normalizeSha(raw);
    if (!sha) continue;
    if (!SHA_RE.test(sha)) {
      throw new BuildIdentityError(
        `${source} no es un SHA de git completo (40 hex): ${JSON.stringify(raw)}. `
        + 'Un SHA corto o un valor arbitrario no alcanzan: el identificador publico '
        + 'se deriva del completo.',
      );
    }
    return { buildId: sha.slice(0, SHORT_LENGTH), source, sha, release };
  }

  if (release) {
    throw new BuildIdentityError(
      'Build de release sin identidad: falta DICO_BUILD_ID (y no hay '
      + 'VERCEL_GIT_COMMIT_SHA). Antes esto caia a un timestamp y el artefacto '
      + 'quedaba sin poder atribuirse a un commit. Corre `npm run build:platform`, '
      + 'que resuelve el HEAD y lo exporta.',
    );
  }

  return { buildId: `${DEV_PREFIX}${now()}`, source: 'dev', sha: null, release: false };
}

/** El release de Sentry para un identificador dado. Mismo formato que src/lib/release.js. */
export function sentryRelease(buildId) {
  return `dico@${buildId}`;
}
