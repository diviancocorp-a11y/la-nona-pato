#!/usr/bin/env node
/**
 * Levanta el admin real y captura la secuencia de invocacion de Physical.
 * Reusa la misma infraestructura del gate: supabase local + build de un ref.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { bootstrapUser } from '../../platform/qa-lite/bootstrap-user.mjs';
import { FIXED_NOW, REPO_ROOT, runCaptured, startAndResetLocal } from '../../platform/qa-lite/lib.mjs';
import { createRunTemp, createRefWorktree, installAndBuild, removeRefWorktree, startPreview } from './build-ref.mjs';

const ref = process.argv.includes('--ref') ? process.argv[process.argv.indexOf('--ref') + 1] : 'HEAD';
const artifactDir = join(REPO_ROOT, '.qa-lite', 'artifacts', 'phase-b6r-native');
mkdirSync(artifactDir, { recursive: true });
const runRoot = createRunTemp();
let worktree; let preview;
try {
  const local = startAndResetLocal();
  const user = await bootstrapUser(local.status);
  worktree = createRefWorktree({ ref, label: 'secuencia', runRoot });
  const env = installAndBuild(worktree, local.status);
  preview = await startPreview(worktree, 4173, env);
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  // Sin archivo explicito: el `testMatch` del config con QA_SEQUENCE_ONLY ya
  // acota a los specs de evidencia. Pasarlo filtraba a uno solo y el de la
  // sidebar nunca corria — sin fallar, que es peor.
  runCaptured(npx, ['playwright', 'test', '--config', 'playwright.qa-lite.config.ts',
    '--max-failures=1'], {
    cwd: REPO_ROOT,
    label: 'Captura de la secuencia Physical',
    env: {
      NODE_ENV: 'test',
      QA_PHASE: 'secuencia',
      QA_SEQUENCE_ONLY: '1',
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
  console.log(`Capturas en: ${join(artifactDir, 'secuencia')}`);
} finally {
  if (preview?.child && preview.child.exitCode === null) preview.child.kill();
  try { removeRefWorktree(worktree, runRoot); } catch { /* limpieza manual */ }
}
