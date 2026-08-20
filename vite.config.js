import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import fs from 'fs'
import { pathToFileURL } from 'url'

const CLIENT = process.env.CLIENT || 'la-nona-pato'

// Build id unico por deploy. En Vercel usa el SHA del commit; local, un timestamp.
// Se bakea en el bundle (__BUILD_ID__) y se emite en /version.json — el runtime
// compara ambos y avisa "hay actualizacion" cuando difieren (chunk viejo tras deploy).
const BUILD_ID = (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 8) || String(Date.now())

function loadClientEnv() {
  const envFile = path.resolve(__dirname, `.env.${CLIENT}`)
  if (!fs.existsSync(envFile)) return
  const content = fs.readFileSync(envFile, 'utf-8')
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const val = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '')
    if (!(key in process.env)) process.env[key] = val
  }
}
loadClientEnv()

function loadBusinessConfig() {
  const configPath = path.resolve(__dirname, `clients/${CLIENT}/business.js`)
  return import(pathToFileURL(configPath).href)
    .then(mod => mod.default)
    .catch(() => ({ name: CLIENT, description: '', branding: {} }))
}

function renderManifest(biz) {
  const name = biz.name || CLIENT
  const shortName = biz.shortName || name
  const description = biz.description || ''
  const themeColor = biz.branding?.themeColorLight || '#C45D3E'
  const bgColor = biz.branding?.catalogBg || '#FFF8F0'
  const favicon = biz.faviconUrl
    || (biz.logoUrl ? `/clients/${CLIENT}/favicon.png` : '/favicon.svg')
  return JSON.stringify({
    name, short_name: shortName, description,
    start_url: '/', display: 'standalone',
    theme_color: themeColor, background_color: bgColor,
    icons: [
      { src: favicon, sizes: '192x192', type: 'image/png' },
      { src: favicon, sizes: '512x512', type: 'image/png' },
    ],
  }, null, 2)
}

function businessHtmlPlugin() {
  let biz = { name: CLIENT, description: '', branding: {} }
  return {
    name: 'business-html-injection',
    async config() { biz = await loadBusinessConfig() },
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        const title = biz.name || 'Hermes Gastro'
        const desc = biz.description || ''
        const themeColor = biz.branding?.themeColorLight || '#C45D3E'
        return html
          .replace(/<title>.*?<\/title>/, `<title>${title}</title>`)
          .replace(/<meta name="description" content=".*?"/, `<meta name="description" content="${desc}"`)
          .replace(/<meta name="theme-color" content=".*?"/, `<meta name="theme-color" content="${themeColor}"`)
      },
    },
    configureServer(server) {
      server.middlewares.use('/manifest.json', (req, res, next) => {
        if (req.method !== 'GET') return next()
        res.setHeader('Content-Type', 'application/manifest+json')
        res.end(renderManifest(biz))
      })
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'manifest.json',
        source: renderManifest(biz),
      })
    },
  }
}

// ── /version.json (deteccion de version nueva en runtime) ───────────────────
// Emite un JSON estable (no hasheado) con el build id. El hook useAppUpdate lo
// pollea (cache: no-store) y lo compara con __BUILD_ID__ bakeado en el bundle.
function versionJsonPlugin() {
  const body = JSON.stringify({ buildId: BUILD_ID })
  return {
    name: 'hermes-version-json',
    configureServer(server) {
      server.middlewares.use('/version.json', (req, res, next) => {
        if (req.method !== 'GET') return next()
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Cache-Control', 'no-store')
        res.end(body)
      })
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: body })
    },
  }
}

// ── Sentry sourcemaps (Sprint 4.7) ──────────────────────────────────────────
// Solo se activa si hay SENTRY_AUTH_TOKEN en el entorno de build (Vercel env o
// local). Sin token: build normal sin sourcemaps, cero impacto.
// Setup: crear token en Sentry > Settings > Auth Tokens (scope project:releases)
// y agregar SENTRY_AUTH_TOKEN + SENTRY_ORG + SENTRY_PROJECT a las env del build.
const SENTRY_ENABLED = !!process.env.SENTRY_AUTH_TOKEN
async function sentryPlugins() {
  if (!SENTRY_ENABLED) return []
  try {
    const { sentryVitePlugin } = await import('@sentry/vite-plugin')
    return [sentryVitePlugin({
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      release: { name: `${CLIENT}@${process.env.npm_package_version || 'dev'}` },
      sourcemaps: { filesToDeleteAfterUpload: ['dist/**/*.map'] },
    })]
  } catch {
    console.warn('[sentry] @sentry/vite-plugin no instalado — sourcemaps omitidos')
    return []
  }
}

export default defineConfig(async () => ({
  plugins: [businessHtmlPlugin(), versionJsonPlugin(), tailwindcss(), react(), ...(await sentryPlugins())],
  resolve: {
    alias: {
      '@business': path.resolve(__dirname, `clients/${CLIENT}/business.js`),
      '@hermes/core': path.resolve(__dirname, 'src'),
    },
  },
  define: {
    __CLIENT__: JSON.stringify(CLIENT),
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
    include: ['src/**/*.test.{js,jsx,ts,tsx}'],
    // Los 5s por defecto alcanzan de sobra para un test de render... salvo que
    // haya un `npm run dev` comiendose la maquina, que es justo lo que pasa
    // cuando se commitea sin cerrar el server. Ahi timeoutean tests distintos
    // en cada corrida y parece flakiness de los tests: no lo es, es la CPU.
    // Reproducido el 19/ago: con la vitrina levantada fallan 3-4 al azar, sin
    // ella pasan los 675.
    testTimeout: 15000,
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
    env: {
      VITE_SUPABASE_URL: 'http://test.local',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary'],
      include: ['src/lib/**', 'src/services/**', 'src/hooks/**', 'src/components/ui/**'],
      exclude: ['src/lib/supabase.js'],
      // Threshold gradual — plan de subida:
      //   FASE 5b (actual): 35  — refleja estado real del repo
      //   Próxima vuelta:   45  — cuando agreguemos tests de Home/Orders/Finance
      //   Meta:             70  — cuando cubramos hooks + services + componentes críticos
      thresholds: { statements: 35 },
    },
  },
  build: {
    // Sourcemaps solo cuando Sentry los va a subir (se borran del deploy despues)
    sourcemap: SENTRY_ENABLED ? 'hidden' : false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/@supabase')) return 'supabase'
          if (id.includes('node_modules/@tanstack')) return 'query'
          if (id.includes('node_modules/i18next') || id.includes('node_modules/react-i18next')) return 'i18n'
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react-router')) return 'react-vendor'
        },
      },
    },
    chunkSizeWarningLimit: 300,
    target: 'es2020',
    cssMinify: true,
  },
}))
