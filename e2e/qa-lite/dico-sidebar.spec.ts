import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test, expect } from './fixtures'
import { openAdmin } from './surfaces'

/**
 * La sidebar desktop en los anchos que importan, sobre el panel real.
 *
 * Lo que se verifica en cada uno no es "se ve bien" sino cuatro propiedades
 * medibles: que no aparezca scroll horizontal, que expandir no mueva los
 * iconos, que los targets lleguen a 44 con la sidebar colapsada, y que
 * SIEMPRE haya una navegacion —una y solo una— disponible.
 */
const SALIDA = join(process.cwd(), '.qa-lite', 'artifacts', 'phase-b6r-sidebar', 'shell')

const ANCHOS = [
  { w: 1440, h: 900, chasis: 'sidebar' },
  { w: 1280, h: 860, chasis: 'sidebar' },
  { w: 1024, h: 820, chasis: 'sidebar' },
  { w: 900, h: 800, chasis: 'sidebar' },
  { w: 768, h: 800, chasis: 'nav-inferior' },   // la frontera: 768 es mobile
  { w: 390, h: 844, chasis: 'nav-inferior' },
] as const

test.use({ reducedMotion: 'no-preference' })

test('la sidebar desktop se sostiene en los seis anchos', async ({ page }) => {
  await openAdmin(page, 'light', { width: 1440, height: 900 })
  await mkdir(SALIDA, { recursive: true })
  const informe: Record<string, unknown>[] = []

  for (const { w, h, chasis } of ANCHOS) {
    await page.setViewportSize({ width: w, height: h })
    await page.waitForTimeout(320)

    const visible = (sel: string) => page.locator(sel).evaluate((el) => {
      const b = el.getBoundingClientRect()
      return b.width > 0 && b.height > 0 && getComputedStyle(el).display !== 'none'
    }).catch(() => false)

    const sidebarViva = await visible('.ag-sidebar')
    const navInferiorViva = await visible('.ag-bottom-nav')

    // UNA Y SOLO UNA. Que las dos convivan seria ruido; que no haya ninguna
    // dejaria al usuario sin forma de moverse.
    expect(sidebarViva !== navInferiorViva, `${w}px: sidebar=${sidebarViva} navInferior=${navInferiorViva}`).toBe(true)
    expect(sidebarViva ? 'sidebar' : 'nav-inferior', `${w}px eligio el chasis equivocado`).toBe(chasis)

    const overflow = await page.evaluate(() => (
      document.documentElement.scrollWidth > document.documentElement.clientWidth
    ))
    expect(overflow, `${w}px tiene scroll horizontal`).toBe(false)

    const medir = () => page.evaluate(() => {
      const caja = (el: Element) => { const b = el.getBoundingClientRect(); return { x: +b.x.toFixed(2), y: +b.y.toFixed(2), w: +b.width.toFixed(2), h: +b.height.toFixed(2) } }
      const sel = (s: string) => [...document.querySelectorAll(s)].map(caja)
      return {
        iconos: sel('.ag-sidebar-icono'),
        itemsNav: sel('.ag-nav-item'),
        ancho: document.querySelector('.ag-sidebar')?.getBoundingClientRect().width || 0,
      }
    })

    const fila: Record<string, unknown> = { ancho: w, chasis, overflow }

    if (sidebarViva) {
      const antes = await medir()
      // Los targets tienen que cumplir 44 EN COLAPSADO, que es el estado normal.
      const chicos = antes.iconos.filter((i) => i.w < 44 || i.h < 44)
      expect(chicos, `${w}px: ${chicos.length} targets por debajo de 44`).toEqual([])

      await page.locator('.ag-sidebar').hover()
      await page.waitForTimeout(320)
      const despues = await medir()
      const movidos = antes.iconos.filter((c, i) => (
        despues.iconos[i] && (despues.iconos[i].x !== c.x || despues.iconos[i].y !== c.y)
      ))
      expect(movidos, `${w}px: ${movidos.length} iconos se movieron al expandir`).toEqual([])
      expect(despues.ancho, `${w}px no expandio`).toBeGreaterThan(antes.ancho)

      await page.screenshot({ path: join(SALIDA, `${w}-expandida.png`), caret: 'hide' })
      await page.mouse.move(w - 40, h - 40)
      await page.waitForTimeout(320)
      // Salir hacia el workspace la vuelve a colapsar.
      const alSalir = await medir()
      expect(alSalir.ancho, `${w}px quedo expandida al salir`).toBe(antes.ancho)
      await page.screenshot({ path: join(SALIDA, `${w}-colapsada.png`), caret: 'hide' })

      // Foco de teclado: expande igual que el hover.
      await page.locator('.ag-sidebar-item').first().focus()
      await page.waitForTimeout(320)
      const conFoco = await medir()
      expect(conFoco.ancho, `${w}px no expande con foco de teclado`).toBeGreaterThan(antes.ancho)
      await page.screenshot({ path: join(SALIDA, `${w}-foco.png`), caret: 'hide' })
      await page.locator('.ag-sidebar-item').first().blur()

      fila.iconos = antes.iconos.length
      fila.rielPx = antes.ancho
      fila.abiertaPx = despues.ancho
    } else {
      const items = (await medir()).itemsNav
      const chicos = items.filter((i) => i.w < 44 || i.h < 44)
      expect(chicos, `${w}px: ${chicos.length} items de nav inferior por debajo de 44`).toEqual([])
      fila.itemsNav = items.length
      await page.screenshot({ path: join(SALIDA, `${w}-mobile.png`), caret: 'hide' })
    }

    // La navegacion nunca se pierde: las secciones son las mismas.
    const secciones = await page.evaluate(() => (
      [...document.querySelectorAll('[data-section]')].map((e) => (e as HTMLElement).dataset.section)
    ))
    expect(secciones.length, `${w}px se quedo sin secciones`).toBeGreaterThan(0)
    fila.secciones = secciones.length
    informe.push(fila)
  }

  await writeFile(join(SALIDA, 'informe.json'), `${JSON.stringify(informe, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify(informe, null, 2))
})
