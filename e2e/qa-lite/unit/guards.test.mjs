import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertLocalUrl, parseSupabaseStatus, redactSecrets, resolveSpawnInvocation,
} from '../../../platform/qa-lite/lib.mjs';
import { classifyRequest, fontFixturePath } from '../network-policy.mjs';

test('allowlist acepta solo localhost y 127.0.0.1', () => {
  assert.equal(assertLocalUrl('http://127.0.0.1:54321').hostname, '127.0.0.1');
  assert.equal(assertLocalUrl('http://localhost:4173').hostname, 'localhost');
  assert.throws(() => assertLocalUrl('https://example.supabase.co'), /no local/);
  assert.throws(() => assertLocalUrl('https://mala-miga.vercel.app'), /no local/);
});

test('status se parsea sin exponer keys y rechaza API remota', () => {
  const status = parseSupabaseStatus(JSON.stringify({
    API_URL: 'http://127.0.0.1:54321',
    ANON_KEY: 'anon-local',
    SERVICE_ROLE_KEY: 'service-local',
  }));
  assert.deepEqual(status, {
    apiUrl: 'http://127.0.0.1:54321', anonKey: 'anon-local', serviceRoleKey: 'service-local',
  });
  assert.throws(() => parseSupabaseStatus(JSON.stringify({
    API_URL: 'https://prod.supabase.co', ANON_KEY: 'a', SERVICE_ROLE_KEY: 's',
  })), /no local/);
});

test('redaccion elimina JWT, URLs Postgres y valores secretos', () => {
  const input = 'SERVICE_ROLE_KEY=eyJabc.def.ghi DB_URL=postgresql://postgres:pass@127.0.0.1:54322/postgres';
  const output = redactSecrets(input);
  assert.equal(output.includes('eyJabc'), false);
  assert.equal(output.includes('postgres:pass'), false);
});

test('Windows ejecuta .cmd mediante ComSpec y Unix conserva spawn directo', () => {
  const windows = resolveSpawnInvocation('npx.cmd', ['supabase', 'start'], {
    platform: 'win32',
    env: { ComSpec: 'C:\\Windows\\System32\\cmd.exe' },
  });
  assert.deepEqual(windows, {
    command: 'C:\\Windows\\System32\\cmd.exe',
    args: ['/d', '/c', 'npx.cmd', 'supabase', 'start'],
  });

  assert.deepEqual(
    resolveSpawnInvocation('npx', ['supabase', 'start'], { platform: 'linux', env: {} }),
    { command: 'npx', args: ['supabase', 'start'] },
  );
  assert.throws(
    () => resolveSpawnInvocation('npx.cmd', ['supabase', 'start & whoami'], {
      platform: 'win32', env: { ComSpec: 'cmd.exe' },
    }),
    /inseguro/,
  );

  assert.deepEqual(
    resolveSpawnInvocation('docker', ['version'], { platform: 'win32', env: {} }),
    { command: 'docker', args: ['version'] },
  );
});

test('fuentes externas conocidas son fulfilled-local y el resto se bloquea', () => {
  assert.equal(classifyRequest('https://fonts.googleapis.com/css2?family=Inter').action, 'font-css');
  assert.equal(classifyRequest('https://fonts.gstatic.com/qa-lite/inter-400-normal.woff2').action, 'font-binary');
  assert.equal(classifyRequest('http://127.0.0.1:54321/rest/v1/products').action, 'continue');
  assert.equal(classifyRequest('data:image/svg+xml;base64,PHN2Zz4=').action, 'continue');
  assert.equal(classifyRequest('https://www.google.com/a.png').action, 'block');
  assert.match(fontFixturePath(process.cwd(), 'inter-400-normal.woff2'), /@fontsource/);
});
