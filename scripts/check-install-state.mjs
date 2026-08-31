#!/usr/bin/env node
// scripts/check-install-state.mjs  ·  npm run check:install-state
//
// Que `node_modules` sea de verdad lo que dice el lockfile.
//
// ── EL CASO QUE LO ORIGINA (30/ago/2026) ──
// En el worktree principal convivian TRES versiones distintas del mismo
// paquete sin que nada avisara:
//
//   package-lock.json  react-router-dom 7.18.3
//   node_modules       react-router-dom 7.18.2
//   node_modules       react-router     7.15.1
//
// Los tests corrian contra ese arbol. Pasaban. No probaban nada de lo que se
// iba a publicar. Es el mismo patron que el buildId inventado: el sistema
// funciona y no sirve.
//
// El check es general —recorre TODO el lockfile, no una lista de paquetes— y
// lee metadata real de los tres lados. No mockea la salida de npm.
//
// Opcionales por plataforma: un paquete con `optional: true` en el lockfile o
// cuyo `os`/`cpu` no matchea esta maquina puede faltar legitimamente. Esos se
// informan aparte y no rompen el check; un `npm ci` limpio en Windows deja
// decenas de esos y hacerlos fallar volveria el gate inservible.

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function leerJson(p) {
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}

/**
 * Compara package.json + package-lock.json + node_modules.
 * @returns {{ ok: boolean, problemas: Array, opcionalesAusentes: string[], revisados: number }}
 */
export function checkInstallState({ cwd = REPO } = {}) {
  const problemas = [];
  const opcionalesAusentes = [];

  const pkg = leerJson(join(cwd, 'package.json'));
  const lock = leerJson(join(cwd, 'package-lock.json'));

  if (!pkg) return { ok: false, problemas: [{ tipo: 'sin-package-json', detalle: 'package.json ilegible o ausente' }], opcionalesAusentes, revisados: 0 };
  if (!lock) return { ok: false, problemas: [{ tipo: 'sin-lockfile', detalle: 'package-lock.json ilegible o ausente' }], opcionalesAusentes, revisados: 0 };

  const packages = lock.packages;
  if (!packages || typeof packages !== 'object') {
    problemas.push({ tipo: 'lockfile-invalido', detalle: 'package-lock.json no tiene la seccion "packages" (lockfileVersion < 2)' });
    return { ok: false, problemas, opcionalesAusentes, revisados: 0 };
  }

  // 1. package.json vs el nodo raiz del lockfile: los rangos declarados tienen
  //    que ser los mismos. Aca se detecta "edite package.json y no regenere".
  const raiz = packages[''] || {};
  for (const campo of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    const declarado = pkg[campo] || {};
    const enLock = raiz[campo] || {};
    for (const [nombre, rango] of Object.entries(declarado)) {
      if (!(nombre in enLock)) {
        problemas.push({ tipo: 'lockfile-desalineado', paquete: nombre, detalle: `${campo}.${nombre} esta en package.json y no en el lockfile` });
      } else if (enLock[nombre] !== rango) {
        problemas.push({ tipo: 'lockfile-desalineado', paquete: nombre, detalle: `${campo}.${nombre}: package.json pide ${rango}, el lockfile registro ${enLock[nombre]}` });
      }
    }
    for (const nombre of Object.keys(enLock)) {
      if (!(nombre in declarado)) {
        problemas.push({ tipo: 'lockfile-desalineado', paquete: nombre, detalle: `${campo}.${nombre} esta en el lockfile y no en package.json` });
      }
    }
  }

  // 2. Cada entrada del lockfile contra lo instalado.
  let revisados = 0;
  for (const [ruta, meta] of Object.entries(packages)) {
    if (ruta === '' || !ruta.startsWith('node_modules/')) continue;
    if (!meta || typeof meta !== 'object') continue;
    if (meta.link) continue;                 // workspaces / links
    if (!meta.version) continue;             // entradas sin version resuelta

    revisados += 1;
    const dir = join(cwd, ruta);
    const instalado = leerJson(join(dir, 'package.json'));
    const esOpcional = meta.optional === true || meta.devOptional === true;
    const plataformaDistinta = !plataformaCompatible(meta);

    if (!instalado) {
      if (esOpcional || plataformaDistinta) { opcionalesAusentes.push(ruta); continue; }
      problemas.push({ tipo: 'faltante', paquete: ruta, detalle: `el lockfile resuelve ${meta.version} y no hay nada instalado` });
      continue;
    }
    if (instalado.version !== meta.version) {
      problemas.push({
        tipo: 'version-distinta',
        paquete: ruta,
        detalle: `lockfile ${meta.version} · instalado ${instalado.version}`,
      });
    }
  }

  // 3. Toda dependencia DIRECTA tiene que existir en el arbol.
  for (const campo of ['dependencies', 'devDependencies']) {
    for (const nombre of Object.keys(pkg[campo] || {})) {
      if (!existsSync(join(cwd, 'node_modules', nombre, 'package.json'))) {
        problemas.push({ tipo: 'directa-faltante', paquete: nombre, detalle: `${campo}.${nombre} declarada y no instalada` });
      }
    }
  }

  return { ok: problemas.length === 0, problemas, opcionalesAusentes, revisados };
}

/** Un paquete con `os`/`cpu` que no matchea esta maquina puede faltar sin drama. */
export function plataformaCompatible(meta, { platform = process.platform, arch = process.arch } = {}) {
  const okLista = (lista, valor) => {
    if (!Array.isArray(lista) || lista.length === 0) return true;
    const negados = lista.filter((x) => x.startsWith('!')).map((x) => x.slice(1));
    if (negados.length > 0) return !negados.includes(valor);
    return lista.includes(valor);
  };
  return okLista(meta.os, platform) && okLista(meta.cpu, arch);
}

const esEntrada = process.argv[1]
  && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (esEntrada) {
  const r = checkInstallState();
  if (r.ok) {
    console.log(`✓ node_modules coincide con el lockfile (${r.revisados} paquete(s) revisados`
      + `${r.opcionalesAusentes.length ? `, ${r.opcionalesAusentes.length} opcional(es) de otra plataforma ausentes` : ''}).`);
  } else {
    console.error(`✗ El arbol instalado no coincide con el lockfile — ${r.problemas.length} problema(s):\n`);
    for (const p of r.problemas.slice(0, 40)) {
      console.error(`  [${p.tipo}] ${p.paquete || ''} ${p.detalle}`);
    }
    if (r.problemas.length > 40) console.error(`  ... y ${r.problemas.length - 40} mas`);
    console.error('\nCorre `npm ci` para reinstalar exactamente lo que dice el lockfile.');
    process.exitCode = 1;
  }
}
