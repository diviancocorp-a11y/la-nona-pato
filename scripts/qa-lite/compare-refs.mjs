#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, rmdirSync } from 'node:fs';
import { basename, join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { bootstrapUser } from '../../platform/qa-lite/bootstrap-user.mjs';
import {
  FIXED_NOW, REPO_ROOT, runCaptured, startAndResetLocal,
} from '../../platform/qa-lite/lib.mjs';
import {
  createRunTemp, createRefWorktree, installAndBuild, removeRefWorktree, startPreview,
} from './build-ref.mjs';
import { compareDomDirectories, compareScreenshotDirectories } from './compare-artifacts.mjs';
import { compareScrollTraces, formatFirstScrollDivergence } from './compare-scroll-traces.mjs';
import { formatFirstFailure } from './report-gate.mjs';
import { writeManifest } from './write-manifest.mjs';

function arg(name, fallback) {
  const exact = process.argv.find((value) => value.startsWith(`--${name}=`));
  if (exact) return exact.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function safeRunId() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function runPlaywright({ phase, url, artifactDir, status, user }) {
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  runCaptured(npx, ['playwright', 'test', '--config', 'playwright.qa-lite.config.ts', '--max-failures=1'], {
    cwd: REPO_ROOT,
    label: `Playwright QA Lite ${phase}`,
    env: {
      NODE_ENV: 'test',
      QA_PHASE: phase,
      QA_TARGET_URL: url,
      QA_ARTIFACT_DIR: artifactDir,
      QA_SUPABASE_URL: status.apiUrl,
      QA_SUPABASE_ANON_KEY: status.anonKey,
      QA_SUPABASE_SERVICE_ROLE: status.serviceRoleKey,
      QA_ADMIN_EMAIL: user.email,
      QA_ADMIN_PASSWORD: user.password,
      QA_FIXED_NOW: FIXED_NOW,
      // Pasa el presupuesto de reloj si esta seteado. Ver playwright.qa-lite.config.ts.
      ...(process.env.QA_TEST_TIMEOUT_MS ? { QA_TEST_TIMEOUT_MS: process.env.QA_TEST_TIMEOUT_MS } : {}),
    },
  });
}

function readNetwork(artifactDir) {
  const result = [];
  for (const phase of ['base', 'candidate']) {
    const dir = join(artifactDir, phase);
    for (const file of readdirSync(dir).filter((name) => name.startsWith('network-') && name.endsWith('.json')).sort()) {
      result.push({ phase, file, ...JSON.parse(readFileSync(join(dir, file), 'utf8')) });
    }
  }
  return result;
}

async function stopPreview(preview) {
  if (!preview?.child || preview.child.exitCode !== null) return;
  preview.child.kill();
  await Promise.race([
    new Promise((resolveExit) => preview.child.once('exit', resolveExit)),
    new Promise((resolveWait) => setTimeout(resolveWait, 3000)),
  ]);
}

function cleanupRunRoot(runRoot) {
  const tempRoot = resolve(tmpdir()) + sep;
  const resolved = resolve(runRoot);
  if (!resolved.startsWith(tempRoot) || !basename(resolved).startsWith('dico-qa-lite-')) {
    throw new Error('Se rechazo limpiar un temporal fuera de DICO-QA-Lite');
  }
  if (existsSync(resolved) && readdirSync(resolved).length === 0) rmdirSync(resolved);
}

export async function compareRefs({ baseRef = '621c492^', candidateRef = '621c492' } = {}) {
  const artifactDir = join(REPO_ROOT, '.qa-lite', 'artifacts', safeRunId());
  mkdirSync(artifactDir, { recursive: true });
  const runRoot = createRunTemp();
  let baseWorktree;
  let candidateWorktree;
  let basePreview;
  let candidatePreview;

  try {
    // Primer reset: estado exclusivo de base.
    const baseLocal = startAndResetLocal();
    const baseUser = await bootstrapUser(baseLocal.status);

    baseWorktree = createRefWorktree({ ref: baseRef, label: 'base', runRoot });
    candidateWorktree = createRefWorktree({ ref: candidateRef, label: 'candidate', runRoot });
    const baseEnv = installAndBuild(baseWorktree, baseLocal.status);
    const candidateEnv = installAndBuild(candidateWorktree, baseLocal.status);
    basePreview = await startPreview(baseWorktree, 4173, baseEnv);
    candidatePreview = await startPreview(candidateWorktree, 4174, candidateEnv);

    runPlaywright({
      phase: 'base', url: basePreview.url, artifactDir,
      status: baseLocal.status, user: baseUser,
    });

    // Candidate nunca comparte estado mutable con base: reset completo entre fases.
    const candidateLocal = startAndResetLocal();
    const candidateUser = await bootstrapUser(candidateLocal.status);
    runPlaywright({
      phase: 'candidate', url: candidatePreview.url, artifactDir,
      status: candidateLocal.status, user: candidateUser,
    });

    const dom = compareDomDirectories(
      join(artifactDir, 'base', 'dom'),
      join(artifactDir, 'candidate', 'dom'),
      join(artifactDir, 'dom-diff.json'),
    );
    const screenshots = compareScreenshotDirectories(
      join(artifactDir, 'base', 'screenshots'),
      join(artifactDir, 'candidate', 'screenshots'),
      join(artifactDir, 'screenshots', 'diff'),
    );
    const scrollTrace = compareScrollTraces(artifactDir);
    const network = readNetwork(artifactDir);
    const manifest = writeManifest({
      artifactDir,
      base: { sha: baseWorktree.sha, url: basePreview.url },
      candidate: { sha: candidateWorktree.sha, url: candidatePreview.url },
      status: candidateLocal.status,
      migrations: candidateLocal.migrations,
      dom,
      screenshots,
      network,
    });
    const passed = manifest.gate.domEqual && manifest.gate.pixelsEqual && manifest.gate.noExternalTraffic;
    console.log(`Artifacts: ${artifactDir}`);
    console.log(formatFirstScrollDivergence(scrollTrace));
    console.log(`DOM: ${manifest.gate.domEqual ? 'igual' : 'diferente'}; pixels bloqueantes: ${manifest.gate.pixelsEqual ? 'cero' : 'detectados'}; red externa: ${manifest.gate.noExternalTraffic ? 'cero' : 'detectada'}`);
    if (!passed) {
      console.error(formatFirstFailure({ artifactDir, dom, screenshots }));
      throw new Error('DICO-QA-Lite gate fallo; revisar manifest.json y diffs');
    }
    return { artifactDir, manifest };
  } finally {
    await stopPreview(basePreview);
    await stopPreview(candidatePreview);
    try { removeRefWorktree(candidateWorktree, runRoot); } catch { /* se informa por git worktree prune manual si hiciera falta */ }
    try { removeRefWorktree(baseWorktree, runRoot); } catch { /* idem */ }
    cleanupRunRoot(runRoot);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  compareRefs({ baseRef: arg('base', '621c492^'), candidateRef: arg('candidate', '621c492') })
    .catch((error) => {
      if (error.code === 'DICO_QA_DOCKER_MISSING') {
        console.error('IMPLEMENTED / NOT EXECUTED — Docker prerequisite missing');
      } else {
        console.error(error.message);
      }
      process.exitCode = 1;
    });
}
