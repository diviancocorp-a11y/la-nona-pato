// src/test/buildIdentity.test.js
//
// El contrato de identidad del artefacto, fail-closed.
//
// Prueba lo que el 30/ago no estaba probado: que un build de release sin SHA
// valido NO produzca artefacto. Antes ese caso caia a `String(Date.now())` y
// produccion salio con `{"buildId":"1788133097993"}` sin que fallara nada.
//
// Los tests del wrapper de deploy inyectan un ejecutor falso: no corren git ni
// vercel de verdad, y por construccion no pueden deployar nada.

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it, expect, afterEach } from 'vitest';
import {
  resolveBuildIdentity, isValidSha, normalizeSha, shortId, isReleaseBuild,
  sentryRelease, BuildIdentityError, DEV_PREFIX,
} from '../../scripts/build-identity.mjs';
import { auditOutput, resolveHead, assertCleanWorktree, assertHeadPublished } from '../../scripts/release-lib.mjs';
import { deployWeb } from '../../scripts/deploy-web.mjs';

const SHA = 'd86c8a9015a03853db84d31fb6fbaaae46f7f8e8';
const CORTO = 'd86c8a90';
const OTRO_SHA = '0304f28cf601edd0523ceab3d1b56df3ccfa3997';

const temporales = [];
function tmp() {
  const d = mkdtempSync(join(tmpdir(), 'dico-build-identity-'));
  temporales.push(d);
  return d;
}
afterEach(() => {
  while (temporales.length) rmSync(temporales.pop(), { recursive: true, force: true });
});

/** Arma un output valido y deja que el test lo estropee a proposito. */
function outputValido({ buildId = CORTO, title = 'Cochi', conVersion = true, conMapa = false } = {}) {
  const dir = tmp();
  mkdirSync(join(dir, 'assets'), { recursive: true });
  if (conVersion) writeFileSync(join(dir, 'version.json'), JSON.stringify({ buildId }));
  writeFileSync(join(dir, 'assets', 'index-abc123.js'), `const __x="${buildId}";console.log(__x)`);
  if (conMapa) writeFileSync(join(dir, 'assets', 'index-abc123.js.map'), '{}');
  writeFileSync(join(dir, 'index.html'), `<!doctype html><title>${title}</title>`);
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ name: title }));
  return dir;
}

describe('resolucion de la identidad', () => {
  it('toma DICO_BUILD_ID cuando es un SHA completo', () => {
    const r = resolveBuildIdentity({ DICO_RELEASE: '1', DICO_BUILD_ID: SHA });
    expect(r.buildId).toBe(CORTO);
    expect(r.source).toBe('DICO_BUILD_ID');
    expect(r.sha).toBe(SHA);
  });

  it('cae a VERCEL_GIT_COMMIT_SHA cuando no hay DICO_BUILD_ID', () => {
    const r = resolveBuildIdentity({ DICO_RELEASE: '1', VERCEL_GIT_COMMIT_SHA: SHA });
    expect(r.buildId).toBe(CORTO);
    expect(r.source).toBe('VERCEL_GIT_COMMIT_SHA');
  });

  it('DICO_BUILD_ID tiene prioridad sobre VERCEL_GIT_COMMIT_SHA', () => {
    const r = resolveBuildIdentity({ DICO_RELEASE: '1', DICO_BUILD_ID: SHA, VERCEL_GIT_COMMIT_SHA: OTRO_SHA });
    expect(r.source).toBe('DICO_BUILD_ID');
    expect(r.buildId).toBe(CORTO);
  });

  it('normaliza mayusculas', () => {
    const r = resolveBuildIdentity({ DICO_RELEASE: '1', DICO_BUILD_ID: SHA.toUpperCase() });
    expect(r.sha).toBe(SHA);
    expect(r.buildId).toBe(CORTO);
  });

  it('normaliza espacios de los bordes', () => {
    const r = resolveBuildIdentity({ DICO_RELEASE: '1', DICO_BUILD_ID: `  ${SHA}\n` });
    expect(r.buildId).toBe(CORTO);
  });

  it('rechaza un SHA corto como entrada', () => {
    expect(() => resolveBuildIdentity({ DICO_RELEASE: '1', DICO_BUILD_ID: CORTO }))
      .toThrow(BuildIdentityError);
  });

  it('rechaza caracteres no hexadecimales', () => {
    expect(() => resolveBuildIdentity({ DICO_RELEASE: '1', DICO_BUILD_ID: 'z'.repeat(40) }))
      .toThrow(/no es un SHA de git completo/i);
  });

  it('en release sin variables: FALLA, no inventa', () => {
    expect(() => resolveBuildIdentity({ DICO_RELEASE: '1' })).toThrow(BuildIdentityError);
    let msg = '';
    try { resolveBuildIdentity({ DICO_RELEASE: '1' }); } catch (e) { msg = e.message; }
    expect(msg).not.toMatch(/\d{13}/);          // ningun timestamp
    expect(msg).not.toContain('unknown');
  });

  it('el entorno de produccion de Vercel tambien cuenta como release', () => {
    expect(isReleaseBuild({ VERCEL: '1', VERCEL_ENV: 'production' })).toBe(true);
    expect(isReleaseBuild({ VERCEL: '1', VERCEL_ENV: 'preview' })).toBe(false);
    expect(isReleaseBuild({ NODE_ENV: 'production' })).toBe(false);
    expect(() => resolveBuildIdentity({ VERCEL: '1', VERCEL_ENV: 'production' })).toThrow(BuildIdentityError);
  });

  it('en desarrollo sin variables da un identificador inequivocamente dev', () => {
    const r = resolveBuildIdentity({}, { now: () => 1700000000000 });
    expect(r.release).toBe(false);
    expect(r.source).toBe('dev');
    expect(r.buildId.startsWith(DEV_PREFIX)).toBe(true);
    expect(isValidSha(r.buildId)).toBe(false);
    expect(r.buildId).not.toMatch(/^[0-9a-f]{8}$/);   // no se confunde con un short SHA
  });

  it('helpers de normalizacion y acortado', () => {
    expect(normalizeSha(`  ${SHA.toUpperCase()} `)).toBe(SHA);
    expect(normalizeSha(null)).toBe('');
    expect(isValidSha(SHA)).toBe(true);
    expect(isValidSha(CORTO)).toBe(false);
    expect(shortId(SHA)).toBe(CORTO);
    expect(() => shortId(CORTO)).toThrow(BuildIdentityError);
  });
});

