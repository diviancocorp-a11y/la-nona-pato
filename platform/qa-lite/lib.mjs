import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export const QA_ROOT = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(QA_ROOT, '..', '..');
export const SUPABASE_DIR = join(QA_ROOT, 'supabase');
export const GENERATED_MIGRATIONS = join(SUPABASE_DIR, 'migrations');
export const GENERATED_SEED = join(SUPABASE_DIR, 'seed.sql');
export const FIXED_NOW = '2026-08-20T15:30:00-03:00';
export const QA_TENANT_ID = '10000000-0000-4000-8000-000000000001';
export const QA_TENANT_SLUG = 'dico-qa-lite';

const SECRET_KEYS = /(?:SERVICE_ROLE_KEY|ANON_KEY|JWT_SECRET|DB_URL|PASSWORD|SECRET|TOKEN)/i;
const JWT = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
const POSTGRES_URL = /postgres(?:ql)?:\/\/[^\s"']+/gi;
const KEY_VALUE_SECRET = /((?:SERVICE_ROLE_KEY|ANON_KEY|JWT_SECRET|DB_URL|PASSWORD|SECRET|TOKEN)\s*[=:]\s*)[^\s"']+/gi;

export function redactSecrets(value) {
  return String(value ?? '')
    .replace(JWT, '[REDACTED]')
    .replace(POSTGRES_URL, '[REDACTED_DB_URL]')
    .replace(KEY_VALUE_SECRET, '$1[REDACTED]');
}

export function assertLocalUrl(value, label = 'URL') {
  let url;
  try { url = new URL(value); } catch { throw new Error(`${label} invalida`); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error(`${label} debe usar http(s)`);
  if (!['127.0.0.1', 'localhost'].includes(url.hostname)) {
    throw new Error(`${label} rechazo destino no local: ${url.hostname}`);
  }
  return url;
}

function commandForNpx() {
  return process.platform === 'win32' ? 'npx.cmd' : 'npx';
}

const WINDOWS_CMD_META = /[\r\n&|<>^%!]/;

function assertSafeWindowsCmdToken(value) {
  if (WINDOWS_CMD_META.test(String(value))) {
    throw new Error('Argumento inseguro rechazado para wrapper Windows .cmd');
  }
}

export function resolveSpawnInvocation(command, args, {
  platform = process.platform,
  env = process.env,
} = {}) {
  if (platform !== 'win32' || !command.toLowerCase().endsWith('.cmd')) {
    return { command, args };
  }

  assertSafeWindowsCmdToken(command);
  args.forEach(assertSafeWindowsCmdToken);
  const comspec = env.ComSpec || env.COMSPEC || 'cmd.exe';
  return {
    command: comspec,
    args: ['/d', '/c', command, ...args],
  };
}

export function runCaptured(command, args, options = {}) {
  const env = { ...process.env, ...options.env };
  const invocation = resolveSpawnInvocation(command, args, { env });
  const result = spawnSync(invocation.command, invocation.args, {
    cwd: options.cwd || REPO_ROOT,
    env,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 20 * 1024 * 1024,
  });
  const stdout = result.stdout || '';
  const stderr = result.stderr || '';
  if (result.error || result.status !== 0) {
    const detail = redactSecrets(`${result.error?.message || ''}\n${stderr}\n${stdout}`)
      .trim();
    throw new Error(`${options.label || 'Comando'} fallo${detail ? `:\n${detail}` : ''}`);
  }
  return { stdout, stderr, status: result.status };
}

export function runSupabase(args, options = {}) {
  return runCaptured(commandForNpx(), ['supabase', ...args, '--workdir', QA_ROOT], {
    ...options,
    label: options.label || 'Supabase local',
  });
}

function flattenStatus(input, out = {}) {
  if (!input || typeof input !== 'object') return out;
  for (const [key, value] of Object.entries(input)) {
    if (value && typeof value === 'object') flattenStatus(value, out);
    else out[key.toUpperCase().replace(/[. -]/g, '_')] = String(value ?? '');
  }
  return out;
}

export function parseSupabaseStatus(raw) {
  let parsed;
  try { parsed = JSON.parse(raw); } catch { throw new Error('supabase status no devolvio JSON valido'); }
  const flat = flattenStatus(parsed);
  const apiUrl = flat.API_URL || flat.APIURL || flat.URL;
  const anonKey = flat.ANON_KEY || flat.PUBLISHABLE_KEY;
  const serviceRoleKey = flat.SERVICE_ROLE_KEY || flat.SERVICE_KEY;
  if (!apiUrl || !anonKey || !serviceRoleKey) {
    throw new Error('supabase status no incluyo API_URL, ANON_KEY y SERVICE_ROLE_KEY');
  }
  assertLocalUrl(apiUrl, 'Supabase API URL');
  return { apiUrl, anonKey, serviceRoleKey };
}

export function getLocalStatus() {
  const { stdout } = runSupabase(['status', '-o', 'json'], { label: 'Lectura de estado Supabase' });
  return parseSupabaseStatus(stdout);
}

function assertGeneratedTarget(target) {
  const root = resolve(QA_ROOT) + sep;
  const resolved = resolve(target);
  if (!resolved.startsWith(root) || resolved !== resolve(GENERATED_MIGRATIONS)) {
    throw new Error('Destino de migraciones generado fuera de platform/qa-lite');
  }
}

export function prepareGeneratedMigrations() {
  const source = join(REPO_ROOT, 'platform', 'migrations');
  const files = readdirSync(source).filter((name) => name.endsWith('.sql')).sort();
  if (files.length < 50) throw new Error(`Migraciones incompletas: se encontraron ${files.length}`);
  assertGeneratedTarget(GENERATED_MIGRATIONS);
  if (existsSync(GENERATED_MIGRATIONS)) rmSync(GENERATED_MIGRATIONS, { recursive: true, force: true });
  mkdirSync(GENERATED_MIGRATIONS, { recursive: true });
  const manifest = [];
  for (const name of files) {
    const from = join(source, name);
    const to = join(GENERATED_MIGRATIONS, name);
    copyFileSync(from, to);
    manifest.push({
      file: name,
      sha256: createHash('sha256').update(readFileSync(to)).digest('hex'),
    });
  }
  copyFileSync(join(QA_ROOT, 'seed.sql'), GENERATED_SEED);
  return manifest;
}

export function assertDockerAvailable() {
  const command = 'docker';
  const args = ['version', '--format', '{{.Server.Version}}'];
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    env: process.env,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 20 * 1024 * 1024,
  });
  if (!result.error && result.status === 0) return;

  const stdout = redactSecrets(result.stdout || '').trim();
  const stderr = redactSecrets(result.stderr || '').trim();
  const detail = [
    'Docker prerequisite missing',
    `command: ${command}`,
    `args: ${JSON.stringify(args)}`,
    `status: ${result.status ?? 'null'}`,
    `signal: ${result.signal ?? 'null'}`,
    `error.code: ${result.error?.code ?? 'null'}`,
    `error.message: ${redactSecrets(result.error?.message || '') || '(vacio)'}`,
    `stderr: ${stderr || '(vacio)'}`,
    `stdout: ${stdout || '(vacio)'}`,
  ].join('\n');
  const error = new Error(detail);
  error.code = 'DICO_QA_DOCKER_MISSING';
  throw error;
}

export function startAndResetLocal() {
  assertDockerAvailable();
  const migrations = prepareGeneratedMigrations();
  runSupabase(['start'], { label: 'Inicio de Supabase local' });
  runSupabase(['db', 'reset', '--local'], { label: 'Reset de Supabase local' });
  const status = getLocalStatus();
  return { status, migrations };
}

export function relativeToRepo(path) {
  return relative(REPO_ROOT, path).replaceAll('\\', '/');
}

export function publicStatus(status) {
  const url = assertLocalUrl(status.apiUrl);
  return { hostname: url.hostname, port: url.port, protocol: url.protocol };
}

export function containsSecretKey(value) {
  return SECRET_KEYS.test(String(value));
}
