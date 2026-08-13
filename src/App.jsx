import { Routes, Route } from 'react-router-dom'
import QrRedirect from './pages/QrRedirect'
import InfoPage from './pages/InfoPage'
import { lazy, Suspense } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './lib/queryClient'
import { AuthProvider } from './contexts/AuthContext'
import ErrorBoundary from './components/ErrorBoundary'
import SkipToContent from './components/ui/SkipToContent'
import OfflineBanner from './components/ui/OfflineBanner'
import UpdateBanner from './components/ui/UpdateBanner'
import useTheme from './hooks/useTheme'
import Catalog from './pages/Catalog'
import PlatformLanding from './pages/PlatformLanding'
import Signup from './pages/Signup'
import Bienvenido from './pages/Bienvenido'
import NotFound from './pages/NotFound'
import { isPlatformRoot } from './lib/tenantHost'
import { useEffect } from 'react'
import { fetchSettings } from './services/settings'
import { supabase } from './lib/supabase'

// lazy con auto-recuperacion (fix HERMES-GASTRO-8, 11/jun): si el usuario
// tiene la app abierta de ANTES de un deploy, el chunk viejo ya no existe y
// el import dinamico falla ("Failed to fetch dynamically imported module").
// Solucion: recargar la pagina UNA vez (trae el HTML nuevo con hashes nuevos).
// El guard en sessionStorage evita loops si el error es otro.
function lazyReload(importer) {
  return lazy(() =>
    importer().catch((err) => {
      try {
        // Maximo 1 recarga cada 60s: recupera tras cada deploy nuevo pero
        // nunca entra en loop si el fallo es persistente
        const last = Number(sessionStorage.getItem('hg_chunk_reload') || 0)
        if (Date.now() - last > 60000) {
          sessionStorage.setItem('hg_chunk_reload', String(Date.now()))
          window.location.reload()
          return new Promise(() => {}) // la recarga interrumpe; no renderizar nada
        }
      } catch { /* sin storage: dejar que el error suba al ErrorBoundary */ }
      throw err
    }),
  )
}

const Admin = lazyReload(() => import('./pages/Admin'))
const Personalizacion = lazyReload(() => import('./pages/Personalizacion'))
const InfoPagesAdmin = lazyReload(() => import('./pages/admin/InfoPages'))
const OrderTracker = lazyReload(() => import('./pages/OrderTracker'))
const MyAccount = lazyReload(() => import('./pages/MyAccount'))
const MpCallback = lazyReload(() => import('./pages/MpCallback'))
const MpStatus = lazyReload(() => import('./pages/MpStatus'))

const Loading = () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
    <p style={{ color: '#9C8B7A', fontSize: 15 }}>Cargando...</p>
  </div>
)

export default function App() {
  useTheme();

  useEffect(() => {
    let cancelled = false;
    const apply = (sett) => {
      const t = ['ambar','noche','carbon'].includes(sett?.catalog_theme) ? sett.catalog_theme : 'ambar';
      document.body.setAttribute('data-cp-theme', t);
      // Cache para el anti-flash de index.html (proxima carga pinta el tema correcto)
      try { localStorage.setItem('cp_theme', t); } catch { /* empty */ }
      // Pestania del navegador: titulo y descripcion salen de settings
      // (Personalizacion), no del business.js de build. Asi el slogan que
      // carga el cliente afecta el catalogo Y la pestania, y en su idioma.
      if (sett?.biz_name) {
        document.title = sett.slogan ? `${sett.biz_name} — ${sett.slogan}` : sett.biz_name;
      }
      const desc = sett?.slogan || '';
      if (desc) {
        for (const sel of ["meta[name='description']", "meta[property='og:description']"]) {
          let m = document.querySelector(sel);
          if (!m) {
            m = document.createElement('meta');
            if (sel.includes('property')) m.setAttribute('property', 'og:description');
            else m.setAttribute('name', 'description');
            document.head.appendChild(m);
          }
          m.setAttribute('content', desc);
        }
      }
      // Favicon: usa favicon_url si esta, sino el logo de la empresa
      const faviconSrc = sett?.favicon_url || sett?.logo_url;
      if (faviconSrc) {
        let link = document.querySelector("link[rel~='icon']");
        if (!link) {
          link = document.createElement('link');
          link.rel = 'icon';
          document.head.appendChild(link);
        }
        link.href = faviconSrc;
      }
      // og:image (preview al compartir): siempre el logo de la empresa
      if (sett?.logo_url) {
        let og = document.querySelector("meta[property='og:image']");
        if (!og) {
          og = document.createElement('meta');
          og.setAttribute('property', 'og:image');
          document.head.appendChild(og);
        }
        og.setAttribute('content', sett.logo_url);
      }
    };
    fetchSettings().then((sett) => { if (!cancelled) apply(sett); });

    const channel = supabase
      .channel('app-theme-watch')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'settings' },
        (payload) => apply(payload?.new))
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, []);

  return (
    <ErrorBoundary>
      <SkipToContent />
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <Suspense fallback={<Loading />}>
            <main id="main-content">
            <Routes>
              {/* La raiz de la plataforma (divianco.app) no es el catalogo de
                  nadie: ahi va la landing. Cualquier otro host —subdominio de
                  tenant, dominio propio, local— sigue entrando al catalogo. */}
              <Route path="/" element={isPlatformRoot(window.location.hostname) ? <PlatformLanding /> : <Catalog />} />
              {/* Alta self-service: solo tiene sentido en la raiz. En el
                  subdominio de un tenant el local ya es de alguien. */}
              <Route path="/registro" element={<Signup />} />
              <Route path="/bienvenido" element={<Bienvenido />} />
              <Route path="/q/:slug" element={<QrRedirect />} />
              <Route path="/info/:slug" element={<InfoPage />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="/admin/personalizacion" element={<Personalizacion />} />
              <Route path="/admin/paginas" element={<InfoPagesAdmin />} />
              <Route path="/order/:id" element={<OrderTracker />} />
              <Route path="/mi-cuenta" element={<MyAccount />} />
              <Route path="/mp-callback" element={<MpCallback />} />
              <Route path="/pago/exitoso" element={<MpStatus status="exitoso" />} />
              <Route path="/pago/fallido" element={<MpStatus status="fallido" />} />
              <Route path="/pago/pendiente" element={<MpStatus status="pendiente" />} />
              {/* 404 catch-all (Sprint 4) — sin esto, URL invalida = pantalla blanca */}
              <Route path="*" element={<NotFound />} />
            </Routes>
            </main>
          </Suspense>
        </AuthProvider>
      </QueryClientProvider>
      <OfflineBanner />
      <UpdateBanner />
    </ErrorBoundary>
  )
}