describe('los consumidores comparten exactamente el mismo id', () => {
  it('version.json, __BUILD_ID__ y el release de Sentry coinciden', () => {
    const dir = outputValido();
    const r = auditOutput(dir, CORTO);
    expect(r.problemas).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.sentryRelease).toBe(`dico@${CORTO}`);
  });

  it('el release de Sentry es dico@<shortSha>', () => {
    expect(sentryRelease(CORTO)).toBe('dico@d86c8a90');
  });

  it('si version.json y el bundle divergen, FALLA', () => {
    const dir = outputValido({ buildId: CORTO });
    writeFileSync(join(dir, 'version.json'), JSON.stringify({ buildId: '00000000' }));
    const r = auditOutput(dir, CORTO);
    expect(r.ok).toBe(false);
    expect(r.problemas.join(' ')).toMatch(/version\.json trae buildId/);
  });

  it('output sin version.json: FALLA', () => {
    const r = auditOutput(outputValido({ conVersion: false }), CORTO);
    expect(r.ok).toBe(false);
    expect(r.problemas.join(' ')).toMatch(/Falta version\.json/);
  });

  it('output con buildId incorrecto en el bundle: FALLA', () => {
    const dir = outputValido({ buildId: 'deadbeef' });
    writeFileSync(join(dir, 'version.json'), JSON.stringify({ buildId: CORTO }));
    const r = auditOutput(dir, CORTO);
    expect(r.ok).toBe(false);
    expect(r.problemas.join(' ')).toMatch(/Ningun bundle contiene el build id/);
  });

  it('un sourcemap en el output: FALLA', () => {
    const r = auditOutput(outputValido({ conMapa: true }), CORTO);
    expect(r.ok).toBe(false);
    expect(r.problemas.join(' ')).toMatch(/sourcemap/i);
  });

  it('un tenant equivocado en el output: FALLA', () => {
    const r = auditOutput(outputValido({ title: 'La Nona Pato' }), CORTO);
    expect(r.ok).toBe(false);
    expect(r.problemas.join(' ')).toMatch(/title|manifest/i);
  });
});

/** Ejecutor falso: registra las llamadas y nunca toca el sistema. */
function fakeRun(respuestas) {
  const llamadas = [];
  const run = (command, args) => {
    llamadas.push([command, ...args].join(' '));
    for (const [patron, resp] of respuestas) {
      if (args.join(' ').includes(patron)) return { status: 0, stdout: '', stderr: '', ...resp };
    }
    return { status: 0, stdout: '', stderr: '' };
  };
  run.llamadas = llamadas;
  return run;
}

