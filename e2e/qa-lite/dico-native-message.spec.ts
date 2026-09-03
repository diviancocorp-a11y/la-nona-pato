import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test, expect } from './fixtures'
import { freezeContinuousDecorativeMotion, openAdmin } from './surfaces'

type ViewportCase = {
  name: string
  width: number
  height: number
  screenshots: boolean
}

const VIEWPORTS: ViewportCase[] = [
  { name: 'desktop', width: 1440, height: 1000, screenshots: true },
  { name: 'tablet-768', width: 768, height: 900, screenshots: false },
  { name: 'mobile-375', width: 375, height: 812, screenshots: true },
  { name: 'mobile-320', width: 320, height: 800, screenshots: false },
]

function outputRoot() {
  const root = process.env.QA_ARTIFACT_DIR
  const phase = process.env.QA_PHASE
  if (!root || !phase) throw new Error('QA_ARTIFACT_DIR y QA_PHASE son obligatorios')
  return join(root, phase, 'dico-native-message')
}

async function shot(page: import('@playwright/test').Page, name: string) {
  const root = outputRoot()
  await mkdir(root, { recursive: true })
  await page.screenshot({ path: join(root, `${name}.png`), fullPage: false, caret: 'hide' })
}

async function geometry(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const rect = (selector: string) => {
      const element = document.querySelector(selector)
      if (!element) return null
      const box = element.getBoundingClientRect()
      // Un elemento con `display: none` sigue en el DOM y devuelve una caja de
      // ceros en el origen. Tratarla como geometria real hacia que "Dico no
      // pisa la nav inferior" fallara en desktop, donde la nav inferior no
      // existe: comparaba contra un borde en y=0.
      if (box.width === 0 && box.height === 0) return null
      return {
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        top: box.top,
        right: box.right,
        bottom: box.bottom,
        left: box.left,
      }
    }
    const message = document.querySelector('.dico-avisos-mensaje')
    const presence = document.querySelector('.dico-avisos-presencia')
    const root = document.documentElement
    return {
      bubble: rect('.dico-burbuja'),
      native: rect('.dico-avisos-trigger'),
      topbar: rect('.ag-topbar'),
      bottomNav: rect('.ag-bottom-nav'),
      messageBeforeNative: Boolean(
        message
        && presence
        && (message.compareDocumentPosition(presence) & Node.DOCUMENT_POSITION_FOLLOWING),
      ),
      centerTail: document.querySelectorAll('.dico-burbuja--cola-centro').length,
      lateralTail: document.querySelectorAll('.dico-burbuja--cola-lateral').length,
      physicalCount: document.querySelectorAll('.dico-physical').length,
      accessibleSources: document.querySelectorAll('.dico-burbuja-lectura:not([aria-hidden="true"])').length,
      hiddenReserveSources: document.querySelectorAll('.dico-burbuja-reserva[aria-hidden="true"]').length,
      hiddenTypewriterSources: document.querySelectorAll('.dico-burbuja-texto[aria-hidden="true"]').length,
      scrollHeight: root.scrollHeight,
      scrollWidth: root.scrollWidth,
      clientWidth: root.clientWidth,
    }
  })
}

function stableBox(value: Awaited<ReturnType<typeof geometry>>) {
  return {
    bubble: value.bubble,
    native: value.native,
    scrollHeight: value.scrollHeight,
    scrollWidth: value.scrollWidth,
  }
}

