#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, rmdirSync } from 'node:fs';
import { basename, join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { bootstrapUser } from '../../platform/qa-lite/bootstrap-user.mjs';
import {
  FIXED_NOW, REPO_ROOT, runCaptured, startAndResetLocal,
} from '../../platform/qa-lite/lib.mjs';
import {
  createRunTemp, createRefWorktree, installAndBuild, removeRefWorktree, startPreview,
} from './build-ref.mjs';

function arg(name, fallback) {
  const exact = process.argv.find((value) => value.startsWith(`--${name}=`));
  if (exact) return exact.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function safeRunId() {
  return new Date().toISOString().replace(/[:.]/g, '-');
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

async function inventoryMotion(ref) {
  const artifactDir = join(REPO_ROOT, '.qa-lite', 'artifacts', `${safeRunId()}-motion-inventory`);
  mkdirSync(artifactDir, { recursive: true });
  const runRoot = createRunTemp();
  let worktree;
  let preview;

  try {
    const local = startAndResetLocal();
    const user = await bootstrapUser(local.status);
    worktree = createRefWorktree({ ref, label: 'inventory', runRoot });
    const env = installAndBuild(worktree, local.status);
    preview = await startPreview(worktree, 4173, env);
    const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    runCaptured(npx, ['playwright', 'test', '--config', 'playwright.qa-lite.config.ts', '--max-failures=1'], {
      cwd: REPO_ROOT,
      label: 'Playwright QA Lite motion inventory',
      env: {
        NODE_ENV: 'test',
        QA_MOTION_INVENTORY_ONLY: '1',
        QA_PHASE: 'inventory',
        QA_TARGET_URL: preview.url,
        QA_ARTIFACT_DIR: artifactDir,
        QA_SUPABASE_URL: local.status.apiUrl,
        QA_SUPABASE_ANON_KEY: local.status.anonKey,
        QA_SUPABASE_SERVICE_ROLE: local.status.serviceRoleKey,
        QA_ADMIN_EMAIL: user.email,
        QA_ADMIN_PASSWORD: user.password,
        QA_FIXED_NOW: FIXED_NOW,
        // Pasa el presupuesto de reloj si esta seteado. Ver playwright.qa-lite.config.ts.
        ...(process.env.QA_TEST_TIMEOUT_MS ? { QA_TEST_TIMEOUT_MS: process.env.QA_TEST_TIMEOUT_MS } : {}),
      },
    });
    console.log(`Motion inventory artifacts: ${artifactDir}`);
  } finally {
    await stopPreview(preview);
    try { removeRefWorktree(worktree, runRoot); } catch { /* limpieza manual si hiciera falta */ }
    cleanupRunRoot(runRoot);
  }
}

inventoryMotion(arg('ref', '621c492^')).catch((error) => {
  if (error.code === 'DICO_QA_DOCKER_MISSING') {
    console.error('IMPLEMENTED / NOT EXECUTED — Docker prerequisite missing');
  } else {
    console.error(error.message);
  }
  process.exitCode = 1;
});
