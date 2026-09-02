import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test, expect, aplicarMovimiento } from './fixtures'
import { DESKTOP, openAdmin } from './surfaces'

/**
 * Las ocho poses sobre la app real: que cambiar de pose NO mueva la caja.
 *
 * Es la propiedad que el brief pide garantizar y la unica que no se puede
 * probar en jsdom, que no hace layout.
 */
const SALIDA = join(process.cwd(), '.qa-lite', 'artifacts', 'physical-poses')

const POSES = ['idle', 'explain', 'pointDown', 'pointUp', 'thinking', 'worried', 'success', 'error'] as const

test('las ocho poses comparten caja, escala y anclaje', async ({ page }) => {
  await aplicarMovimiento(page, 'no-preference')
  await openAdmin(page, 'light', DESKTOP)
  await mkdir(SALIDA, { recursive: true })

  // Traer a Physical al plano por el camino real: click en Dico 2D.
  await page.getByRole('button', { name: 'Traer a Dico' }).click()
  await expect(page.locator('.dico-pose')).toHaveCount(1)
  await expect.poll(() => page.evaluate(() => (
    document.querySelector('[data-dico-presence-state]')?.getAttribute('data-dico-presence-state')
  ))).toBe('physical_open')

  // QUE PRUEBA ESTE SPEC, Y QUE NO.
  //
  // Prueba la GEOMETRIA en un navegador de verdad: que cambiar el asset no
  // mueva la caja, no la reescale y no genere overflow. Eso jsdom no lo puede
  // decir porque no hace layout.
  //
  // NO prueba el mapeo pose->asset, el cruce ni reduced motion: eso vive en
  // `src/test/dicoPhysical.test.jsx`, donde se controla el tiempo. Todavia no
  // hay productor de poses —conectar eventos del POS es el lote siguiente—,
  // asi que se cambia el `src` de la capa directamente. Es honesto para lo que
  // se mide: la caja no depende de quien puso el src.
  const medir = () => page.evaluate(() => {
    const pose = document.querySelector('.dico-pose') as HTMLElement | null
    const capa = document.querySelector('.dico-pose-capa--actual') as HTMLImageElement | null
    if (!pose || !capa) return null
    const c = pose.getBoundingClientRect()
    const i = capa.getBoundingClientRect()
    return {
      caja: { x: +c.x.toFixed(2), y: +c.y.toFixed(2), w: +c.width.toFixed(2), h: +c.height.toFixed(2) },
      capa: { x: +i.x.toFixed(2), y: +i.y.toFixed(2), w: +i.width.toFixed(2), h: +i.height.toFixed(2) },
      src: capa.getAttribute('src'),
      natural: `${capa.naturalWidth}x${capa.naturalHeight}`,
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    }
  })

  const base = await medir()
  expect(base, 'Physical no llego al DOM').not.toBeNull()
  expect(base!.natural, 'el asset no cargo con su tamanio real').toBe('1600x1136')

  const filas: Array<Record<string, unknown>> = []
  for (const pose of POSES) {
    await page.evaluate((p) => {
      const capa = document.querySelector('.dico-pose-capa--actual') as HTMLImageElement
      const guiones = p.replace(/[A-Z]/g, (c: string) => `-${c.toLowerCase()}`)
      capa.src = `/brand/dico/physical/dico-3d-${guiones}.webp`
    }, pose)
    await page.waitForFunction(() => {
      const c = document.querySelector('.dico-pose-capa--actual') as HTMLImageElement
      return c && c.complete && c.naturalWidth > 0
    })
    const m = await medir()
    // Donde queda la TINTA en pantalla, que es lo que se ve. La caja tiene
    // margen transparente y medirla sola no dice si el personaje pisa el riel.
    const tinta = await page.evaluate(() => {
      const capa = document.querySelector('.dico-pose-capa--actual') as HTMLImageElement
      const c = document.createElement('canvas')
      c.width = capa.naturalWidth; c.height = capa.naturalHeight
      const ctx = c.getContext('2d', { willReadFrequently: true })!
      ctx.drawImage(capa, 0, 0)
      const d = ctx.getImageData(0, 0, c.width, c.height).data
      let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1
      for (let y = 0; y < c.height; y += 2) for (let x = 0; x < c.width; x += 2) {
        if (d[(y * c.width + x) * 4 + 3] < 8) continue
        if (x < minX) minX = x; if (x > maxX) maxX = x
        if (y < minY) minY = y; if (y > maxY) maxY = y
      }
      const caja = capa.getBoundingClientRect()
      const sidebar = document.querySelector('.ag-sidebar')?.getBoundingClientRect()
      return {
        izquierda: +(caja.x + (minX / c.width) * caja.width).toFixed(1),
        arriba: +(caja.y + (minY / c.height) * caja.height).toFixed(1),
        derecha: +(caja.x + ((maxX + 1) / c.width) * caja.width).toFixed(1),
        abajo: +(caja.y + ((maxY + 1) / c.height) * caja.height).toFixed(1),
        rielHasta: sidebar ? +sidebar.width.toFixed(1) : 0,
      }
    })
    filas.push({ pose, ...m, tinta })

    // Ninguna pose puede pisar la sidebar ni salirse por arriba.
    expect(tinta.izquierda, `${pose} pisa la sidebar (riel ${tinta.rielHasta})`).toBeGreaterThanOrEqual(tinta.rielHasta)
    expect(tinta.arriba, `${pose} se corta por arriba`).toBeGreaterThanOrEqual(0)

    expect(m!.caja, `${pose} movio la caja`).toEqual(base!.caja)
    expect(m!.capa, `${pose} movio o reescalo la capa`).toEqual(base!.capa)
    expect(m!.natural, `${pose} tiene otro canvas`).toBe('1600x1136')
    expect(m!.overflowX, `${pose} produjo scroll horizontal`).toBe(false)
    await page.screenshot({ path: join(SALIDA, `pose-${pose}.png`), caret: 'hide' })
  }

  // ── MOBILE ──────────────────────────────────────────────────────────────
  // A 390px no hay sidebar: el Slot vive en el flujo, dentro de un `.ag-slot`
  // con `overflow: hidden`. La caja de 448 no entra, pero la TINTA si —lo unico
  // que se recorta es el margen transparente—. Es el caso mas ajustado, asi que
  // se mide con `explain`, la pose mas ancha.
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(320)
  await page.evaluate(() => {
    const capa = document.querySelector('.dico-pose-capa--actual') as HTMLImageElement
    capa.src = '/brand/dico/physical/dico-3d-explain.webp'
  })
  await page.waitForFunction(() => {
    const c = document.querySelector('.dico-pose-capa--actual') as HTMLImageElement
    return Boolean(c && c.complete && c.naturalWidth > 0)
  })
  const enMobile = await page.evaluate(() => {
    const capa = document.querySelector('.dico-pose-capa--actual') as HTMLImageElement
    const c = document.createElement('canvas')
    c.width = capa.naturalWidth; c.height = capa.naturalHeight
    const ctx = c.getContext('2d', { willReadFrequently: true })!
    ctx.drawImage(capa, 0, 0)
    const d = ctx.getImageData(0, 0, c.width, c.height).data
    let minX = 1e9; let maxX = -1
    for (let y = 0; y < c.height; y += 2) {
      for (let x = 0; x < c.width; x += 2) {
        if (d[(y * c.width + x) * 4 + 3] < 8) continue
        if (x < minX) minX = x
        if (x > maxX) maxX = x
      }
    }
    const caja = capa.getBoundingClientRect()
    // Lo que recorta de verdad es el ancestro con `overflow: hidden`.
    const recorte = document.querySelector('.ag-slot')?.getBoundingClientRect()
    return {
      tintaIzq: +(caja.x + (minX / c.width) * caja.width).toFixed(1),
      tintaDer: +(caja.x + ((maxX + 1) / c.width) * caja.width).toFixed(1),
      recorte: recorte ? { x: +recorte.x.toFixed(1), fin: +(recorte.x + recorte.width).toFixed(1) } : null,
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      navInferior: Boolean(document.querySelector('.ag-bottom-nav')),
    }
  })
  await page.screenshot({ path: join(SALIDA, 'mobile-explain.png'), caret: 'hide' })
  console.log(`mobile 390: ${JSON.stringify(enMobile)}`)

  expect(enMobile.overflowX, 'mobile con scroll horizontal').toBe(false)
  if (enMobile.recorte) {
    expect(enMobile.tintaIzq, 'la tinta se corta por izquierda en mobile')
      .toBeGreaterThanOrEqual(enMobile.recorte.x)
    expect(enMobile.tintaDer, 'la tinta se corta por derecha en mobile')
      .toBeLessThanOrEqual(enMobile.recorte.fin)
  }

  await writeFile(join(SALIDA, 'poses.json'), `${JSON.stringify({ escritorio: filas, mobile: enMobile }, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify(filas.map((f) => ({ pose: f.pose, caja: f.caja })), null, 2))
})
