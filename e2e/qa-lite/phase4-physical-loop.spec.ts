import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test, aplicarMovimiento } from './fixtures'
import { openAdmin, DESKTOP } from './surfaces'

/**
 * Phase 4 · PASS 2 — DEMOSTRACION del loop abrir/cerrar de Physical.
 *
 * No arregla nada: mide. La hipotesis a confirmar o descartar es esta cadena:
 *
 *   1. `.ag-sidebar .dico-slot` es `position: fixed` PERO sigue siendo
 *      descendiente del `<aside>` en el DOM.
 *   2. La sidebar se expande por `:hover`, y el hover de un descendiente
 *      cuenta como hover del ancestro aunque este pintado lejos.
 *   3. El `left` del Slot es `calc(var(--ag-sidebar-ancho) + ...)`, y ese
 *      token cambia de 64px a 224px al expandirse.
 *
 *   => el puntero entra en Physical, la sidebar se expande, Physical se corre
 *      160px, el puntero deja de estar encima, la sidebar colapsa, Physical
 *      vuelve debajo del puntero, y arranca de nuevo.
 *
 * Si la cadena es cierta, el personaje oscila sin que el usuario mueva el
 * mouse. Eso se mide comparando la posicion del Slot con el puntero quieto.
 */
const SALIDA = join(process.cwd(), '.qa-lite', 'artifacts', 'phase4-golden', 'physical-loop')

test('el Slot de la sidebar oscila con el puntero quieto', async ({ page }) => {
  await aplicarMovimiento(page, 'no-preference')
  await mkdir(SALIDA, { recursive: true })
  await openAdmin(page, 'dark', DESKTOP)

  // Traer a Physical: se oculta el ultimo producto visible, que es el evento
  // `nada-visible` del contrato de Phase 9.
  const ocultar = page.getByRole('button', { name: 'Ocultar' })
  for (let i = await ocultar.count(); i > 0; i -= 1) {
    await page.getByRole('button', { name: 'Ocultar' }).first().click()
    await page.waitForTimeout(120)
  }
  await page.waitForTimeout(900)

  const slot = page.locator('.ag-sidebar .dico-slot')
  const existe = await slot.count()

  const estructura = await page.evaluate(() => {
    const s = document.querySelector('.ag-sidebar .dico-slot')
    if (!s) return null
    const cs = getComputedStyle(s)
    const aside = document.querySelector('.ag-sidebar')
    return {
      // (1) fixed pero adentro del aside.
      position: cs.position,
      esDescendienteDeLaSidebar: !!aside && aside.contains(s),
      // (3) su left depende del ancho de la sidebar.
      leftDeclarado: [...document.styleSheets].flatMap((hoja) => {
        try { return [...(hoja.cssRules || [])] } catch { return [] }
      }).flatMap((r) => {
        const dentro = (r as CSSGroupingRule).cssRules ? [...(r as CSSGroupingRule).cssRules] : [r]
        return dentro as CSSStyleRule[]
      }).filter((r) => r.selectorText === '.ag-sidebar .dico-slot')
        .map((r) => r.style.left)[0] || null,
    }
  })

  /* La medicion: el puntero se pone SOBRE el personaje y no se mueve mas.
     Si la cadena existe, la caja del Slot cambia sola entre frames. */
  const caja = await slot.boundingBox()
  const posiciones: number[] = []
  if (caja) {
    await page.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2)
    for (let i = 0; i < 12; i += 1) {
      await page.waitForTimeout(150)
      const b = await slot.boundingBox()
      if (b) posiciones.push(Math.round(b.x))
    }
  }

  const distintas = [...new Set(posiciones)]
  const veredicto = {
    slotEncontrado: existe > 0,
    estructura,
    posicionesConPunteroQuieto: posiciones,
    valoresDistintos: distintas,
    /* La firma del loop: con el puntero inmovil el Slot ocupa MAS DE UNA
       posicion en X. Una sola posicion = no oscila. */
    oscila: distintas.length > 1,
    amplitudPx: distintas.length > 1 ? Math.max(...distintas) - Math.min(...distintas) : 0,
  }

  await writeFile(join(SALIDA, 'diagnostico.json'), `${JSON.stringify(veredicto, null, 2)}\n`, 'utf8')
  await page.screenshot({ path: join(SALIDA, 'estado.png'), caret: 'hide' })
  console.log(JSON.stringify(veredicto, null, 2))
})
