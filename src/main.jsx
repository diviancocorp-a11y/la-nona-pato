import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import './index.css'
import { initObservability, setTenantContext } from './lib/observability.js'
import { initWebVitals } from './lib/webVitals.js'
import { loadFlags } from './services/featureFlags.js'
import business from '@business'
import './lib/i18n.js' // Initialize i18next (must be before App render)

// Initialize error tracking & analytics (no-op if env vars not set)
initObservability()
// SDK completo de Sentry (Session Replay solo-en-error + tags de contexto):
// DIFERIDO post-load para no afectar el arranque en webviews lentos (Instagram)
if (import.meta.env.VITE_SENTRY_DSN) {
  window.addEventListener('load', () => {
    setTimeout(() => import('./lib/sentryFull.js').catch(() => {}), 1500)
  })
}
// Tenant context: cada error reportado a Sentry incluye qué cliente lo disparó
setTenantContext({ code: __CLIENT__, name: business.name })
// Core Web Vitals (LCP, CLS, INP, FCP, TTFB) → console + analytics endpoint
initWebVitals()

// ── Dynamic favicon & title per client ──────────────────────
;(function setBranding() {
  // Title
  document.title = business.tagline
    ? `${business.name} — ${business.tagline}`
    : business.name

  // Favicon: if client has a custom favicon, swap it (prefer PNG, fallback SVG)
  if (business.logoUrl) {
    const clientFavicon = `/clients/${__CLIENT__}/favicon.png`
    let link = document.querySelector('link[rel="icon"]')
    if (link) {
      link.type = 'image/png'
      link.href = clientFavicon
    }
  }

  // Theme color
  if (business.branding?.themeColorLight) {
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
      if (m.media?.includes('light')) m.content = business.branding.themeColorLight
      else if (m.media?.includes('dark')) m.content = business.branding.themeColorDark || business.branding.themeColorLight
    })
  }
})()

// Pre-load feature flags before first render. Runtime theme loading is owned
// by App and only runs for tenant/catalog surfaces.
loadFlags().catch(() => {})

// ── Dev mode: phone frame preview en desktop ────────────────
// Wrap visual del #root con un iPhone frame cuando estás viendo
// la app en desktop durante dev. En mobile real no se nota.
//
// Toggle por TECLADO (no hay botón en UI para no tapar contenido):
//   Ctrl/Cmd + Shift + P  → alterna el frame on/off (se guarda en localStorage)
//
// Toggle desde consola:
//   localStorage.setItem('hermes-dev-phone-preview', '1'); location.reload()
//   localStorage.setItem('hermes-dev-phone-preview', '0'); location.reload()
if (import.meta.env.DEV) {
  import('./styles/dev-phone-preview.css')
  const ENABLED_KEY = 'hermes-dev-phone-preview'
  const enabled = localStorage.getItem(ENABLED_KEY) === '1'  // off por default — opt-in
  if (enabled) document.body.setAttribute('data-dev-preview', 'phone')

  // Atajo de teclado para alternar
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'p') {
      e.preventDefault()
      const isOn = document.body.getAttribute('data-dev-preview') === 'phone'
      if (isOn) {
        document.body.removeAttribute('data-dev-preview')
        localStorage.setItem(ENABLED_KEY, '0')
      } else {
        document.body.setAttribute('data-dev-preview', 'phone')
        localStorage.setItem(ENABLED_KEY, '1')
      }
    }
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)

// Register Service Worker for offline support
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
