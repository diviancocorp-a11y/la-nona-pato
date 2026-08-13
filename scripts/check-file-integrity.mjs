#!/usr/bin/env node
// @skip-brace-check
// scripts/check-file-integrity.mjs
// Valida que los archivos pasados como argumentos NO esten:
//  1. Truncados (deben terminar con '\n')
//  2. Corruptos con NULL bytes
//  3. Truncados al medio (ultima linea cortada en expresion)
//  4. Balance roto de llaves/parens/brackets
//  5. JSX en .js
//  6. type=number + Number(e.target.value)
//  7. JSON malformado
//  8. Sintaxis JS en .mjs/.cjs

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { extname } from 'node:path';
import { execSync } from 'node:child_process';

const args = process.argv.slice(2);
const fixMode = args[0] === '--fix';
const files = fixMode ? args.slice(1) : args;
if (files.length === 0) process.exit(0);

let errors = 0;
let fixed = 0;

for (const file of files) {
  if (!existsSync(file)) continue;
  let buf;
  try { buf = readFileSync(file); }
  catch (e) { console.error(`X ${file}: no se puede leer (${e.message})`); errors++; continue; }

  if (buf.includes(0x00)) {
    console.error(`X ${file}: contiene NULL bytes (archivo corrupto)`);
    errors++; continue;
  }

  if (buf.length > 0) {
    const endsWithSingleNewline = buf[buf.length - 1] === 0x0a && (buf.length === 1 || buf[buf.length - 2] !== 0x0a);
    if (!endsWithSingleNewline) {
      if (fixMode) {
        let end = buf.length;
        while (end > 0 && (buf[end - 1] === 0x0a || buf[end - 1] === 0x0d || buf[end - 1] === 0x20 || buf[end - 1] === 0x09)) end--;
        const cleaned = Buffer.concat([buf.subarray(0, end), Buffer.from('\n')]);
        writeFileSync(file, cleaned);
        console.log(`r ${file}: fixed EOF`);
        fixed++;
        buf = readFileSync(file);
      } else {
        console.error(`X ${file}: EOF mal (sin newline o con blank line extra)`);
        errors++; continue;
      }
    }
  }

  const ext = extname(file).toLowerCase();

  if (['.jsx', '.js', '.ts', '.tsx', '.mjs', '.cjs'].includes(ext)) {
    const src = buf.toString('utf-8');
    const lines = src.split(/\r?\n/);
    let i = lines.length - 1;
    while (i >= 0 && lines[i].trim() === '') i--;
    const lastLine = (lines[i] || '').trim();
    const noComment = lastLine.replace(/\/\/.*$/, '');
    const truncated =
      /[+\-*/&|=<>?,]$/.test(noComment) ||
      /=\s*\{?\s*$/.test(noComment) ||
      /\b(const|let|var|return|import|export)\s*$/.test(noComment) ||
      (/[(\[{]\s*$/.test(noComment) && !lastLine.startsWith('//'));
    const singleQ = (noComment.match(/'/g) || []).length;
    const doubleQ = (noComment.match(/"/g) || []).length;
    const backtickQ = (noComment.match(/`/g) || []).length;
    const unbalanced = (singleQ % 2) + (doubleQ % 2) + (backtickQ % 2) > 0;
    if (truncated || unbalanced) {
      console.error(`X ${file}: posible truncamiento - ultima linea: "${lastLine.slice(0, 80)}${lastLine.length > 80 ? '...' : ''}"`);
      errors++; continue;
    }

  }

  if (ext === '.js') {
    const src = buf.toString('utf-8');
    if (/^\s*\/\/\s*@no-jsx-check/m.test(src.slice(0, 200))) continue;
    // El `//` de un protocolo (http://, https://) NO abre un comentario. Sin
    // ese guard, una URL dentro de un template literal se comia el resto de
    // la linea —backtick de cierre incluido—, el despojado quedaba
    // desbalanceado y cualquier SVG en string daba falso positivo de JSX.
    // Se despoja en este orden a proposito: hay 8 archivos con backticks
    // dentro de comentarios `//` y solo 2 con URLs dentro de backticks, asi
    // que sacar los backticks primero romperia mas de lo que arregla.
    const stripped = src
      .replace(/(^|[^:])\/\/.*$/gm, '$1')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/`[\s\S]*?`/g, '');
    const jsxPatterns = [
      /<[A-Z][A-Za-z0-9]*[\s/>]/,
      /<(div|span|button|input|img|a|p|h[1-6]|ul|li|form|section|article|nav|header|footer|main|aside|label|select|textarea|table|tr|td|th|tbody|thead|svg|path|g|rect|circle|line|polyline|polygon)[\s/>]/,
      /<\/[A-Za-z]/,
    ];
    if (jsxPatterns.some((re) => re.test(stripped))) {
      console.error(`X ${file}: JSX en .js - renombrar a .jsx`);
      errors++; continue;
    }
  }

  if (ext === '.jsx' || ext === '.tsx') {
    const src = buf.toString('utf-8');
    if (!/^\s*\/\/\s*@allow-bad-number-input/m.test(src.slice(0, 200))) {
      if (/type=["']number["']/.test(src) && /Number\(e\.target\.value\)/.test(src)) {
        console.error(`X ${file}: type="number" con Number(e.target.value) - usa DecimalInput`);
        errors++; continue;
      }
    }
  }

  if (ext === '.json') {
    try { JSON.parse(buf.toString('utf-8')); }
    catch (e) { console.error(`X ${file}: JSON invalido - ${e.message}`); errors++; }
    continue;
  }

  if (ext === '.mjs' || ext === '.cjs') {
    try { execSync(`node --check "${file}"`, { stdio: 'pipe' }); }
    catch (e) {
      const msg = (e.stderr?.toString() || e.message).split('\n').slice(0, 4).join('\n');
      console.error(`X ${file}: sintaxis JS\n${msg}`);
      errors++;
    }
    continue;
  }
}

if (errors > 0) {
  console.error(`\nX ${errors} archivo(s) con problemas`);
  process.exit(1);
}
if (fixed > 0) {
  console.log(`\nr ${fixed} archivo(s) auto-arreglado(s)`);
  if (fixMode) {
    const list = files.slice(0, fixed).join(' ');
    try { execSync(`git add ${list}`, { stdio: 'pipe' }); } catch { /* ignore */ }
  }
} else {
  console.log(`OK ${files.length} archivo(s) sin problemas`);
}
process.exit(0);