for (const viewport of VIEWPORTS) {
  test(`mensaje Native estable en ${viewport.width}px`, async ({ page }) => {
    await openAdmin(page, 'light', { width: viewport.width, height: viewport.height })
    await freezeContinuousDecorativeMotion(page, {
      requireDicoMotion: true,
      surface: `admin--light--${viewport.width}x${viewport.height}`,
    })

    const trigger = page.locator('button.dico-avisos-trigger')
    await expect(trigger).toBeVisible()
    if (viewport.screenshots) await shot(page, `${viewport.name}-native-idle`)

    await trigger.click()
    await expect(trigger).toHaveAttribute('aria-expanded', 'true')
    const bubble = page.locator('.dico-burbuja')
    // El BOTON de contenido, que existe siempre. Antes se buscaba por el
    // nombre accesible "Completar mensaje de Dico", que solo existe MIENTRAS
    // tipea: el texto son 107 caracteres a 18ms, o sea 1,93s de margen, y una
    // maquina cargada lo agota. Que el tipeo sea progresivo y que el click lo
    // complete ya esta cubierto en `src/test/burbujaDico.test.jsx`, donde el
    // tiempo se controla; aca se afirma el contrato que SI es determinista.
    const control = page.locator('button.dico-burbuja-contenido')
    const visibleText = page.locator('.dico-burbuja-texto')
    const fullText = page.locator('.dico-burbuja-lectura')
    await expect(bubble).toBeVisible()
    await expect(control).toBeVisible()
    await expect(fullText).toHaveCount(1)

    const expectedText = (await fullText.textContent() || '').replace(/\s+/g, ' ').trim()
    expect(expectedText.length).toBeGreaterThan(0)
    expect((await visibleText.textContent() || '').length).toBeLessThan(expectedText.length)

    await page.evaluate(() => new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    }))
    const start = await geometry(page)
    if (viewport.screenshots) await shot(page, `${viewport.name}-notice-start`)
    await page.waitForTimeout(54)
    const middle = await geometry(page)

    expect(start.messageBeforeNative).toBe(true)
    // LA COLA SALE PARA EL LADO DONDE NO ESTA DICO. En desktop Dico vive en la
    // sidebar y el globo se abre hacia el workspace: una cola que baje
    // apuntaria al vacio. En mobile sigue encima del personaje.
    const enSidebar = viewport.width >= 769
    expect(start.centerTail, `${viewport.name}: colas centradas`).toBe(enSidebar ? 0 : 1)
    expect(start.lateralTail, `${viewport.name}: colas laterales`).toBe(enSidebar ? 1 : 0)
    expect(start.physicalCount).toBe(0)
    expect(start.accessibleSources).toBe(1)
    expect(start.hiddenReserveSources).toBe(1)
    expect(start.hiddenTypewriterSources).toBe(1)
    expect(start.native?.width).toBeGreaterThanOrEqual(44)
    expect(start.native?.height).toBeGreaterThanOrEqual(44)
    expect(start.bubble?.left).toBeGreaterThanOrEqual(0)
    expect(start.bubble?.right).toBeLessThanOrEqual(start.clientWidth)
    expect(start.scrollWidth).toBeLessThanOrEqual(start.clientWidth)
    if (start.topbar && start.bubble) expect(start.bubble.top).toBeGreaterThanOrEqual(start.topbar.bottom)
    if (start.bottomNav && start.native) expect(start.native.bottom).toBeLessThanOrEqual(start.bottomNav.top)
    expect(stableBox(middle)).toEqual(stableBox(start))

    // Saltear la escritura, SI todavia hay algo que saltear.
    //
    // El boton solo existe mientras el typewriter corre: al terminar pierde su
    // nombre accesible y el `tabIndex` pasa a -1, justamente para que no quede
    // un control fantasma. En una maquina cargada los pasos de arriba tardan
    // mas que la escritura y el boton ya no esta: el spec quedaba esperando
    // hasta el timeout un elemento que hizo bien en desaparecer.
    //
    // El contrato real es el estado final —texto entero, sin cursor, misma
    // geometria— y se llega igual por las dos vias. La via del click se sigue
    // ejercitando cuando hay tiempo de tomarla.
    if (await control.count() > 0) {
      await control.click()
    } else {
      await expect(page.locator('.dico-burbuja-contenido')).toHaveAttribute('tabindex', '-1')
    }
    await expect(visibleText).toHaveText(expectedText)
    await expect(page.locator('.dico-burbuja-cursor')).toHaveCount(0)
    const complete = await geometry(page)
    expect(stableBox(complete)).toEqual(stableBox(start))
    if (viewport.screenshots) await shot(page, `${viewport.name}-notice-complete`)

    const root = outputRoot()
    await mkdir(root, { recursive: true })
    await writeFile(
      join(root, `${viewport.name}-geometry.json`),
      `${JSON.stringify({ viewport, start, middle, complete }, null, 2)}\n`,
      'utf8',
    )
  })
}
