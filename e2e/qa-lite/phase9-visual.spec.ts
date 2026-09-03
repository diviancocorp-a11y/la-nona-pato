import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test, expect, aplicarMovimiento } from './fixtures'
import { DESKTOP, localStatusFromEnv, openAdmin } from './surfaces'
import { applyFixtureState } from '../../platform/qa-lite/state.mjs'

/**
 * Phase 9 — cierre visual de los dos casos Physical implementados.
 *
 * No prueba logica: eso ya esta en `dicoIntervenciones` y `dico-intervenciones`.
 * Mide la ESCENA: personaje, Slot, burbuja y CTA, su relacion espacial, y si
 * algo se corta o se pisa en viewports reales.
 */
const SALIDA = join(process.cwd(), '.qa-lite', 'artifacts', 'phase9')

const VIEWPORTS = [
  { nombre: '1440x1000', w: 1440, h: 1000 },
  { nombre: '1440x800', w: 1440, h: 800 },
  { nombre: '1280x720', w: 1280, h: 720 },
  { nombre: '1024x768', w: 1024, h: 768 },
  { nombre: '900x700', w: 900, h: 700 },
  { nombre: '768x1024', w: 768, h: 1024 },
  { nombre: '390x844', w: 390, h: 844 },
] as const

/** La escena completa: los cuatro elementos y donde esta la tinta. */
const medirEscena = (page: import('@playwright/test').Page) => page.evaluate(() => {
  const caja = (sel: string) => {
    const e = document.querySelector(sel)
    if (!e) return null
    const b = e.getBoundingClientRect()
    return {
      x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1),
      der: +(b.x + b.width).toFixed(1), abajo: +(b.y + b.height).toFixed(1),
    }
  }
  const capa = document.querySelector('.dico-pose-capa--actual') as HTMLImageElement | null
  let tinta = null
  if (capa && capa.naturalWidth) {
    const c = document.createElement('canvas')
    c.width = capa.naturalWidth; c.height = capa.naturalHeight
    const ctx = c.getContext('2d', { willReadFrequently: true })!
    ctx.drawImage(capa, 0, 0)
    const d = ctx.getImageData(0, 0, c.width, c.height).data
    let minX = 1e9; let minY = 1e9; let maxX = -1; let maxY = -1
    for (let y = 0; y < c.height; y += 2) {
      for (let x = 0; x < c.width; x += 2) {
        if (d[(y * c.width + x) * 4 + 3] < 8) continue
        if (x < minX) minX = x; if (x > maxX) maxX = x
        if (y < minY) minY = y; if (y > maxY) maxY = y
      }
    }
    const b = capa.getBoundingClientRect()
    tinta = {
      x: +(b.x + (minX / c.width) * b.width).toFixed(1),
      y: +(b.y + (minY / c.height) * b.height).toFixed(1),
      der: +(b.x + ((maxX + 1) / c.width) * b.width).toFixed(1),
      abajo: +(b.y + ((maxY + 1) / c.height) * b.height).toFixed(1),
    }
  }
  return {
    pose: document.querySelector('[data-dico-physical]')?.getAttribute('data-dico-physical') || null,
    intervencion: document.querySelector('[data-dico-intervencion]')?.getAttribute('data-dico-intervencion') || '',
    dicos: {
      physical: document.querySelectorAll('.dico-pose').length,
      escena2D: document.querySelectorAll('.dico-cuadro--core').length,
      native: document.querySelectorAll('[data-dico-native]').length,
    },
    caja: caja('.dico-pose'),
    tinta,
    ranura: caja('button.dico-slot-control'),
    burbuja: caja('.dico-burbuja'),
    cta: caja('.dico-cuadro-accion'),
    sidebar: caja('.ag-sidebar'),
    viewport: { w: window.innerWidth, h: window.innerHeight },
    overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  }
})

/* ORDEN: `nada visible` va PRIMERO. El caso de catalogo vacio borra los
 * productos del tenant y el estado no se restaura entre tests del mismo
 * archivo, asi que invertirlos dejaba al segundo sin datos. */
