// src/lib/sentryFull.js
// SDK oficial de Sentry con Session Replay SOLO-EN-ERROR.
//
// Se carga DIFERIDO desde main.jsx (despues del evento load) para no sumar
// ni un byte al arranque — clave en el WebView de Instagram que acabamos de
// optimizar. El buffer de replay arranca unos segundos tarde: aceptable.
//
// Convive con el reporter liviano (observability.js):
//   - window.__SENTRY_FULL__ seteado → captureException delega aca (asi el
//     replay queda adjunto al error) y los handlers globales custom se apagan
//     (el SDK instala los suyos).
// Privacidad (Ley 25.326): maskAllText enmascara todos los textos del replay
// — se ve QUE toco el cliente, no SUS datos.
import * as Sentry from '@sentry/react';
import business from '@business';
import { RELEASE } from './release.js';

const dsn = import.meta.env.VITE_SENTRY_DSN || '';

if (dsn) {
  Sentry.init({
    dsn,
    release: RELEASE,
    environment: import.meta.env.MODE || 'production',
    integrations: [
      Sentry.replayIntegration({ maskAllText: true, blockAllMedia: false }),
    ],
    // Replay: nunca grabar sesiones normales, SIEMPRE adjuntar video al error
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    // Mismo filtro anti-ruido que observability.js
    ignoreErrors: [
      /Java object is gone/i,
      /iabjs:\/\//i,
      /ResizeObserver loop (limit exceeded|completed with undelivered notifications)/i,
      // Chunk viejo tras deploy — lazyReload lo auto-recupera (ver observability.js)
      /Importing a module script failed/i,
      /dynamically imported module/i,
      // Errores de red transitorios del cliente (Safari "Load failed" / Chrome
      // "Failed to fetch" / Firefox "NetworkError" / "AbortError"). Ruido, no
      // bugs nuestros — HERMES-GASTRO-J (16/jun). Mismo filtro que observability.js.
      /Load failed/i,
      /Failed to fetch/i,
      /NetworkError/i,
      /AbortError/i,
    ],
    beforeSend(event) {
      event.tags = {
        ...event.tags,
        tenant: typeof __CLIENT__ !== 'undefined' ? __CLIENT__ : 'unknown',
        tenant_name: business?.name || '',
        screen: window.location.pathname,
        checkout_step: window.__HG_CHECKOUT_STEP ?? 'none',
      };
      return event;
    },
  });
  window.__SENTRY_FULL__ = Sentry;
}
