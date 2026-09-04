#!/usr/bin/env node
/**
 * Entorno de revision para el gate visual de Phase 4.
 *
 * POR QUE NO ES `capturar-phase4.mjs`
 * Aquel construye y sirve con `vite preview` para sacar fotos reproducibles.
 * Esto es lo contrario: un dev server con HMR, para que un cambio de CSS
 * aparezca en la pantalla sin rebuild ni recarga. El gate de Phase 4 es
 * humano y se hace mirando, asi que la vuelta tiene que ser de segundos.
 *
 *   node scripts/qa-lite/revision-phase4.mjs
 *
 * Requiere Supabase local arriba (`npm run qa:lite:setup`). Deja el servidor
 * en primer plano: Ctrl+C lo baja.
 *
 * Las credenciales del owner efimero se escriben en
 * `.qa-lite/revision-phase4.txt` —que esta gitignoreado— y NO se imprimen en
 * ningun log que pueda terminar pegado en un chat.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT, getLocalStatus, assertLocalUrl } from '../../platform/qa-lite/lib.mjs';
import { bootstrapUser } from '../../platform/qa-lite/bootstrap-user.mjs';

const arg = (nombre, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${nombre}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
};
const PUERTO = Number(arg('puerto', '5273'));

const status = getLocalStatus();
assertLocalUrl(status.apiUrl, 'Supabase API URL');

const user = await bootstrapUser(status);

const salida = join(REPO_ROOT, '.qa-lite', 'revision-phase4.txt');
mkdirSync(join(REPO_ROOT, '.qa-lite'), { recursive: true });
writeFileSync(salida, [
  'Entorno de revision — Phase 4 Golden Screen (Productos)',
  '',
  `URL     http://127.0.0.1:${PUERTO}/admin`,
  `Usuario ${user.email}`,
  `Clave   ${user.password}`,
  '',
  'Owner efimero de la base LOCAL de QA. Se regenera cada vez que corre',
  'este script y no existe fuera de esta maquina.',
  '',
].join('\n'), 'utf8');

console.log('');
console.log('  Golden Screen — Productos');
console.log(`  ${'─'.repeat(52)}`);
console.log(`  URL          http://127.0.0.1:${PUERTO}/admin`);
console.log(`  Credenciales ${salida.replace(REPO_ROOT, '.')}`);
console.log(`  ${'─'.repeat(52)}`);
console.log('  HMR activo: guardar un archivo repinta la pantalla sola.');
console.log('');

const vite = join(REPO_ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
const server = spawn(process.execPath, [
  vite, '--host', '127.0.0.1', '--port', String(PUERTO), '--strictPort',
], {
  cwd: REPO_ROOT,
  stdio: 'inherit',
  env: {
    ...process.env,
    // Esta maquina tiene NODE_ENV=production global y se come las devDeps.
    NODE_ENV: '',
    CLIENT: 'dico-qa-lite',
    VITE_SUPABASE_URL: status.apiUrl,
    VITE_SUPABASE_ANON_KEY: status.anonKey,
    VITE_SENTRY_DSN: '',
    VITE_ANALYTICS_ID: '',
    VITE_ANALYTICS_ENDPOINT: '',
    SENTRY_AUTH_TOKEN: '',
  },
});

const bajar = () => { server.kill(); process.exit(0); };
process.on('SIGINT', bajar);
process.on('SIGTERM', bajar);
server.once('exit', (c) => process.exit(c ?? 0));
