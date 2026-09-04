#!/usr/bin/env node
/**
 * Captura de evidencia para Phase 4 — Golden Screen (Productos).
 *
 * POR QUE NO ES `qa:lite:compare`
 * Ese comando compara DOS refs de git y hace `npm ci` en una worktree por
 * cada uno: es el gate de no-regresion y tarda ~15 min. Phase 4 necesita otra
 * cosa —fotografiar el arbol de trabajo actual, antes y despues de tocarlo,
 * en las mismas superficies— y para eso alcanza con construir una vez y
 * servir. No toca `node_modules` ni crea worktrees.
 *
 *   node scripts/qa-lite/capturar-phase4.mjs --lote=antes
 *   node scripts/qa-lite/capturar-phase4.mjs --lote=despues
 *
 * Requiere `npm run qa:lite:setup` corrido (Supabase local arriba). Las keys
 * locales se leen del CLI de Supabase y se pasan por env al hijo: no se
 * imprimen ni se escriben en ningun artifact.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT, FIXED_NOW, getLocalStatus, assertLocalUrl, runCaptured } from '../../platform/qa-lite/lib.mjs';
import { bootstrapUser } from '../../platform/qa-lite/bootstrap-user.mjs';

const arg = (nombre, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${nombre}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
};

const LOTE = arg('lote', 'antes');
// Cualquier nombre sirve mientras diga de que lado esta: los pases sucesivos
// usan `pass1-antes` / `pass1-despues`. Lo unico que el spec necesita saber es
// si tiene que EXIGIR los contratos o solo documentar el estado.
if (!/(^|-)(antes|despues)$/.test(LOTE)) {
  throw new Error(`--lote tiene que terminar en "antes" o "despues" (recibido: ${LOTE})`);
}
const PUERTO = Number(arg('puerto', '4319'));
/* Con `--spec` el runner sirve de banco de pruebas para CUALQUIER spec del
   harness contra el arbol de trabajo: es lo que permite re-correr los gates de
   las fases que un lote toca (A3, phase9-visual) sin pagar un compare de dos
   refs. Por defecto corre el de Phase 4. */
const SPEC = arg('spec', 'phase4-golden.spec.ts');

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

const status = getLocalStatus();
assertLocalUrl(status.apiUrl, 'Supabase API URL');

// Owner Auth efimero. Es el mismo helper que usa el compare: sin una fila en
// `tenant_members` no hay panel que fotografiar.
const user = await bootstrapUser(status);

/* ── 1. Build del arbol de trabajo ──────────────────────────────────── */

// NODE_ENV vacio a proposito: en esta maquina esta seteada a `production`
// globalmente y se come las devDependencies (ver CLAUDE.md).
const env = {
  ...process.env,
  NODE_ENV: '',
  CLIENT: 'dico-qa-lite',
  VITE_SUPABASE_URL: status.apiUrl,
  VITE_SUPABASE_ANON_KEY: status.anonKey,
  VITE_SENTRY_DSN: '',
  VITE_ANALYTICS_ID: '',
  VITE_ANALYTICS_ENDPOINT: '',
  SENTRY_AUTH_TOKEN: '',
};

console.log(`[phase4] build del arbol de trabajo (lote: ${LOTE})...`);
runCaptured(npx, ['vite', 'build'], { cwd: REPO_ROOT, env, label: 'Build Phase 4' });
if (!existsSync(join(REPO_ROOT, 'dist', 'index.html'))) {
  throw new Error('El build no produjo dist/index.html');
}

/* ── 2. Preview ─────────────────────────────────────────────────────── */

const vite = join(REPO_ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
const preview = spawn(
  process.execPath,
  [vite, 'preview', '--host', '127.0.0.1', '--port', String(PUERTO), '--strictPort'],
  { cwd: REPO_ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] },
);

const url = `http://127.0.0.1:${PUERTO}`;
await new Promise((resolve, reject) => {
  const limite = setTimeout(() => reject(new Error('El preview no levanto en 60s')), 60_000);
  const mirar = (buf) => {
    if (buf.toString().includes(String(PUERTO))) { clearTimeout(limite); resolve(); }
  };
  preview.stdout.on('data', mirar);
  preview.stderr.on('data', mirar);
  preview.once('error', (e) => { clearTimeout(limite); reject(e); });
});
console.log(`[phase4] preview en ${url}`);

/* ── 3. El spec ─────────────────────────────────────────────────────── */

let codigo = 1;
try {
  codigo = await new Promise((resolve) => {
    const hijo = spawn(npx, ['playwright', 'test', '--config=playwright.qa-lite.config.ts'], {
      cwd: REPO_ROOT,
      stdio: 'inherit',
      // Windows no puede spawnear un .cmd sin shell: da EINVAL.
      shell: process.platform === 'win32',
      env: {
        ...env,
        QA_TARGET_URL: url,
        // El reloj congelado del harness: sin el, dos corridas del mismo lote
        // difieren en todo lo que muestre una hora.
        QA_FIXED_NOW: FIXED_NOW,
        QA_SPEC: SPEC,
        QA_PHASE4_LOTE: LOTE,
        // Varios specs del harness escriben diagnosticos y los exigen.
        QA_ARTIFACT_DIR: join(REPO_ROOT, '.qa-lite', 'artifacts'),
        QA_PHASE: LOTE,
        QA_SUPABASE_URL: status.apiUrl,
        QA_SUPABASE_SERVICE_ROLE: status.serviceRoleKey,
        QA_SUPABASE_ANON_KEY: status.anonKey,
        QA_ADMIN_EMAIL: user.email,
        QA_ADMIN_PASSWORD: user.password,
      },
    });
    hijo.once('exit', (c) => resolve(c ?? 1));
  });
} finally {
  preview.kill();
}

console.log(`[phase4] lote "${LOTE}" -> .qa-lite/artifacts/phase4-golden/${LOTE}/`);
process.exit(codigo);
