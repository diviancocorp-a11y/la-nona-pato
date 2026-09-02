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
      //
      // Con TAB de verdad, no `.focus()` por script: `:focus-visible` —que es
      // lo que dibuja el anillo— no matchea cuando el foco lo pone el codigo,
      // asi que una captura hecha asi mostraria la sidebar abierta y sin
      // anillo, y no probaria nada sobre navegacion por teclado.
      await page.locator('body').click({ position: { x: w - 40, y: h - 40 } }).catch(() => {})
      let pasos = 0
      let dentro = false
      while (pasos < 40 && !dentro) {
        await page.keyboard.press('Tab')
        pasos += 1
        dentro = await page.evaluate(() => Boolean(
          document.activeElement?.closest('.ag-sidebar-item'),
        ))
      }
      expect(dentro, `${w}px: no se llega a la sidebar con Tab en 40 pasos`).toBe(true)
      await page.waitForTimeout(320)
      const conFoco = await medir()
      expect(conFoco.ancho, `${w}px no expande con foco de teclado`).toBeGreaterThan(antes.ancho)

      // Y el anillo se ve: expandirse sin marcar donde esta el foco deja al
      // usuario de teclado sin saber que item va a activar.
      const anillo = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null
        if (!el) return null
        const s = getComputedStyle(el)
        return { estilo: s.outlineStyle, ancho: s.outlineWidth, color: s.outlineColor }
      })
      expect(anillo?.estilo, `${w}px: el item con foco no dibuja anillo`).not.toBe('none')
      await page.screenshot({ path: join(SALIDA, `${w}-foco.png`), caret: 'hide' })
      fila.anilloDeFoco = `${anillo?.estilo} ${anillo?.ancho}`
      await page.evaluate(() => (document.activeElement as HTMLElement)?.blur())

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

    // ── DICO NO LE SACA CAPACIDADES A LA NAVEGACION ──────────────────────
    // Con el aviso abierto y con Physical afuera, la sidebar tiene que seguir
    // expandiendose —por hover Y por teclado— y Dico tiene que correrse solo.
    if (sidebarViva) {
      const anchoDe = () => page.locator('.ag-sidebar').evaluate((el) => el.getBoundingClientRect().width)
      const izquierdaDe = (sel: string) => page.locator(sel).evaluate((el) => (
        +el.getBoundingClientRect().x.toFixed(1)
      )).catch(() => null)
      const alejar = async () => { await page.mouse.move(w - 40, h - 40); await page.waitForTimeout(300) }

      await alejar()
      const riel = await anchoDe()

      // 1. Con el aviso abierto.
      await page.locator('button.dico-avisos-trigger').click()
      await expect(page.locator('.dico-burbuja')).toBeVisible()
      // Alejar el mouse ANTES de medir: clickear el contador lo deja sobre la
      // sidebar, o sea expandida, y el "colapsado" saldria ya corrido.
      await alejar()
      const globoColapsada = await izquierdaDe('.dico-avisos-mensaje')
      await page.locator('.ag-sidebar').hover()
      await page.waitForTimeout(360)
      const anchoConAviso = await anchoDe()
      expect(anchoConAviso, `${w}px: no expande con el aviso abierto`).toBeGreaterThan(riel)
      const globoExpandida = await izquierdaDe('.dico-avisos-mensaje')
      expect(globoExpandida, `${w}px: el globo no se corrio`).toBeGreaterThan(globoColapsada as number)
      expect(globoExpandida, `${w}px: el globo quedo adentro del area expandida`)
        .toBeGreaterThanOrEqual(anchoConAviso - 1)
      // Y los rotulos siguen visibles: no se apagan por culpa del aviso.
      expect(await page.locator('.ag-sidebar-label').first().evaluate((el) => (
        Number(getComputedStyle(el).opacity)
      )), `${w}px: el aviso apago los rotulos`).toBeGreaterThan(0.9)
      await page.screenshot({ path: join(SALIDA, `${w}-aviso-expandida.png`), caret: 'hide' })

      // 2. Con Physical afuera. El click en Dico cierra el aviso y lo invoca.
      await page.getByRole('button', { name: 'Traer a Dico' }).click()
      await expect(page.locator('.dico-physical')).toHaveCount(1)
      await expect.poll(() => page.evaluate(() => (
        document.querySelector('[data-dico-presence-state]')?.getAttribute('data-dico-presence-state')
      ))).toBe('physical_open')
      await alejar()
      const physicalColapsada = await izquierdaDe('.dico-slot')
      await page.locator('.ag-sidebar').hover()
      await page.waitForTimeout(360)
      const anchoConPhysical = await anchoDe()
      expect(anchoConPhysical, `${w}px: no expande con Physical afuera`).toBeGreaterThan(riel)
      const physicalExpandida = await izquierdaDe('.dico-slot')
      expect(physicalExpandida, `${w}px: Physical no se reanclo`).toBeGreaterThan(physicalColapsada as number)
      expect(physicalExpandida, `${w}px: Physical quedo adentro del area expandida`)
        .toBeGreaterThanOrEqual(anchoConPhysical - 1)
      await page.screenshot({ path: join(SALIDA, `${w}-physical-expandida.png`), caret: 'hide' })

      // 3. Teclado CON Physical afuera: la sidebar responde igual.
      await alejar()
      let saltos = 0
      let enSidebar = false
      while (saltos < 40 && !enSidebar) {
        await page.keyboard.press('Tab')
        saltos += 1
        enSidebar = await page.evaluate(() => Boolean(document.activeElement?.closest('.ag-sidebar-item')))
      }
      expect(enSidebar, `${w}px: con Physical afuera no se llega a la sidebar con Tab`).toBe(true)
      await page.waitForTimeout(320)
      expect(await anchoDe(), `${w}px: con Physical afuera el teclado no expande`).toBeGreaterThan(riel)
      await page.screenshot({ path: join(SALIDA, `${w}-teclado-physical.png`), caret: 'hide' })

      // Guardar a Physical y volver al estado limpio para el proximo ancho.
      await page.evaluate(() => (document.activeElement as HTMLElement)?.blur())
      await page.locator('button.dico-slot-control').click()
      await expect.poll(() => page.evaluate(() => (
        document.querySelector('[data-dico-presence-state]')?.getAttribute('data-dico-presence-state')
      ))).toBe('native_idle')
      await alejar()
      fila.expandeConAviso = anchoConAviso
      fila.expandeConPhysical = anchoConPhysical
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
