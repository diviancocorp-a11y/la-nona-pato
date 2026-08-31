#!/usr/bin/env node
// scripts/build-platform.mjs  ·  npm run build:platform
//
// El build del EDIFICIO, con identidad explicita.
//
// `npm run build` a secas no sirve para produccion: sin CLIENT cae a
// `la-nona-pato` (vite.config.js) y sin SHA caia a un timestamp. O sea que el
// gate verde de un RC no probaba que compilara el artefacto real. Este script
// resuelve las dos cosas ANTES de arrancar el build y despues audita que el
// resultado tenga la identidad que se pidio.

import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  PLATFORM_CLIENT, ReleaseError, assertCleanWorktree, auditOutput, defaultRun,
  releaseEnv, resolveHead, sentryRelease, shortId,
} from './release-lib.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export async function buildPlatform({
  run = defaultRun,
  cwd = REPO,
  allowDirty = false,
  log = console.log,
} = {}) {
  log('→ Resolviendo HEAD...');
  const sha = resolveHead({ run, cwd });
  const corto = shortId(sha);
  log(`  HEAD ${sha}`);
  log(`  buildId esperado: ${corto}`);
  log(`  Sentry release  : ${sentryRelease(corto)}`);

  if (allowDirty) {
    log('  ! worktree sucio permitido (--allow-dirty): esto NO es un artefacto publicable');
  } else {
    log('→ Worktree limpio...');
    assertCleanWorktree({ run, cwd });
    log('  OK');
  }

  const dist = join(cwd, 'dist');
  rmSync(dist, { recursive: true, force: true });

  log(`→ Build (CLIENT=${PLATFORM_CLIENT}, DICO_RELEASE=1)...`);
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const r = run(npm, ['run', 'build'], { cwd, env: releaseEnv(sha), stdio: 'inherit' });
  if (r.status !== 0) {
    throw new ReleaseError(`El build fallo (exit ${r.status}). ${(r.stderr || '').trim()}`);
  }

  log('→ Auditando el artefacto...');
  const audit = auditOutput(dist, corto);
  for (const p of audit.problemas) log(`  ✗ ${p}`);
  if (!audit.ok) {
    throw new ReleaseError(
      `El artefacto no coincide con la identidad pedida (${corto}). `
      + `${audit.problemas.length} problema(s) arriba.`,
    );
  }
  log(`  ✓ version.json, __BUILD_ID__ y release de Sentry coinciden en ${corto}`);
  log(`  ✓ sin sourcemaps en el output`);

  return { sha, buildId: corto, sentryRelease: sentryRelease(corto), outDir: dist };
}

const esEntrada = process.argv[1]
  && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (esEntrada) {
  buildPlatform({ allowDirty: process.argv.includes('--allow-dirty') })
    .then((r) => {
      console.log(`\nOK — ${r.buildId} (${r.sha})`);
    })
    .catch((e) => {
      console.error(`\nFALLO: ${e.message}`);
      process.exitCode = 1;
    });
}