test('nada visible: la escena completa', async ({ page }) => {
  await aplicarMovimiento(page, 'no-preference')
  await openAdmin(page, 'light', DESKTOP)
  await mkdir(SALIDA, { recursive: true })
  await page.getByRole('button', { name: /^Productos/ }).click()
  await page.waitForTimeout(500)

  const cuantos = await page.getByRole('button', { name: 'Ocultar' }).count()
  expect(cuantos, 'no hay productos visibles que apagar').toBeGreaterThan(0)
  for (let i = 0; i < cuantos; i += 1) {
    await page.getByRole('button', { name: 'Ocultar' }).first().click()
    await page.waitForTimeout(200)
  }
  await expect(page.locator('.dico-pose')).toHaveCount(1)

  const filas: Array<Record<string, unknown>> = []
  for (const v of VIEWPORTS) {
    await page.setViewportSize({ width: v.w, height: v.h })
    await page.waitForTimeout(450)
    filas.push({ viewport: v.nombre, ...(await medirEscena(page)) })
    await page.screenshot({ path: join(SALIDA, `nada-visible-${v.nombre}.png`), caret: 'hide' })
  }
  await writeFile(join(SALIDA, 'nada-visible.json'), `${JSON.stringify(filas, null, 2)}\n`, 'utf8')

  const problemas = filas.flatMap((f) => {
    const vp = `${(f.viewport as { w: number }).w}x${(f.viewport as { h: number }).h}`
    const b = f.burbuja as { der: number } | null
    const salidas: string[] = []
    if (f.overflowX) salidas.push(`${vp}: overflow horizontal`)
    if (b && b.der > (f.viewport as { w: number }).w) {
      salidas.push(`${vp}: la burbuja se sale ${(b.der - (f.viewport as { w: number }).w).toFixed(0)}px`)
    }
    return salidas
  })
  await writeFile(join(SALIDA, 'nada-visible-problemas.json'),
    `${JSON.stringify(problemas, null, 2)}
`, 'utf8')
  expect(problemas, 'defectos visuales en nada-visible').toEqual([])
})

test('catalogo vacio: la escena completa en viewports reales', async ({ page }) => {
  await aplicarMovimiento(page, 'no-preference')
  // Se entra al panel CON datos y recien despues se vacia: `openAdmin` exige el
  // contador de avisos y la tarjeta de oportunidades, y con el catalogo vacio
  // ninguno de los dos existe —la intervencion saca a Physical y `DicoAvisos`
  // deja de montarse—. No es un bug del producto, es el orden que necesita el
  // helper.
  await openAdmin(page, 'light', DESKTOP)
  await mkdir(SALIDA, { recursive: true })

  // Catalogo REALMENTE vacio, no simulado: el helper borra pedidos y productos
  // del tenant de QA.
  await applyFixtureState('empty', localStatusFromEnv())
  await page.reload()
  await expect(page.locator('.ag-root')).toBeVisible()
  await page.getByRole('button', { name: /^Productos/ }).click()
  await page.waitForTimeout(800)

  const filas: Array<Record<string, unknown>> = []
  for (const v of VIEWPORTS) {
    await page.setViewportSize({ width: v.w, height: v.h })
    await page.waitForTimeout(450)
    const m = await medirEscena(page)
    filas.push({ viewport: v.nombre, ...m })
    await page.screenshot({ path: join(SALIDA, `vacio-${v.nombre}.png`), caret: 'hide' })
  }
  await writeFile(join(SALIDA, 'catalogo-vacio.json'), `${JSON.stringify(filas, null, 2)}\n`, 'utf8')

  // Auditoria: se recolecta TODO y se juzga al final. Fallar en el primer
  // viewport perderia la evidencia de los otros seis, que es justo lo que se
  // vino a buscar.
  const problemas = filas.flatMap((f) => {
    const vp = `${(f.viewport as { w: number }).w}x${(f.viewport as { h: number }).h}`
    const d = f.dicos as { physical: number; escena2D: number }
    const b = f.burbuja as { x: number; der: number } | null
    const salidas: string[] = []
    if (d.escena2D > 0 && d.physical > 0) salidas.push(`${vp}: dos Dicos`)
    if (f.overflowX) salidas.push(`${vp}: overflow horizontal`)
    if (b && b.der > (f.viewport as { w: number }).w) {
      salidas.push(`${vp}: la burbuja se sale ${(b.der - (f.viewport as { w: number }).w).toFixed(0)}px`)
    }
    return salidas
  })
  await writeFile(join(SALIDA, 'catalogo-vacio-problemas.json'),
    `${JSON.stringify(problemas, null, 2)}
`, 'utf8')
  expect(problemas, 'defectos visuales en catalogo vacio').toEqual([])
})
