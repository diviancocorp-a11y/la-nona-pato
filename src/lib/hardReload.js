// src/lib/hardReload.js
// Recargar de verdad: tirar los caches del service worker ANTES de recargar.
//
// Por que existe: `window.location.reload()` no alcanza cuando hay un service
// worker. El SW intercepta igual y vuelve a servir lo que tiene guardado —
// index.html viejo, con los hashes viejos, que tambien estan cacheados. El
// usuario recarga, ve exactamente lo mismo, y concluye que el deploy no salio.
// Paso el 16/ago: ni Ctrl+Shift+R ni cerrar todas las pestanias alcanzaban;
// habia que desregistrar el SW a mano desde la consola. Eso un cliente no lo
// va a hacer nunca.
//
// Lo usan los dos caminos que existen para recuperarse de un deploy nuevo:
//   - el banner "hay una actualizacion" (useAppUpdate)
//   - el rescate por chunk roto de App.jsx (lazyReload)
//
// NO desregistra el SW: eso dejaria al usuario sin PWA ni push hasta la
// proxima visita. Alcanza con vaciarle los caches y pedirle que se actualice.

const PREFIJO_CACHE = 'hermes-';

/**
 * Vacia los caches de la app y recarga. Nunca lanza: si algo del medio falla,
 * recarga igual — quedarse sin recargar es el peor final posible.
 */
export async function hardReload() {
  try {
    if ('caches' in window) {
      const claves = await caches.keys();
      await Promise.all(
        claves
          .filter((k) => k.startsWith(PREFIJO_CACHE))
          .map((k) => caches.delete(k)),
      );
    }
  } catch { /* seguir */ }

  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      // update() le pide al browser que rechequee /sw.js. No se espera el
      // resultado con timeout propio: si tarda, la recarga sigue igual.
      await Promise.all(regs.map((r) => r.update().catch(() => {})));
    }
  } catch { /* seguir */ }

  window.location.reload();
}
