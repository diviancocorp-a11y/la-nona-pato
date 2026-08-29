// src/test/sentryRelease.test.js
//
// El unico test que impide que Sentry se vuelva a romper en silencio.
//
// EL BUG QUE PREVIENE (encontrado el 29/ago/2026): el uploader de sourcemaps
// (vite.config.js) y el runtime que emite los eventos (src/lib/release.js)
// construian el release por separado, con prefijos distintos:
//
//   uploader -> `${CLIENT}@${npm_package_version}`   ej. "la-nona-pato@0.0.0"
//   runtime  -> `hermes-gastro@${VITE_APP_VERSION}`  ej. "hermes-gastro@0.0.0"
//
// Nunca coincidian, asi que los sourcemaps quedaban colgados de un release
// fantasma y TODOS los stack traces de produccion llegaban minificados.
//
// Lo peligroso no fue el error: fue que no fallaba nada. Sentry recibia
// eventos, el build subia mapas, y el sistema entero parecia sano. Por eso el
// chequeo es un test y no un comentario.
//
// Este test lee vite.config.js como TEXTO a proposito: importarlo ejecutaria
// la config entera (plugins, fs, dynamic imports) y no queremos eso en la
// suite. Lo que se valida es el CONTRATO —que los dos digan `dico@` mas el
// mismo build id—, no la implementacion.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { RELEASE_PREFIX, releaseName } from '../lib/release.js';

const viteConfig = readFileSync(resolve('vite.config.js'), 'utf8');

describe('release de Sentry: uploader y runtime dicen lo mismo', () => {
  it('vite.config.js define SENTRY_RELEASE con el mismo prefijo que el runtime', () => {
    const linea = viteConfig
      .split('\n')
      .find((l) => l.includes('const SENTRY_RELEASE'));

    expect(linea, 'vite.config.js perdio la constante SENTRY_RELEASE').toBeTruthy();
    expect(linea).toContain(`${RELEASE_PREFIX}@`);
  });

  it('el uploader usa BUILD_ID, no la version de package.json', () => {
    // package.json esta clavado en 0.0.0 y nadie lo sube: un release basado en
    // esa version agrupa deploys distintos bajo el mismo nombre.
    const linea = viteConfig
      .split('\n')
      .find((l) => l.includes('const SENTRY_RELEASE'));

    expect(linea).toContain('BUILD_ID');
    expect(linea).not.toContain('npm_package_version');
  });

  it('el plugin de Sentry consume esa constante y no arma el string aparte', () => {
    expect(viteConfig).toContain('release: { name: SENTRY_RELEASE }');
  });

  it('el runtime arma `dico@<buildId>` con un build id no vacio', () => {
    // Vitest SI aplica el `define` de vite.config, asi que aca __BUILD_ID__
    // existe y vale el timestamp (no hay VERCEL_GIT_COMMIT_SHA en local).
    // Por eso se valida el FORMATO, no un valor fijo: clavarlo a 'dev' hacia
    // fallar el test en la maquina de Ricky y pasar en ningun lado.
    const r = releaseName();
    expect(r.startsWith(`${RELEASE_PREFIX}@`)).toBe(true);
    expect(r.slice(RELEASE_PREFIX.length + 1).length).toBeGreaterThan(0);
    expect(r).not.toContain('undefined');
  });

  it('ya no queda ningun `hermes-gastro@` armando releases', () => {
    // El nombre viejo sobrevive en comentarios y en IDs de issues
    // (HERMES-GASTRO-G y companhia), que SI se conservan: son trazabilidad
    // historica. Lo que no puede volver es un release construido con el.
    const observability = readFileSync(resolve('src/lib/observability.js'), 'utf8');
    const sentryFull = readFileSync(resolve('src/lib/sentryFull.js'), 'utf8');

    for (const src of [observability, sentryFull, viteConfig]) {
      expect(src).not.toContain('release: `hermes-gastro@');
    }
  });
});
