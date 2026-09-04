import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test, expect, aplicarMovimiento } from './fixtures'
import { DESKTOP, localStatusFromEnv, openAdmin, irAProductos, apagarTodo } from './surfaces'
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
  // La frontera contractual (`admin-sidebar.css`): 769 todavia es desktop,
  // 768 ya es el flujo mobile. Catalogo-vacio se comporta distinto a cada
  // lado, asi que hace falta medir el borde exacto y no solo aproximarlo.
  { nombre: '769x1024', w: 769, h: 1024 },
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
  /* PASS 3 — el mismo helper que usan los otros gates de Dico, en vez de un
     bucle propio. Ademas de sacar la duplicacion, `apagarTodo` se cura solo:
     si otro spec ya dejo el catalogo apagado, lo prende antes de volver a
     apagarlo. Con el bucle propio este test dependia de correr antes que
     `dico-intervenciones`, que se va dejando todo oculto — y eso lo hacia
     fallar por el ORDEN de los archivos, no por un defecto. */
  await irAProductos(page)
  await apagarTodo(page)
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
    const vpObj = f.viewport as { w: number; h: number }
    const vp = `${vpObj.w}x${vpObj.h}`
    const b = f.burbuja as { der: number } | null
    const tinta = f.tinta as { x: number; der: number } | null
    const salidas: string[] = []
    if (f.overflowX) salidas.push(`${vp}: overflow horizontal`)
    if (f.pose !== 'worried') salidas.push(`${vp}: la pose no es worried (${f.pose})`)
    // Se mide la TINTA, no la caja completa: la caja de 448px trae margen
    // transparente y a 390px es mas ancha que el viewport a proposito —lo
    // recorta `.ag-slot` con `overflow:hidden`, que es quien prueba esto de
    // verdad en `dico-physical-poses.spec.ts`—. Lo que importa es que el
    // personaje QUE SE VE no se corte.
    if (tinta && (tinta.x < -5 || tinta.der > vpObj.w + 5)) {
      salidas.push(`${vp}: el personaje se corta`)
    }
    if (b && b.der > vpObj.w) {
      salidas.push(`${vp}: la burbuja se sale ${(b.der - vpObj.w).toFixed(0)}px`)
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
  // Cruce 768 <-> 769 en las dos direcciones. `DicoPresence` se REMONTA en
  // esa frontera (sidebar vs flujo), asi que es donde mas facil aparecen dos
  // Dicos o una presencia huerfana. El loop de arriba ya cruzo BAJANDO (900 ->
  // 769 -> 768 -> 390); esto prueba el sentido que falta, SUBIENDO.
  await page.setViewportSize({ width: 769, height: 1024 })
  await page.waitForTimeout(450)
  const subiendo = await medirEscena(page)
  filas.push({ viewport: '769x1024 (subiendo)', ...subiendo })

  await writeFile(join(SALIDA, 'catalogo-vacio.json'), `${JSON.stringify(filas, null, 2)}\n`, 'utf8')

  expect(
    subiendo.dicos.escena2D === 0 || subiendo.dicos.physical === 0,
    'dos Dicos al subir de 768 a 769',
  ).toBe(true)
  expect(subiendo.dicos.physical, 'Physical no volvio al subir a 769').toBe(1)
  expect(subiendo.dicos.escena2D, 'la escena 2D quedo huerfana al subir a 769').toBe(0)
  expect(subiendo.pose, 'la pose no es pointDown al subir a 769').toBe('pointDown')

  // Auditoria: se recolecta TODO y se juzga al final. Fallar en el primer
  // viewport perderia la evidencia de los otros seis, que es justo lo que se
  // vino a buscar.
  const problemas = filas.flatMap((f) => {
    const vpObj = f.viewport as { w: number; h: number }
    const vp = `${vpObj.w}x${vpObj.h}`
    const angosto = vpObj.w <= 768
    const d = f.dicos as { physical: number; escena2D: number }
    const b = f.burbuja as { x: number; der: number } | null
    const tinta = f.tinta as { x: number; der: number } | null
    const cta = f.cta as { x: number; der: number } | null
    const salidas: string[] = []

    if (d.escena2D > 0 && d.physical > 0) salidas.push(`${vp}: dos Dicos`)
    if (f.overflowX) salidas.push(`${vp}: overflow horizontal`)
    if (!cta) salidas.push(`${vp}: no hay CTA`)
    else if (cta.der > vpObj.w) salidas.push(`${vp}: el CTA se corta ${(cta.der - vpObj.w).toFixed(0)}px`)

    if (angosto) {
      // <=768: Physical NO monta para catalogo-vacio (el objetivo no tiene
      // los ~247px que pointDown necesita arriba). Se conserva la escena
      // Native 2D de siempre — un solo Dico, el CTA sigue ahi y usable.
      if (d.physical > 0) salidas.push(`${vp}: Physical monto por debajo de 769px`)
      if (d.escena2D === 0) salidas.push(`${vp}: no aparecio la escena Native 2D`)
    } else {
      // >=769: Physical con pointDown, target real —el dedo cae DENTRO del
      // CTA—, personaje completo, burbuja completa.
      if (d.physical === 0) salidas.push(`${vp}: Physical no salio`)
      if (f.pose !== 'pointDown') salidas.push(`${vp}: la pose no es pointDown (${f.pose})`)
      // Se mide la TINTA, no la caja: mismo criterio que en nada-visible.
      if (tinta && (tinta.x < -5 || tinta.der > vpObj.w + 5)) {
        salidas.push(`${vp}: el personaje se corta`)
      }
      if (b && b.der > vpObj.w) {
        salidas.push(`${vp}: la burbuja se sale ${(b.der - vpObj.w).toFixed(0)}px`)
      }
      if (cta && tinta) {
        const dedoSobreCta = tinta.der > cta.x && tinta.x < cta.der
        if (!dedoSobreCta) salidas.push(`${vp}: el dedo no cae sobre el CTA`)
      }
    }
    return salidas
  })
  await writeFile(join(SALIDA, 'catalogo-vacio-problemas.json'),
    `${JSON.stringify(problemas, null, 2)}
`, 'utf8')
  expect(problemas, 'defectos visuales en catalogo vacio').toEqual([])
})
