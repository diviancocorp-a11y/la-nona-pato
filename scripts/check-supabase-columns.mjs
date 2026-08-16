#!/usr/bin/env node
// scripts/check-supabase-columns.mjs
// Valida que las columnas referenciadas en .from('tabla').select(...) existan
// en el schema correspondiente. Soporta joins (table(*)) y select('*').
//
// DOS SCHEMAS, UN REPO
// --------------------
// El mismo codebase habla con dos bases distintas:
//   - LEGACY (supabase-schema.json): los 3 tenants gastro viejos, un proyecto
//     Supabase por cliente. recipes, ingredients, settings, admin_users...
//   - EDIFICIO (platform-schema.json): la plataforma multi-tenant, una sola
//     base con RLS por tenant_id. products, tenants, tenant_members...
//
// Varias tablas existen en las DOS con columnas diferentes (orders,
// order_items, coupons, profiles). Validar todo contra el legacy —como hacia
// la version anterior— hacia fallar consultas correctas al edificio por un
// motivo que no tiene nada que ver con el error real, y obligaba a escribir la
// consulta en funcion del schema equivocado.
//
// Que archivo se valida contra cual lo decide PLATFORM_PATHS. Si agregas un
// archivo que le habla al edificio, sumalo ahi.
//
// Skip por archivo: // @skip-columns-check
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

/* ── Rutas que le hablan al EDIFICIO. Todo lo demas se valida contra el
      legacy. Prefijos: terminar en "/" marca un directorio entero. ── */
const PLATFORM_PATHS = [
  'src/services/platformAdmin.js',
  'src/services/platformSettings.js',
  'src/services/platformInventory.js',
  'src/services/platformRecipes.js',
  'src/hooks/usePlatformTenant.js',
  'src/pages/PlatformAdmin.jsx',
  'src/components/admin/platform/',
];

function loadSchema(file, label) {
  try {
    return JSON.parse(readFileSync(new URL(file, import.meta.url), 'utf-8')).tables;
  } catch {
    console.warn(`⚠ scripts/${file} no disponible — no se valida ${label}`);
    return null;
  }
}

const LEGACY = loadSchema('./supabase-schema.json', 'legacy');
const PLATFORM = loadSchema('./platform-schema.json', 'edificio');

if (!LEGACY && !PLATFORM) process.exit(0);

const norm = (p) => p.replace(/\\/g, '/');

function schemaFor(file) {
  const f = norm(file);
  const isPlatform = PLATFORM_PATHS.some(p =>
    p.endsWith('/') ? f.includes(p) : f.endsWith(p)
  );
  return isPlatform
    ? { tables: PLATFORM, label: 'edificio', snapshot: 'scripts/platform-schema.json' }
    : { tables: LEGACY, label: 'legacy', snapshot: 'scripts/supabase-schema.json' };
}

// Tablas que existen en un solo schema. Sirven para detectar un archivo mal
// clasificado: si un archivo "legacy" consulta `products`, casi seguro le esta
// hablando al edificio y falta en PLATFORM_PATHS.
function exclusivas(a, b) {
  if (!a || !b) return new Set();
  return new Set(Object.keys(a).filter(t => !(t in b)));
}
const SOLO_PLATFORM = exclusivas(PLATFORM, LEGACY);
const SOLO_LEGACY = exclusivas(LEGACY, PLATFORM);

const args = process.argv.slice(2);
let files = [];
if (args[0] === '--all') {
  const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'coverage']);
  function walk(dir) {
    for (const e of readdirSync(dir)) {
      if (SKIP.has(e)) continue;
      const p = join(dir, e);
      const s = statSync(p);
      if (s.isDirectory()) walk(p);
      else if (['.js', '.jsx', '.ts', '.tsx'].includes(extname(p))) files.push(p);
    }
  }
  walk('src');
} else {
  files = args.filter(f => existsSync(f) && ['.js', '.jsx', '.ts', '.tsx'].includes(extname(f)));
}
if (files.length === 0) process.exit(0);

