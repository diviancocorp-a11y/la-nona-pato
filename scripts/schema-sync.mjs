#!/usr/bin/env node
// scripts/schema-sync.mjs
// Regenera los snapshots de columnas que usa check-supabase-columns.mjs,
// leyendolos de la base en vez de copiarlos a mano del dashboard.
//
// Hasta ahora `npm run schema:sync` era un comando que la documentacion
// mencionaba y que no existia: los dos JSON se mantenian a mano, y un snapshot
// viejo no falla — simplemente deja de proteger, en silencio.
//
// Uso:
//   npm run schema:sync                  # regenera lo que tenga credenciales
//   npm run schema:sync -- --check       # no escribe: falla si el disco difiere
//   npm run schema:sync -- --target=platform
//
// Credenciales (NUNCA commitear la service role — van en el shell o en un
// .env.local que este en .gitignore):
//   PLATFORM_SUPABASE_URL / PLATFORM_SUPABASE_SERVICE_ROLE_KEY
//   LEGACY_SUPABASE_URL   / LEGACY_SUPABASE_SERVICE_ROLE_KEY
// Si solo vas a tocar uno, alcanza con SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
// mas --target.
//
// Requiere que la base tenga public.schema_snapshot() — en el edificio la crea
// platform/migrations/0023_schema_snapshot_rpc.sql. Los 3 proyectos legacy
// estan PAUSADOS: para sincronizar ese lado hay que restaurar uno primero
// (tarda minutos) y aplicarle esa misma funcion.

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { cargarEnvDeArchivo } from '../platform/scripts/_env.mjs';

// Las credenciales tambien salen de .env.scripts (fuera de git), igual que en
// los scripts de platform/. Antes este script solo miraba el entorno: con el
// archivo ya creado igual respondia "sin credenciales — salteado", que se lee
// como "no hace falta" y deja el snapshot viejo sin que nadie se entere.
cargarEnvDeArchivo();

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

const TARGETS = {
  platform: {
    file: join(HERE, 'platform-schema.json'),
    envPrefix: 'PLATFORM_',
    migrations: join(ROOT, 'platform', 'migrations'),
  },
  legacy: {
    file: join(HERE, 'supabase-schema.json'),
    envPrefix: 'LEGACY_',
    migrations: null, // nomenclatura por fecha, no correlativa: no se versiona aca
  },
};

const args = process.argv.slice(2);
const CHECK = args.includes('--check');
const targetArg = (args.find(a => a.startsWith('--target=')) || '').split('=')[1] || 'all';

function creds({ envPrefix }) {
  const url = process.env[`${envPrefix}SUPABASE_URL`] || process.env.SUPABASE_URL;
  const key = process.env[`${envPrefix}SUPABASE_SERVICE_ROLE_KEY`] || process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url: url.replace(/\/+$/, ''), key } : null;
}

async function pullSchema({ url, key }) {
  const res = await fetch(`${url}/rest/v1/rpc/schema_snapshot`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    if (res.status === 404) {
      throw new Error(
        'la base no tiene public.schema_snapshot(). Aplicale la migracion ' +
        'platform/migrations/0023_schema_snapshot_rpc.sql'
      );
    }
    throw new Error(`HTTP ${res.status} — ${body.slice(0, 200)}`);
  }
  const tables = await res.json();
  if (!tables || typeof tables !== 'object' || Array.isArray(tables)) {
    throw new Error('respuesta inesperada de schema_snapshot()');
  }
  return tables;
}

/** Ultima migracion correlativa presente en disco (para el guard de frescura). */
function lastMigration(dir) {
  if (!dir || !existsSync(dir)) return null;
  const nums = readdirSync(dir)
    .map(f => (f.match(/^(\d{4})_/) || [])[1])
    .filter(Boolean)
    .sort();
  return nums.length ? nums[nums.length - 1] : null;
}

/** Orden estable: si el contenido no cambio, el archivo no cambia. */
function serialize(prev, tables, migThrough) {
  const out = {
    _comment: prev?._comment || 'Snapshot de columnas para validar .select(). Regenerar con: npm run schema:sync',
    _refreshed_at: new Date().toISOString().slice(0, 10),
    ...(migThrough ? { _migrations_through: migThrough } : {}),
    tables: Object.fromEntries(Object.keys(tables).sort().map(t => [t, tables[t]])),
  };
  return JSON.stringify(out, null, 2) + '\n';
}

/** Compara solo lo que importa: las columnas. La fecha cambia siempre. */
function diffTables(a = {}, b = {}) {
  const problems = [];
  for (const t of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const izq = a[t], der = b[t];
    if (!izq) { problems.push(`+ tabla "${t}" esta en la base y no en el snapshot`); continue; }
    if (!der) { problems.push(`- tabla "${t}" esta en el snapshot y no en la base`); continue; }
    const faltan = der.filter(c => !izq.includes(c));
    const sobran = izq.filter(c => !der.includes(c));
    if (faltan.length) problems.push(`  "${t}": faltan en el snapshot -> ${faltan.join(', ')}`);
    if (sobran.length) problems.push(`  "${t}": ya no existen en la base -> ${sobran.join(', ')}`);
  }
  return problems;
}

let fallo = false;
let hechos = 0;

for (const [name, cfg] of Object.entries(TARGETS)) {
  if (targetArg !== 'all' && targetArg !== name) continue;

  const c = creds(cfg);
  if (!c) {
    console.log(`· ${name}: sin credenciales (${cfg.envPrefix}SUPABASE_URL / ..._SERVICE_ROLE_KEY) — salteado`);
    continue;
  }

  let tables;
  try {
    tables = await pullSchema(c);
  } catch (e) {
    console.error(`✗ ${name}: ${e.message}`);
    fallo = true;
    continue;
  }

  const prev = existsSync(cfg.file) ? JSON.parse(readFileSync(cfg.file, 'utf-8')) : null;
  const problems = diffTables(prev?.tables, tables);

  if (CHECK) {
    if (problems.length) {
      console.error(`✗ ${name}: el snapshot no coincide con la base`);
      problems.forEach(p => console.error(`  ${p}`));
      fallo = true;
    } else {
      console.log(`✓ ${name}: snapshot al dia (${Object.keys(tables).length} tablas)`);
    }
    hechos++;
    continue;
  }

  writeFileSync(cfg.file, serialize(prev, tables, lastMigration(cfg.migrations)), 'utf-8');
  if (problems.length) {
    console.log(`✓ ${name}: actualizado (${Object.keys(tables).length} tablas)`);
    problems.forEach(p => console.log(`  ${p}`));
  } else {
    console.log(`✓ ${name}: ya estaba al dia (${Object.keys(tables).length} tablas)`);
  }
  hechos++;
}

if (hechos === 0 && !fallo) {
  console.log('\nNada que hacer: ningun target tenia credenciales.');
  console.log('Exportá PLATFORM_SUPABASE_URL y PLATFORM_SUPABASE_SERVICE_ROLE_KEY (dashboard > Project Settings > API).');
}

process.exit(fallo ? 1 : 0);
