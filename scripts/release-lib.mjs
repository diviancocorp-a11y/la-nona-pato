// scripts/release-lib.mjs
//
// Las piezas compartidas por `build:platform` y por el wrapper de deploy:
// resolver el HEAD, exigir worktree limpio, y auditar que el artefacto
// producido tenga la identidad que se pidio.
//
// Todo lo que ejecuta comandos externos entra por `run`, que es inyectable:
// asi los tests verifican las decisiones sin correr git ni vercel de verdad y
// sin deployar nada.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { SHA_RE, normalizeSha, shortId, sentryRelease, BuildIdentityError } from './build-identity.mjs';

/** El cliente que corresponde al edificio. Unico con `platform: true`. */
export const PLATFORM_CLIENT = 'hermes-cochi';

/**
 * Version EXACTA del CLI de Vercel. No `latest`.
 *
 * Es la que resolvio `npx --yes vercel` en el deploy de produccion del 30/ago
 * (`dpl_FZ2nat2egg6gorYYj2QPbat1FLLx`): el `vercel whoami` corrido en ese mismo
 * worktree, minutos antes del deploy, imprimio `Vercel CLI 59.10.0`.
 *
 * El builder remoto de Vercel corre su propio CLI (59.3.0 en ese deployment) y
 * eso no se puede fijar desde aca; lo que se fija es el cliente que arma y
 * envia el artefacto.
 */
export const VERCEL_CLI_VERSION = '59.10.0';

export const VERCEL_SCOPE = 'diviancocorp-a11ys-projects';
export const VERCEL_PROJECT_ID = 'prj_3WSWrxws27VLbIDebl8mDqyTPxCC';
export const VERCEL_PROJECT_NAME = 'hermes-platform';

export class ReleaseError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ReleaseError';
    this.code = 'DICO_RELEASE';
  }
}

/** Ejecutor por defecto. Devuelve { status, stdout, stderr }. */
export function defaultRun(command, args, options = {}) {
  const r = spawnSync(command, args, {
    cwd: options.cwd || process.cwd(),
    env: { ...process.env, ...options.env },
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
    stdio: options.stdio || 'pipe',
  });
  return {
    status: r.status,
    stdout: r.stdout || '',
    stderr: r.stderr || '',
    error: r.error || null,
  };
}

/**
 * El SHA del HEAD, validado.
 *
 * `git rev-parse HEAD` anda igual en un repo normal y en un worktree enlazado
 * —donde `.git` es un archivo—, que es justamente el caso que rompio el deploy
 * del 30/ago. Por eso el SHA se resuelve ACA y se pasa como variable, en vez de
 * confiar en que otra herramienta sepa leer `.git`.
 */
export function resolveHead({ run = defaultRun, cwd = process.cwd() } = {}) {
  const r = run('git', ['rev-parse', 'HEAD'], { cwd });
  if (r.status !== 0) {
    throw new ReleaseError(`git rev-parse HEAD fallo: ${(r.stderr || '').trim() || 'sin detalle'}`);
  }
  const sha = normalizeSha(r.stdout);
  if (!SHA_RE.test(sha)) {
    throw new ReleaseError(`git rev-parse HEAD no devolvio un SHA completo: ${JSON.stringify(r.stdout)}`);
  }
  return sha;
}

/** Tira si el worktree tiene cambios sin commitear. */
export function assertCleanWorktree({ run = defaultRun, cwd = process.cwd() } = {}) {
  const r = run('git', ['status', '--porcelain'], { cwd });
  if (r.status !== 0) {
    throw new ReleaseError(`git status fallo: ${(r.stderr || '').trim() || 'sin detalle'}`);
  }
  const sucio = r.stdout.split(/\r?\n/).filter((l) => l.trim()).length;
  if (sucio > 0) {
    throw new ReleaseError(
      `El worktree tiene ${sucio} cambio(s) sin commitear. Un artefacto de release `
      + 'tiene que corresponder a un commit: si el arbol esta sucio, el buildId '
      + 'apunta a un commit que NO es lo que se esta empaquetando.',
    );
  }
}

/** Tira si el HEAD no existe en origin (no seria recuperable ni auditable). */
export function assertHeadPublished(sha, { run = defaultRun, cwd = process.cwd() } = {}) {
  const r = run('git', ['branch', '-r', '--contains', sha], { cwd });
  if (r.status !== 0) {
    throw new ReleaseError(`No se pudo comprobar si ${shortId(sha)} esta en origin: ${(r.stderr || '').trim()}`);
  }
  const ramas = r.stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (ramas.length === 0) {
    throw new ReleaseError(
      `El commit ${shortId(sha)} no esta en ninguna rama remota. Un deploy de un `
      + 'commit que no existe en origin no se puede reproducir ni revisar despues. '
      + 'Pushealo primero.',
    );
  }
  return ramas;
}

