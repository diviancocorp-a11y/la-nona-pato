#!/usr/bin/env node
// scripts/deploy-web.mjs  ·  npm run deploy:web  [-- --build-only]
//
// El deploy web de produccion del edificio, en dos mitades separadas:
// primero se construye y se AUDITA el artefacto localmente, y recien despues
// se sube ya construido (`--prebuilt`). Antes era un solo `vercel --prod` que
// buildeaba remoto: lo que llegaba a produccion no se podia inspeccionar hasta
// despues de estar publicado.
//
// `--build-only` hace todo menos el ultimo paso. Es el modo por defecto de
// cualquier trabajo que no tenga autorizacion explicita para deployar.
//
// NO despliega Edge Functions. Eso sigue siendo `deploy:functions`, aparte y a
// proposito: son dos sistemas con dos ventanas de riesgo distintas.

import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PLATFORM_CLIENT, ReleaseError, VERCEL_CLI_VERSION, VERCEL_SCOPE,
  assertAuthorizedProject, assertCleanWorktree, assertHeadPublished, auditOutput,
  defaultRun, releaseEnv, resolveHead, sentryRelease, shortId,
} from './release-lib.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** El CLI fijado. Nunca `latest`: un deploy tiene que ser reproducible. */
export function vercelCommand() {
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  return { command: npx, prefix: ['--yes', `vercel@${VERCEL_CLI_VERSION}`] };
}

export async function deployWeb({
  run = defaultRun,
  cwd = REPO,
  buildOnly = true,
  log = console.log,
} = {}) {
  const pasos = [];
  const { command, prefix } = vercelCommand();
  const vercel = (args, opts = {}) => {
    pasos.push(['vercel', ...args]);
    return run(command, [...prefix, ...args], { cwd, stdio: 'inherit', ...opts });
  };

  log('→ 1/11 worktree limpio...');
  assertCleanWorktree({ run, cwd });

  log('→ 2/11 resolviendo HEAD...');
  const sha = resolveHead({ run, cwd });
  const corto = shortId(sha);
  log(`     ${sha}  →  buildId ${corto}`);

  log('→ 3/11 el HEAD existe en origin...');
  const ramas = assertHeadPublished(sha, { run, cwd });
  log(`     en ${ramas.join(', ')}`);

  log('→ 4/11 proyecto Vercel autorizado...');
  const proj = assertAuthorizedProject(cwd);
  log(`     ${proj.projectName} (${proj.projectId})`);

  log(`→ 5/11 vercel pull (CLI ${VERCEL_CLI_VERSION})...`);
  const pull = vercel(['pull', '--yes', '--environment=production', `--scope=${VERCEL_SCOPE}`]);
  if (pull.status !== 0) throw new ReleaseError(`vercel pull fallo (exit ${pull.status}).`);

  log('→ 6/11 identidad explicita para el build...');
  const env = releaseEnv(sha);
  log(`     DICO_BUILD_ID=${sha}`);
  log(`     CLIENT=${PLATFORM_CLIENT}  DICO_RELEASE=1`);

  log('→ 7/11 vercel build --prod...');
  const build = vercel(['build', '--prod', `--scope=${VERCEL_SCOPE}`], { env });
  if (build.status !== 0) throw new ReleaseError(`vercel build fallo (exit ${build.status}).`);

  log('→ 8/11 auditando .vercel/output...');
  const outDir = join(cwd, '.vercel', 'output', 'static');
  const audit = auditOutput(outDir, corto);
  for (const p of audit.problemas) log(`     ✗ ${p}`);
  if (!audit.ok) {
    throw new ReleaseError(
      `El output prebuilt no coincide con la identidad ${corto}. `
      + `${audit.problemas.length} problema(s). No se sube nada.`,
    );
  }
  log(`     ✓ version.json = ${corto}`);
  log(`     ✓ __BUILD_ID__ coincide`);
  log(`     ✓ Sentry release = ${sentryRelease(corto)}`);
  log(`     ✓ sin sourcemaps`);

  log('→ 9/11 consistencia final...');
  log(`     buildId ${corto} ← HEAD ${sha}`);

  if (buildOnly) {
    log('→ 10/11 MODO --build-only: no se ejecuta deploy.');
    log('→ 11/11 listo. El artefacto quedo en .vercel/output, sin publicar.');
    return { deployed: false, sha, buildId: corto, sentryRelease: sentryRelease(corto), outDir, pasos };
  }

  log('→ 10/11 vercel deploy --prebuilt --prod...');
  const dep = vercel(['deploy', '--prebuilt', '--prod', '--yes', `--scope=${VERCEL_SCOPE}`]);
  if (dep.status !== 0) throw new ReleaseError(`vercel deploy fallo (exit ${dep.status}).`);
  log('→ 11/11 publicado.');

  return { deployed: true, sha, buildId: corto, sentryRelease: sentryRelease(corto), outDir, pasos };
}

const esEntrada = process.argv[1]
  && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (esEntrada) {
  const buildOnly = process.argv.includes('--build-only');
  if (!buildOnly) {
    console.error(
      'deploy:web sin --build-only publica a produccion.\n'
      + 'Este lote solo autoriza --build-only. Si el deploy esta autorizado, '
      + 'corre:  npm run deploy:web -- --deploy',
    );
    if (!process.argv.includes('--deploy')) process.exit(1);
  }
  deployWeb({ buildOnly })
    .then((r) => {
      console.log(`\nOK — ${r.buildId} (${r.sha})${r.deployed ? ' PUBLICADO' : ' sin publicar'}`);
    })
    .catch((e) => {
      console.error(`\nFALLO: ${e.message}`);
      process.exitCode = 1;
    });
}
