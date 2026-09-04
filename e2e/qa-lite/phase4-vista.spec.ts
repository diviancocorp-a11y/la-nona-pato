import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { test, aplicarMovimiento } from './fixtures'
import { openAdmin, irAProductos } from './surfaces'

/**
 * Phase 4 · PASS 3 — la evidencia para el ojo, no un gate.
 *
 * No afirma nada: fotografia. `phase4-golden` ya mide contraste, targets y
 * desborde sobre el fixture del harness —cuatro productos, ids fijos, que es
 * lo que mantiene comparables sus numeros entre corridas—. Esto es lo otro
 * que hace falta para aprobar una composicion: verla con el volumen que tiene
 * un negocio de verdad, y con la sidebar en sus DOS estados, que es donde
 * cambia de tamanio el personaje.
 *
 * Se corre a mano, despues de `scripts/qa-lite/cargar-productos-demo.mjs`:
 *   node scripts/qa-lite/capturar-phase4.mjs --lote=vista-despues \
 *     --spec=phase4-vista.spec.ts
 */
const SALIDA = join(process.cwd(), '.qa-lite', 'artifacts', 'phase4-golden', 'vista')

const ANCHOS = [
  { nombre: '1440', w: 1440, h: 1000, sidebar: true },
  { nombre: '1024', w: 1024, h: 820, sidebar: true },
  { nombre: '769', w: 769, h: 1000, sidebar: true },
  { nombre: '768', w: 768, h: 1000, sidebar: false },
  { nombre: '390', w: 390, h: 844, sidebar: false },
] as const

test('Productos con catalogo real, en los dos temas y los dos estados del riel', async ({ page }) => {
  await aplicarMovimiento(page, 'no-preference')
  await mkdir(SALIDA, { recursive: true })

  for (const tema of ['light', 'dark'] as const) {
    for (const a of ANCHOS) {
      await openAdmin(page, tema, { width: a.w, height: a.h })
      await irAProductos(page)

      // Riel colapsado: el estado normal. El puntero lejos, porque el hover lo
      // abre y la foto saldria del otro estado.
      await page.mouse.move(a.w - 40, a.h - 40)
      await page.waitForTimeout(400)
      await page.screenshot({
        path: join(SALIDA, `${tema}-${a.nombre}-colapsada.png`),
        fullPage: true,
        caret: 'hide',
      })

      if (a.sidebar) {
        // Riel abierto: Dico pasa de 60 a 88 y el wordmark aparece a su lado.
        await page.locator('.ag-sidebar').hover()
        await page.waitForTimeout(500)
        await page.screenshot({
          path: join(SALIDA, `${tema}-${a.nombre}-expandida.png`),
          caret: 'hide',
        })
      }

      // El mensaje de Dico abierto: es donde se ve si el globo sale del
      // personaje y si las oportunidades llegaron a su canal.
      await page.mouse.move(a.w - 40, a.h - 40)
      await page.waitForTimeout(300)
      await page.locator('button.dico-avisos-trigger').click()
      await page.waitForTimeout(500)
      await page.screenshot({
        path: join(SALIDA, `${tema}-${a.nombre}-burbuja.png`),
        caret: 'hide',
      })
    }
  }
})
