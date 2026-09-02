import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test as base, expect } from '@playwright/test'
import { classifyRequest, fontFixturePath } from './network-policy.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..', '..')
const FONT_CSS = readFileSync(join(HERE, 'assets', 'fonts.css'), 'utf8')
type NetworkAudit = {
  fulfilledLocal: string[]
  blocked: string[]
}

export const test = base.extend<{ networkAudit: NetworkAudit }>({
  networkAudit: [async ({ context, page }, use, testInfo) => {
    const fixedNow = process.env.QA_FIXED_NOW
    if (!fixedNow) throw new Error('QA_FIXED_NOW es obligatorio para DICO-QA-Lite')
    if (page.url() !== 'about:blank') {
      throw new Error(`QA Lite recibio una pagina ya navegada antes de instalar clock: ${page.url()}`)
    }
    const initialStorage = await context.storageState()
    if (initialStorage.cookies.length !== 0 || initialStorage.origins.length !== 0) {
      throw new Error('QA Lite recibio un BrowserContext con storage heredado')
    }
    const audit: NetworkAudit = { fulfilledLocal: [], blocked: [] }
    await context.route('**/*', async (route) => {
      const requestUrl = route.request().url()
      const policy = classifyRequest(requestUrl)
      if (policy.action === 'font-css') {
        audit.fulfilledLocal.push(requestUrl)
        await route.fulfill({ status: 200, contentType: 'text/css; charset=utf-8', body: FONT_CSS })
        return
      }
      if (policy.action === 'font-binary') {
        audit.fulfilledLocal.push(requestUrl)
        await route.fulfill({
          status: 200,
          contentType: 'font/woff2',
          path: fontFixturePath(ROOT, policy.name),
        })
        return
      }
      if (policy.action === 'continue') {
        await route.continue()
        return
      }
      audit.blocked.push(requestUrl)
      await route.abort('blockedbyclient')
    })

    // ── LA PREFERENCIA DECLARADA TIENE QUE LLEGAR A LA PAGINA ──────────
    //
    // El config declara `reducedMotion: 'reduce'` y la pagina reportaba
    // `false`: la opcion del contexto no estaba surtiendo efecto, mientras que
    // `page.emulateMedia` si. O sea que TODA la QA corria con el movimiento
    // encendido, incluidos los tres specs que ponen `no-preference` a
    // proposito —una distincion que no existia—.
    //
    // Consecuencia concreta: el carrusel del catalogo auto-avanzaba en cada
    // superficie, y por eso aparecian dos capas a la vez.
    //
    // Se fuerza y se VERIFICA. Un `emulateMedia` que dejara de funcionar
    // volveria a fallar en silencio; esta comprobacion lo convierte en un
    // error inmediato.
    // Movimiento ENCENDIDO por defecto: es lo que tiene la mayoria de la
    // gente, y capturar todo bajo `reduce` esconderia del gate las animaciones
    // productivas —que es justo lo que no hay que hacer—. Lo que congela el
    // movimiento continuo es el registro de motion, no la preferencia.
    // Un spec que quiera probar reduced motion lo pide explicitamente.
    await aplicarMovimiento(page, 'no-preference')

    const fixedTime = new Date(fixedNow).getTime()
    if (!Number.isFinite(fixedTime)) throw new Error('QA_FIXED_NOW no es una fecha valida')
    await page.clock.setFixedTime(new Date(fixedTime))
    const installedTime = await page.evaluate(() => Date.now())
    if (installedTime !== fixedTime) {
      throw new Error(`QA Lite no pudo fijar el reloj antes de navegar: ${installedTime}`)
    }
    await use(audit)

    const artifactDir = process.env.QA_ARTIFACT_DIR
    const phase = process.env.QA_PHASE
    if (artifactDir && phase) {
      const fs = await import('node:fs/promises')
      const safeName = testInfo.file.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') || 'unknown'
      const out = join(artifactDir, phase, `network-${safeName}.json`)
      await fs.mkdir(dirname(out), { recursive: true })
      await fs.writeFile(out, JSON.stringify(audit, null, 2) + '\n', 'utf8')
    }
    expect(audit.blocked, `Intentos de red externa: ${audit.blocked.join(', ')}`).toEqual([])
  }, { auto: true }],
})

export { expect }

/**
 * Aplica —y COMPRUEBA— la preferencia de movimiento en la pagina.
 *
 * `reducedMotion` declarado en el `use` del config no surtia efecto: la pagina
 * reportaba `false` con el config pidiendo `reduce`, mientras que
 * `page.emulateMedia` si funcionaba. O sea que toda la QA corria con el
 * movimiento encendido, y los `test.use({ reducedMotion })` de tres specs eran
 * no-ops silenciosos. Consecuencia concreta: el carrusel del catalogo
 * auto-avanzaba en cada superficie y aparecian dos capas a la vez.
 *
 * Se aplica explicitamente y se verifica. Un `emulateMedia` que dejara de
 * funcionar volveria a fallar en silencio; la comprobacion lo vuelve un error
 * inmediato.
 */
export async function aplicarMovimiento(
  page: import('@playwright/test').Page,
  preferencia: 'reduce' | 'no-preference',
) {
  await page.emulateMedia({ reducedMotion: preferencia })
  const reduceEnLaPagina = await page.evaluate(() => (
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ))
  if (reduceEnLaPagina !== (preferencia === 'reduce')) {
    throw new Error(
      `QA Lite no pudo aplicar prefers-reduced-motion: pidio "${preferencia}", `
      + `la pagina reporta reduce=${reduceEnLaPagina}`,
    )
  }
}

export async function stabilizePage(page: import('@playwright/test').Page) {
  await page.evaluate(async () => {
    await document.fonts.ready
    await Promise.all(Array.from(document.images).map((image) => {
      if (image.complete) return image.decode?.().catch(() => undefined)
      return new Promise<void>((resolveImage) => {
        image.addEventListener('load', () => resolveImage(), { once: true })
        image.addEventListener('error', () => resolveImage(), { once: true })
      })
    }))
    await new Promise<void>((resolveFrame) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolveFrame()))
    })
  })
}