/** Verifica que el `.vercel/project.json` local apunte al proyecto autorizado. */
export function assertAuthorizedProject(cwd = process.cwd()) {
  const p = join(cwd, '.vercel', 'project.json');
  if (!existsSync(p)) {
    throw new ReleaseError(
      `Falta ${p}. El wrapper no corre \`vercel link\`: copia ese archivo desde un `
      + 'worktree ya vinculado, o pedi que lo generen.',
    );
  }
  let json;
  try { json = JSON.parse(readFileSync(p, 'utf8')); } catch (e) {
    throw new ReleaseError(`.vercel/project.json ilegible: ${e.message}`);
  }
  if (json.projectId !== VERCEL_PROJECT_ID) {
    throw new ReleaseError(
      `.vercel/project.json apunta a ${json.projectId}, no al proyecto autorizado `
      + `${VERCEL_PROJECT_NAME} (${VERCEL_PROJECT_ID}).`,
    );
  }
  return json;
}

/**
 * Audita un directorio de salida (dist/ o .vercel/output/static) contra la
 * identidad esperada. Es el gate que habria frenado el deploy del 30/ago.
 */
export function auditOutput(outDir, expectedShort, { expectTitle = 'Cochi' } = {}) {
  const problemas = [];
  if (!existsSync(outDir)) {
    return { ok: false, problemas: [`No existe el directorio de salida: ${outDir}`] };
  }

  // version.json
  const versionPath = join(outDir, 'version.json');
  if (!existsSync(versionPath)) {
    problemas.push('Falta version.json en el output.');
  } else {
    let v;
    try { v = JSON.parse(readFileSync(versionPath, 'utf8')); } catch (e) {
      problemas.push(`version.json ilegible: ${e.message}`);
    }
    if (v && v.buildId !== expectedShort) {
      problemas.push(`version.json trae buildId=${JSON.stringify(v.buildId)}, se esperaba ${JSON.stringify(expectedShort)}.`);
    }
  }

  // __BUILD_ID__ bakeado: tiene que aparecer el mismo short id en algun bundle.
  const assetsDir = join(outDir, 'assets');
  if (!existsSync(assetsDir)) {
    problemas.push('Falta assets/ en el output.');
  } else {
    const js = readdirSync(assetsDir).filter((f) => f.endsWith('.js'));
    const enBundle = js.some((f) => readFileSync(join(assetsDir, f), 'utf8').includes(expectedShort));
    if (!enBundle) {
      problemas.push(`Ningun bundle contiene el build id ${expectedShort}: __BUILD_ID__ no coincide con version.json.`);
    }
    const mapas = readdirSync(assetsDir).filter((f) => f.endsWith('.map'));
    if (mapas.length > 0) problemas.push(`El output trae ${mapas.length} sourcemap(s): ${mapas.slice(0, 3).join(', ')}`);
  }

  // index.html + manifest: que sea el tenant del edificio y no otro.
  const indexPath = join(outDir, 'index.html');
  if (!existsSync(indexPath)) {
    problemas.push('Falta index.html en el output.');
  } else {
    const html = readFileSync(indexPath, 'utf8');
    const m = html.match(/<title>([^<]*)<\/title>/);
    if (!m || m[1].trim() !== expectTitle) {
      problemas.push(`<title> es ${JSON.stringify(m ? m[1] : null)}, se esperaba ${JSON.stringify(expectTitle)}.`);
    }
  }
  const manifestPath = join(outDir, 'manifest.json');
  if (existsSync(manifestPath)) {
    try {
      const mf = JSON.parse(readFileSync(manifestPath, 'utf8'));
      if (mf.name !== expectTitle) {
        problemas.push(`manifest.json name es ${JSON.stringify(mf.name)}, se esperaba ${JSON.stringify(expectTitle)}.`);
      }
    } catch (e) {
      problemas.push(`manifest.json ilegible: ${e.message}`);
    }
  }

  return {
    ok: problemas.length === 0,
    problemas,
    sentryRelease: sentryRelease(expectedShort),
  };
}

/** El entorno que recibe un build de release. */
export function releaseEnv(sha) {
  return {
    NODE_ENV: '',
    DICO_RELEASE: '1',
    DICO_BUILD_ID: sha,
    CLIENT: PLATFORM_CLIENT,
  };
}

export { shortId, sentryRelease, BuildIdentityError };
