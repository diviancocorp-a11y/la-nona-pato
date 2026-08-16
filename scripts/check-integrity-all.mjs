#!/usr/bin/env node
// scripts/check-integrity-all.mjs
// ─────────────────────────────────────────────────────────
// Recorre src/ y pasa todos los archivos relevantes a
// check-file-integrity.mjs. Útil para escanear el repo
// ad-hoc sin depender de que estén staged.
//
// Uso:
//   npm run check:integrity
// ─────────────────────────────────────────────────────────
import { readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { spawnSync } from 'node:child_process';

// Cuantos archivos por invocacion. Antes se armaba UN comando con todos los
// paths concatenados y se pasaba por el shell: al pasar los ~225 archivos en
// src/, Windows corto con "La linea de comandos es demasiado larga" (limite de
// 8191 caracteres de cmd.exe) y el pre-commit dejo de dejar commitear. Con
// lotes el limite deja de importar, crezca lo que crezca el repo.
const LOTE = 80;

const OK_EXT = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.json']);
const SKIP = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage']);

const files = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) walk(p);
    else if (OK_EXT.has(extname(p))) files.push(p);
  }
}

walk('src');

if (files.length === 0) {
  console.log('(no hay archivos para chequear)');
  process.exit(0);
}

console.log(`→ Chequeando integridad de ${files.length} archivo(s) en src/...`);

// spawnSync con array de argumentos y sin shell: los paths no se re-parsean,
// asi que tampoco hacen falta comillas ni escapes.
let fallo = false;
for (let i = 0; i < files.length; i += LOTE) {
  const lote = files.slice(i, i + LOTE);
  const r = spawnSync(process.execPath, ['scripts/check-file-integrity.mjs', ...lote], {
    stdio: 'inherit',
  });
  if (r.error) {
    console.error(`✗ no se pudo ejecutar check-file-integrity: ${r.error.message}`);
    process.exit(1);
  }
  if (r.status !== 0) fallo = true;  // seguir: conviene ver TODOS los problemas
}

process.exit(fallo ? 1 : 0);