describe('gates del release', () => {
  it('resolveHead exige un SHA completo', () => {
    const ok = fakeRun([['rev-parse', { stdout: `${SHA}\n` }]]);
    expect(resolveHead({ run: ok })).toBe(SHA);
    const corto = fakeRun([['rev-parse', { stdout: `${CORTO}\n` }]]);
    expect(() => resolveHead({ run: corto })).toThrow(/SHA completo/);
  });

  it('worktree sucio bloquea el release', () => {
    const sucio = fakeRun([['status', { stdout: ' M src/App.jsx\n?? nuevo.txt\n' }]]);
    expect(() => assertCleanWorktree({ run: sucio })).toThrow(/sin commitear/);
    const limpio = fakeRun([['status', { stdout: '' }]]);
    expect(() => assertCleanWorktree({ run: limpio })).not.toThrow();
  });

  it('un HEAD que no esta en origin bloquea el deploy', () => {
    const sinRemoto = fakeRun([['branch', { stdout: '\n' }]]);
    expect(() => assertHeadPublished(SHA, { run: sinRemoto })).toThrow(/no esta en ninguna rama remota/);
    const conRemoto = fakeRun([['branch', { stdout: '  origin/platform/runtime-tenant\n' }]]);
    expect(assertHeadPublished(SHA, { run: conRemoto })).toContain('origin/platform/runtime-tenant');
  });
});

describe('wrapper de deploy', () => {
  function entornoOk() {
    const cwd = tmp();
    mkdirSync(join(cwd, '.vercel'), { recursive: true });
    writeFileSync(join(cwd, '.vercel', 'project.json'), JSON.stringify({
      projectId: 'prj_3WSWrxws27VLbIDebl8mDqyTPxCC',
      orgId: 'team_E5ATCc0AjW66Ej0axz7l5SSg',
      projectName: 'hermes-platform',
    }));
    const salida = join(cwd, '.vercel', 'output', 'static');
    mkdirSync(join(salida, 'assets'), { recursive: true });
    writeFileSync(join(salida, 'version.json'), JSON.stringify({ buildId: CORTO }));
    writeFileSync(join(salida, 'assets', 'index-x.js'), `"${CORTO}"`);
    // Template literal a proposito: check-file-integrity.mjs ignora el contenido
    // entre backticks, y un `</title>` en comillas simples lo hace creer que hay
    // JSX en un .js.
    writeFileSync(join(salida, 'index.html'), `<!doctype html><title>Cochi</title>`);
    writeFileSync(join(salida, 'manifest.json'), JSON.stringify({ name: 'Cochi' }));
    const run = fakeRun([
      ['rev-parse', { stdout: `${SHA}\n` }],
      ['status --porcelain', { stdout: '' }],
      ['branch -r', { stdout: '  origin/platform/runtime-tenant\n' }],
    ]);
    return { cwd, run };
  }

  it('--build-only NUNCA llama a vercel deploy', async () => {
    const { cwd, run } = entornoOk();
    const r = await deployWeb({ run, cwd, buildOnly: true, log: () => {} });
    expect(r.deployed).toBe(false);
    expect(r.buildId).toBe(CORTO);
    const deploys = run.llamadas.filter((c) => /\bdeploy\b/.test(c));
    expect(deploys).toEqual([]);
    expect(run.llamadas.some((c) => c.includes('build --prod'))).toBe(true);
    expect(run.llamadas.some((c) => c.includes('pull'))).toBe(true);
  });

  it('usa el CLI fijado y nunca `latest`', async () => {
    const { cwd, run } = entornoOk();
    await deployWeb({ run, cwd, buildOnly: true, log: () => {} });
    const conVercel = run.llamadas.filter((c) => c.includes('vercel@'));
    expect(conVercel.length).toBeGreaterThan(0);
    for (const c of conVercel) {
      expect(c).toMatch(/vercel@\d+\.\d+\.\d+/);
      expect(c).not.toContain('vercel@latest');
    }
  });

  it('con el output roto no deploya ni en modo deploy', async () => {
    const { cwd, run } = entornoOk();
    writeFileSync(join(cwd, '.vercel', 'output', 'static', 'version.json'), JSON.stringify({ buildId: 'ffffffff' }));
    await expect(deployWeb({ run, cwd, buildOnly: false, log: () => {} })).rejects.toThrow(/no coincide con la identidad/);
    expect(run.llamadas.filter((c) => /deploy --prebuilt/.test(c))).toEqual([]);
  });

  it('worktree sucio corta antes de tocar vercel', async () => {
    const cwd = tmp();
    const run = fakeRun([['status --porcelain', { stdout: ' M algo.js\n' }]]);
    await expect(deployWeb({ run, cwd, buildOnly: true, log: () => {} })).rejects.toThrow(/sin commitear/);
    expect(run.llamadas.filter((c) => c.includes('vercel@'))).toEqual([]);
  });
});
