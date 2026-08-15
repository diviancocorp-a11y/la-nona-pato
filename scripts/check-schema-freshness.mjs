#!/usr/bin/env node
// scripts/check-schema-freshness.mjs
// Avisa cuando el snapshot de columnas del edificio quedo atras de las
// migraciones.
//
// Por que existe: `schema-sync.mjs --check` compara contra la base de verdad,
// pero necesita la service role, asi que no puede correr en un pre-commit —
// no todos la tienen exportada y no deberia hacer falta para commitear. Este
// chequeo es offline y compara dos cosas que YA estan en el repo: hasta que
// migracion dice estar al dia el snapshot, y cual es la ultima que existe.
//
// No detecta que columnas cambiaron. Detecta que alguien aplico una migracion
// nueva y no volvio a mirar el snapshot, que es exactamente como un snapshot
// se pudre: no falla, solo deja de proteger.
//
// Se arregla de una de dos formas, y las dos son legitimas:
//   - la migracion toca columnas -> npm run schema:sync
//   - no las toca (una policy, un index, una funcion) -> subir a mano
//     _migrations_through en scripts/platform-schema.json

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const SNAPSHOT = join(HERE, 'platform-schema.json');
const MIGRATIONS = join(ROOT, 'platform', 'migrations');

if (!existsSync(SNAPSHOT) || !existsSync(MIGRATIONS)) process.exit(0);

let snap;
try {
  snap = JSON.parse(readFileSync(SNAPSHOT, 'utf-8'));
} catch (e) {
  console.error(`✗ scripts/platform-schema.json no es JSON valido — ${e.message}`);
  process.exit(1);
}

const through = snap._migrations_through;
if (!through) {
  console.warn('⚠ platform-schema.json no declara _migrations_through — no se puede chequear frescura');
  process.exit(0);
}

const nums = readdirSync(MIGRATIONS)
  .map(f => (f.match(/^(\d{4})_.*\.sql$/) || [])[1])
  .filter(Boolean)
  .sort();

if (nums.length === 0) process.exit(0);

const ultima = nums[nums.length - 1];
const nuevas = nums.filter(n => n > through);

if (nuevas.length === 0) {
  console.log(`✓ snapshot del edificio al dia con las migraciones (hasta ${through})`);
  process.exit(0);
}

console.error(`✗ el snapshot del edificio dice estar al dia hasta la ${through}, pero ya existe la ${ultima}`);
console.error(`  sin revisar: ${nuevas.join(', ')}`);
console.error('');
console.error('  Si esas migraciones agregan o sacan columnas:');
console.error('    npm run schema:sync');
console.error('  Si no tocan columnas (policies, indexes, funciones):');
console.error(`    subi "_migrations_through" a "${ultima}" en scripts/platform-schema.json`);
process.exit(1);
