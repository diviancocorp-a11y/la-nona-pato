// src/lib/release.js
// El nombre de release de Sentry. UN solo lugar.
//
// ── POR QUE EXISTE ESTE ARCHIVO ──
// Hasta el 29/ago habia TRES lugares construyendo el release por su cuenta:
//
//   vite.config.js      `${CLIENT}@${npm_package_version}`  -> sube los sourcemaps
//   observability.js    `hermes-gastro@${VITE_APP_VERSION}` -> emite los eventos
//   sentryFull.js       `hermes-gastro@${VITE_APP_VERSION}` -> emite los eventos
//
// Los prefijos eran incompatibles: NINGUN valor de VITE_APP_VERSION podia
// hacer que `la-nona-pato@x` fuera igual a `hermes-gastro@x`. O sea que los
// sourcemaps se subian a un release que ningun evento reportaba nunca, y
// TODOS los stack traces de produccion llegaban minificados.
//
// El sintoma no era un error: era que Sentry funcionaba y no servia. Eso
// sobrevivio meses justamente porque no falla.
//
// ── POR QUE BUILD_ID Y NO LA VERSION ──
// `package.json` dice 0.0.0 y nadie lo sube. Un release que no cambia agrupa
// deploys distintos bajo el mismo nombre, que es lo mismo que no tener
// releases. `__BUILD_ID__` ya es el SHA corto del commit (o un timestamp en
// local) y ya se emite en /version.json para el banner de actualizacion:
// reusarlo hace que el release de Sentry sea rastreable a un commit exacto.
//
// ── SI TOCAS EL FORMATO ──
// Cambialo tambien en `vite.config.js` (funcion sentryPlugins). Hay un test
// —src/test/sentryRelease.test.js— que compara los dos y falla si divergen.
// No borres ese test: es lo unico que impide que esto se vuelva a romper en
// silencio.

/** Prefijo del release. El producto es Dico; la empresa es Divianco. */
export const RELEASE_PREFIX = 'dico';

/**
 * El release de este build: `dico@<buildId>`.
 *
 * En tests `__BUILD_ID__` no esta definido (no hay `define` de Vite), asi que
 * cae a 'dev' en vez de tirar ReferenceError. Mismo guard que useAppUpdate.js.
 */
export function releaseName() {
  const buildId = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev';
  return `${RELEASE_PREFIX}@${buildId}`;
}

export const RELEASE = releaseName();
