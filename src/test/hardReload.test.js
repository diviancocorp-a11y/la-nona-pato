import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { hardReload } from '../lib/hardReload';

// El bug que esto cuida (16/ago): con un service worker activo,
// window.location.reload() vuelve a servir el build cacheado. El usuario
// recarga, ve exactamente lo mismo, y concluye que el deploy no salio. Ni
// Ctrl+Shift+R ni cerrar todas las pestanias alcanzaban: habia que
// desregistrar el SW desde la consola, cosa que un cliente no va a hacer.
//
// Lo que se afirma: que los caches se vacien ANTES de recargar, y que la
// recarga pase igual aunque el vaciado falle.

let recargas;
let cachesBorrados;

beforeEach(() => {
  recargas = 0;
  cachesBorrados = [];

  // jsdom no deja reasignar location.reload directo.
  delete window.location;
  window.location = { reload: () => { recargas++; } };

  globalThis.caches = {
    keys: async () => ['hermes-v5-static', 'hermes-v5-pages', 'workbox-precache-v2', 'otra-app'],
    delete: async (k) => { cachesBorrados.push(k); return true; },
  };

  navigator.serviceWorker = {
    getRegistrations: async () => [{ update: async () => {} }],
  };
});

afterEach(() => {
  delete globalThis.caches;
  vi.restoreAllMocks();
});

describe('hardReload', () => {
  it('vacia los caches de la app antes de recargar', async () => {
    await hardReload();
    expect(cachesBorrados).toContain('hermes-v5-static');
    expect(cachesBorrados).toContain('hermes-v5-pages');
    expect(recargas).toBe(1);
  });

  it('no toca caches de otras apps ni el precache de workbox', async () => {
    // Borrar de más en un origen compartido rompe cosas ajenas; el precache de
    // workbox se regenera solo y no guarda el bundle.
    await hardReload();
    expect(cachesBorrados).not.toContain('otra-app');
    expect(cachesBorrados).not.toContain('workbox-precache-v2');
  });

  it('recarga igual si el borrado de caches falla', async () => {
    globalThis.caches.keys = async () => { throw new Error('sin permiso'); };
    await hardReload();
    expect(recargas).toBe(1);
  });

  it('recarga igual si el service worker no responde', async () => {
    navigator.serviceWorker.getRegistrations = async () => { throw new Error('nope'); };
    await hardReload();
    expect(recargas).toBe(1);
  });

  it('funciona en un navegador sin caches API', async () => {
    delete globalThis.caches;
    await hardReload();
    expect(recargas).toBe(1);
  });
});
