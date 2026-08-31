import { cpSync, existsSync, mkdtempSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { REPO_ROOT, runCaptured } from '../../platform/qa-lite/lib.mjs';

const QA_CLIENT = join(REPO_ROOT, 'clients', 'dico-qa-lite');
const QA_PUBLIC = join(REPO_ROOT, 'public', 'clients', 'dico-qa-lite');

export function createRunTemp() {
  return mkdtempSync(join(tmpdir(), 'dico-qa-lite-'));
}

function assertTempPath(path, runRoot) {
  const root = resolve(runRoot) + sep;
  if (!resolve(path).startsWith(root)) throw new Error(`Worktree fuera del temporal QA: ${path}`);
}

export function resolveCommit(ref) {
  return runCaptured('git', ['rev-parse', '--verify', `${ref}^{commit}`], {
    cwd: REPO_ROOT,
    label: `Resolucion de ref ${ref}`,
  }).stdout.trim();
}

export function createRefWorktree({ ref, label, runRoot }) {
  const sha = resolveCommit(ref);
  const path = join(runRoot, label);
  assertTempPath(path, runRoot);
  runCaptured('git', ['worktree', 'add', '--detach', path, sha], {
    cwd: REPO_ROOT,
    label: `Worktree temporal ${label}`,
  });

  cpSync(QA_CLIENT, join(path, 'clients', 'dico-qa-lite'), { recursive: true });
  cpSync(QA_PUBLIC, join(path, 'public', 'clients', 'dico-qa-lite'), { recursive: true });
  return { path, sha };
}

export function installAndBuild(worktree, status) {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const env = {
    NODE_ENV: '',
    CLIENT: 'dico-qa-lite',
    VITE_SUPABASE_URL: status.apiUrl,
    VITE_SUPABASE_ANON_KEY: status.anonKey,
    VITE_SENTRY_DSN: '',
    VITE_ANALYTICS_ID: '',
    VITE_ANALYTICS_ENDPOINT: '',
    SENTRY_AUTH_TOKEN: '',
    VERCEL_GIT_COMMIT_SHA: worktree.sha,
  };
  runCaptured(npm, ['ci', '--include=dev'], {
    cwd: worktree.path,
    env,
    label: `npm ci ${worktree.sha.slice(0, 8)}`,
  });
  runCaptured(npx, ['vite', 'build'], {
    cwd: worktree.path,
    env,
    label: `Build ${worktree.sha.slice(0, 8)}`,
  });
  if (!existsSync(join(worktree.path, 'dist', 'index.html'))) throw new Error('Build QA no produjo dist/index.html');
  return env;
}

export async function startPreview(worktree, port, env) {
  const vite = join(worktree.path, 'node_modules', 'vite', 'bin', 'vite.js');
  const child = spawn(process.execPath, [vite, 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: worktree.path,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output = (output + chunk).slice(-8000); });
  child.stderr.on('data', (chunk) => { output = (output + chunk).slice(-8000); });
  const url = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Preview ${port} termino antes de iniciar`);
    try {
      const response = await fetch(url, { redirect: 'manual' });
      if (response.ok || response.status === 304) return { child, url };
    } catch { /* servidor todavia iniciando */ }
    await new Promise((resolveWait) => setTimeout(resolveWait, 150));
  }
  child.kill();
  throw new Error(`Preview ${port} no respondio. ${output.split(/\r?\n/).slice(-4).join(' ')}`);
}

export function removeRefWorktree(worktree, runRoot) {
  if (!worktree?.path) return;
  assertTempPath(worktree.path, runRoot);
  runCaptured('git', ['worktree', 'remove', '--force', worktree.path], {
    cwd: REPO_ROOT,
    label: 'Limpieza de worktree temporal',
  });
}