// Regex: .from('tabla').select('cols') o .select(CONSTANTE)
//
// El identificador importa: la forma natural de una lista de 46 columnas es
// `const COLS = '...'` arriba y `.select(COLS)` abajo. Cuando el checker solo
// entendia literales, esos archivos se salteaban ENTEROS y el resultado era un
// "✓ columnas validan" que no habia validado nada. Un verde que miente es peor
// que un rojo: nadie va a buscar el problema donde el semaforo esta en verde.
const FROM_SELECT_RE = /\.from\(\s*['"]([a-z_][a-z0-9_]*)['"]\s*\)[^;{}]*?\.select\(\s*(?:['"]([^'"]+)['"]|([A-Za-z_$][\w$]*))\s*\)/gi;

// Constantes string a nivel de modulo, para resolver `.select(COLS)`.
// Solo literales simples: nada de concatenaciones ni template strings con
// interpolacion, que no se pueden resolver sin evaluar el archivo.
const CONST_STR_RE = /(?:^|\n)\s*(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(['"])([^'"\n]*)\2\s*;/g;

function constantesDe(src) {
  const map = new Map();
  CONST_STR_RE.lastIndex = 0;
  let m;
  while ((m = CONST_STR_RE.exec(src)) !== null) map.set(m[1], m[3]);
  return map;
}

function splitCols(str) {
  // Split por comas a nivel 0 (ignorando parentesis de joins).
  const cols = [];
  let depth = 0, buf = '';
  for (const ch of str) {
    if (ch === '(') { depth++; buf += ch; }
    else if (ch === ')') { depth--; buf += ch; }
    else if (ch === ',' && depth === 0) { cols.push(buf.trim()); buf = ''; }
    else buf += ch;
  }
  if (buf.trim()) cols.push(buf.trim());
  return cols;
}

let errors = 0;
const avisos = [];

for (const file of files) {
  const src = readFileSync(file, 'utf-8');
  if (/\/\/\s*@skip-columns-check/.test(src.slice(0, 300))) continue;

  const schema = schemaFor(file);
  if (!schema.tables) continue; // snapshot de ese lado no disponible

  const tableNames = new Set(Object.keys(schema.tables));
  const cruzadas = schema.label === 'legacy' ? SOLO_PLATFORM : SOLO_LEGACY;
  const constantes = constantesDe(src);

  let match;
  FROM_SELECT_RE.lastIndex = 0;
  while ((match = FROM_SELECT_RE.exec(src)) !== null) {
    const [, table, literal, ident] = match;
    // `.select(IDENT)` con una constante que no se puede resolver: no se opina.
    const selectStr = literal !== undefined ? literal : constantes.get(ident);
    if (selectStr === undefined) continue;
    const lineNum = src.slice(0, match.index).split('\n').length;

    // Tabla del OTRO schema: el archivo esta del lado equivocado.
    if (cruzadas.has(table)) {
      const otro = schema.label === 'legacy' ? 'edificio' : 'legacy';
      avisos.push(
        `⚠ ${file}:${lineNum} — consulta "${table}", que solo existe en el schema ${otro}, ` +
        `pero el archivo se valida contra ${schema.label}.\n` +
        `  Si le habla al ${otro}, agregalo a PLATFORM_PATHS en scripts/check-supabase-columns.mjs`
      );
      continue;
    }

    if (!schema.tables[table]) continue; // tabla desconocida por ambos: no opinamos
    const cleanSelect = selectStr.replace(/\s+/g, ' ').trim();
    if (cleanSelect === '*') continue;

    const tableCols = new Set(schema.tables[table]);
    for (const col of splitCols(cleanSelect)) {
      // Token raiz: lo que esta antes de "(" (joins) o ":" (aliases)
      const root = col.split(/[(:]/)[0].trim();
      if (!root || root === '*') continue;
      // Si es un nombre de tabla conocido -> es un join, valido
      if (tableNames.has(root)) continue;
      // Si tiene parentesis es join (incluso si la tabla no esta en snapshot)
      if (col.includes('(')) continue;
      if (!tableCols.has(root)) {
        console.error(
          `✗ ${file}:${lineNum} — columna "${root}" no existe en "${table}" (schema ${schema.label})`
        );
        errors++;
      }
    }
  }
}

for (const a of avisos) console.warn(a);

if (errors > 0) {
  console.error(`\n✖ ${errors} columna(s) no validan contra el schema`);
  console.error('  Si agregaste una columna nueva: aplica la migration + actualiza el snapshot');
  console.error('  que corresponda (scripts/supabase-schema.json o scripts/platform-schema.json).');
  process.exit(1);
}
console.log(`✓ ${files.length} archivo(s) — columnas validan`);
process.exit(0);
