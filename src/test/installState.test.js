// src/test/installState.test.js
//
// Que `node_modules` sea de verdad lo que dice el lockfile.
//
// El caso concreto que reproduce: el 30/ago el worktree principal tenia
// react-router-dom 7.18.2 y react-router 7.15.1 instalados mientras el lockfile
// resolvia 7.18.3 para los dos. La suite corrio contra ese arbol y paso. No
// probaba lo que se iba a publicar.
//
// Los fixtures son arboles reales en disco —package.json, package-lock.json y
// node_modules de verdad— porque el check lee metadata real. Mockear la salida
// de npm no probaria nada.

import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it, expect, afterEach } from 'vitest';
import { checkInstallState, plataformaCompatible } from '../../scripts/check-install-state.mjs';

const temporales = [];
afterEach(() => {
  while (temporales.length) rmSync(temporales.pop(), { recursive: true, force: true });
});

/**
 * Arma un arbol de mentira pero real.
 * @param deps      lo declarado en package.json.dependencies
 * @param resueltas lo que el lockfile resuelve, por paquete
 * @param instaladas lo que hay en node_modules (null = no instalado)
 */
function arbol({ deps = {}, devDeps = {}, resueltas = {}, instaladas = {}, extraLock = {} } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'dico-install-state-'));
  temporales.push(dir);

  writeFileSync(join(dir, 'package.json'), JSON.stringify({
    name: 'fixture', version: '0.0.0', dependencies: deps, devDependencies: devDeps,
  }, null, 2));

  const packages = { '': { dependencies: deps, devDependencies: devDeps }, ...extraLock };
  for (const [nombre, version] of Object.entries(resueltas)) {
    packages[`node_modules/${nombre}`] = { version };
  }
  writeFileSync(join(dir, 'package-lock.json'), JSON.stringify({
    name: 'fixture', lockfileVersion: 3, packages,
  }, null, 2));

  for (const [nombre, version] of Object.entries(instaladas)) {
    if (version === null) continue;
    const d = join(dir, 'node_modules', nombre);
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, 'package.json'), JSON.stringify({ name: nombre, version }));
  }
  return dir;
}

describe('check:install-state', () => {
  it('arbol alineado: PASA', () => {
    const cwd = arbol({
      deps: { 'react-router-dom': '7.18.3' },
      devDeps: { vite: '^8.0.1' },
      resueltas: { 'react-router-dom': '7.18.3', 'react-router': '7.18.3', vite: '8.0.13' },
      instaladas: { 'react-router-dom': '7.18.3', 'react-router': '7.18.3', vite: '8.0.13' },
    });
    const r = checkInstallState({ cwd });
    expect(r.problemas).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.revisados).toBe(3);
  });

  it('EL CASO DEL 30/ago: lockfile 7.18.3, instalados 7.18.2 y 7.15.1 → FALLA', () => {
    const cwd = arbol({
      deps: { 'react-router-dom': '7.18.3' },
      resueltas: { 'react-router-dom': '7.18.3', 'react-router': '7.18.3' },
      instaladas: { 'react-router-dom': '7.18.2', 'react-router': '7.15.1' },
    });
    const r = checkInstallState({ cwd });
    expect(r.ok).toBe(false);
    const detalles = r.problemas.map((p) => `${p.paquete} ${p.detalle}`).join(' | ');
    expect(detalles).toContain('react-router-dom');
    expect(detalles).toContain('7.18.2');
    expect(detalles).toContain('react-router');
    expect(detalles).toContain('7.15.1');
    expect(r.problemas.every((p) => p.tipo === 'version-distinta')).toBe(true);
  });

  it('package.json desalineado con el lockfile: FALLA', () => {
    const cwd = arbol({
      deps: { foo: '^2.0.0' },
      resueltas: { foo: '2.0.1' },
      instaladas: { foo: '2.0.1' },
    });
    // el lockfile registro otro rango en su nodo raiz
    const lock = JSON.parse(readFileSync(join(cwd, 'package-lock.json'), 'utf8'));
    lock.packages[''].dependencies.foo = '^1.0.0';
    writeFileSync(join(cwd, 'package-lock.json'), JSON.stringify(lock, null, 2));

    const r = checkInstallState({ cwd });
    expect(r.ok).toBe(false);
    expect(r.problemas.some((p) => p.tipo === 'lockfile-desalineado')).toBe(true);
  });

  it('dependencia directa faltante: FALLA', () => {
    const cwd = arbol({
      deps: { falta: '^1.0.0' },
      resueltas: { falta: '1.0.0' },
      instaladas: {},
    });
    const r = checkInstallState({ cwd });
    expect(r.ok).toBe(false);
    expect(r.problemas.some((p) => p.tipo === 'directa-faltante' || p.tipo === 'faltante')).toBe(true);
  });

  it('lockfile invalido (sin seccion packages): FALLA', () => {
    const cwd = arbol({ deps: {}, resueltas: {}, instaladas: {} });
    writeFileSync(join(cwd, 'package-lock.json'), JSON.stringify({ lockfileVersion: 1 }));
    const r = checkInstallState({ cwd });
    expect(r.ok).toBe(false);
    expect(r.problemas[0].tipo).toBe('lockfile-invalido');
  });

  it('un opcional de otra plataforma que falta NO rompe el check', () => {
    const cwd = arbol({ deps: {}, resueltas: {}, instaladas: {} });
    const lock = JSON.parse(readFileSync(join(cwd, 'package-lock.json'), 'utf8'));
    lock.packages['node_modules/@rollup/rollup-linux-x64-gnu'] = {
      version: '4.0.0', optional: true, os: ['linux'], cpu: ['x64'],
    };
    writeFileSync(join(cwd, 'package-lock.json'), JSON.stringify(lock, null, 2));
    const r = checkInstallState({ cwd });
    expect(r.ok).toBe(true);
    expect(r.opcionalesAusentes).toContain('node_modules/@rollup/rollup-linux-x64-gnu');
  });

  it('plataformaCompatible respeta os/cpu, incluidos los negados', () => {
    expect(plataformaCompatible({ os: ['win32'] }, { platform: 'win32', arch: 'x64' })).toBe(true);
    expect(plataformaCompatible({ os: ['linux'] }, { platform: 'win32', arch: 'x64' })).toBe(false);
    expect(plataformaCompatible({ os: ['!win32'] }, { platform: 'win32', arch: 'x64' })).toBe(false);
    expect(plataformaCompatible({ cpu: ['arm64'] }, { platform: 'darwin', arch: 'x64' })).toBe(false);
    expect(plataformaCompatible({}, { platform: 'win32', arch: 'x64' })).toBe(true);
  });

  it('el repo real esta alineado', () => {
    const r = checkInstallState();
    if (!r.ok) {
      const resumen = r.problemas.slice(0, 5).map((p) => `[${p.tipo}] ${p.paquete}: ${p.detalle}`).join('\n');
      throw new Error(`node_modules no coincide con el lockfile:\n${resumen}`);
    }
    expect(r.ok).toBe(true);
  });
});
