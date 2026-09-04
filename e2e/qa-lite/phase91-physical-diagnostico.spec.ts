import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test, aplicarMovimiento } from './fixtures'
import { openAdmin, DESKTOP, irAProductos, apagarTodo, anotarVisibilidad, restaurarVisibilidad } from './surfaces'

/**
 * PHASE 9.1 — diagnostico, no correccion.
 *
 * El veredicto visual dejo dos cosas sin aprobar sobre Physical:
 *
 *   (3) empuja la pantalla de Productos hacia abajo, como si viviera en la
 *       misma capa que el contenido;
 *   (4) sigue acoplado a la sidebar, y el loop de abrir/cerrar reaparece al
 *       pasar el mouse.
 *
 * Este spec no arregla ninguna de las dos: las MIDE, para que el brief de 9.1
 * arranque de numeros y no de una impresion. Escribe un JSON y no falla por
 * los defectos que encuentra — falla solo si no logra medirlos.
 */
const SALIDA = join(process.cwd(), '.qa-lite', 'artifacts', 'phase91')

test('cuanto empuja Physical y que le queda atado a la sidebar', async ({ page }) => {
  await aplicarMovimiento(page, 'no-preference')
  await mkdir(SALIDA, { recursive: true })
  await openAdmin(page, 'dark', DESKTOP)
  await irAProductos(page)
  const alEntrar = await anotarVisibilidad(page)

  const informe: Record<string, unknown> = {}

  /* ── 1. DESKTOP: donde vive y de que depende ────────────────────────── */
  await apagarTodo(page)
  await page.waitForTimeout(900)

  informe.desktop = await page.evaluate(() => {
    const slot = document.querySelector('.dico-slot')
    if (!slot) return null
    const cs = getComputedStyle(slot)
    const aside = document.querySelector('.ag-sidebar')
    // Todo lo que, adentro del Slot, todavia acepta el puntero. Cada uno de
    // estos es una reentrada posible al hover de la sidebar.
    const conPuntero = [...slot.querySelectorAll('*')]
      .filter((el) => getComputedStyle(el).pointerEvents !== 'none')
      .map((el) => `${el.tagName.toLowerCase()}.${(el.className || '').toString().trim().split(/\s+/)[0]}`)
    return {
      position: cs.position,
      pointerEvents: cs.pointerEvents,
      zIndex: cs.zIndex,
      esDescendienteDeLaSidebar: !!aside && aside.contains(slot),
      dependeDelAnchoDeLaSidebar: [...document.styleSheets].flatMap((h) => {
        try { return [...(h.cssRules || [])] } catch { return [] }
      }).flatMap((r) => {
        const dentro = (r as CSSGroupingRule).cssRules ? [...(r as CSSGroupingRule).cssRules] : [r]
        return dentro as CSSStyleRule[]
      }).filter((r) => r.selectorText === '.ag-sidebar .dico-slot')
        .map((r) => r.style.left)[0] || null,
      descendientesQueAceptanPuntero: [...new Set(conPuntero)],
      hayScrim: document.querySelectorAll('.dico-scrim, .ag-backdrop').length,
    }
  })

  /* ── 2. EL LOOP, POR LA PUERTA QUE QUEDO ABIERTA ────────────────────────
   * PASS 3 le puso `pointer-events: none` al Slot y volvio a habilitarlos uno
   * por uno en los controles de la burbuja. Eso corto el loop mientras nadie
   * toca la burbuja — que es justamente lo que el usuario va a hacer. Se mide
   * apoyando el puntero sobre el CTA y mirando si el Slot se mueve solo. */
  const medirOscilacion = async (sel: string) => {
    const caja = await page.locator(sel).boundingBox().catch(() => null)
    if (!caja) return { sobre: sel, medido: false }
    await page.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2)
    const xs: number[] = []
    for (let i = 0; i < 12; i += 1) {
      await page.waitForTimeout(150)
      const b = await page.locator('.dico-slot').boundingBox()
      if (b) xs.push(Math.round(b.x))
    }
    const distintas = [...new Set(xs)]
    return {
      sobre: sel,
      medido: true,
      posiciones: xs,
      oscila: distintas.length > 1,
      amplitudPx: distintas.length > 1 ? Math.max(...distintas) - Math.min(...distintas) : 0,
    }
  }

  informe.loop = {
    // Sobre el personaje: es lo que PASS 3 cerro.
    sobreElPersonaje: await medirOscilacion('.dico-pose'),
    // Sobre el CTA de la burbuja: es la puerta que quedo abierta.
    sobreElCtaDeLaBurbuja: await medirOscilacion('.dico-slot .dico-burbuja-accion'),
  }
  await page.mouse.move(1400, 900)
  await page.waitForTimeout(400)
  await page.screenshot({ path: join(SALIDA, 'desktop-physical.png'), caret: 'hide' })

  /* ── 3. MOBILE: cuanto empuja ───────────────────────────────────────── */
  await restaurarVisibilidad(page, alEntrar)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(500)

  const dondeEmpiezaLaPantalla = () => page.evaluate(() => {
    const p = document.querySelector('.ag-pantalla-productos')
    const hueco = document.querySelector('.ag-slot')
    return {
      pantallaY: p ? +p.getBoundingClientRect().y.toFixed(1) : null,
      huecoAlto: hueco ? +hueco.getBoundingClientRect().height.toFixed(1) : null,
      scrollHeight: document.documentElement.scrollHeight,
    }
  })

  const antes = await dondeEmpiezaLaPantalla()
  await page.screenshot({ path: join(SALIDA, 'mobile-sin-physical.png'), caret: 'hide' })
  await apagarTodo(page)
  await page.waitForTimeout(1200)
  const despues = await dondeEmpiezaLaPantalla()
  await page.screenshot({ path: join(SALIDA, 'mobile-con-physical.png'), caret: 'hide' })

  informe.mobile = {
    antes,
    despues,
    /* LA CIFRA DEL PUNTO 3: cuanto baja la pantalla de Productos por el solo
       hecho de que Dico aparezca. Si es 0, Physical no empuja. */
    empujaPx: (antes.pantallaY !== null && despues.pantallaY !== null)
      ? +(despues.pantallaY - antes.pantallaY).toFixed(1)
      : null,
    creceElHuecoPx: (antes.huecoAlto !== null && despues.huecoAlto !== null)
      ? +(despues.huecoAlto - antes.huecoAlto).toFixed(1)
      : null,
    enElFlujo: await page.evaluate(() => {
      const hueco = document.querySelector('.ag-slot')
      if (!hueco) return null
      const cs = getComputedStyle(hueco)
      return { position: cs.position, maxHeight: cs.maxHeight, overflow: cs.overflow }
    }),
  }

  await page.setViewportSize(DESKTOP)
  await page.waitForTimeout(400)
  await irAProductos(page)
  await restaurarVisibilidad(page, alEntrar)

  await writeFile(join(SALIDA, 'diagnostico.json'), `${JSON.stringify(informe, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify(informe, null, 2))
})
