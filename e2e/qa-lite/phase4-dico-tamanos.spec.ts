import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { test, aplicarMovimiento } from './fixtures'
import { openAdmin, DESKTOP } from './surfaces'

/**
 * Phase 4 · PASS 2 — variantes de tamanio de Dico 2D, para elegir mirando.
 *
 * El pedido fue explicito: "no fijar el tamanio por intuicion, presentar 2-3
 * variantes". Esto NO cambia el codigo productivo — inyecta el tamanio por
 * CSS sobre la pantalla real y fotografia cada opcion, en la sidebar
 * colapsada y expandida. Lo que se elija despues se escribe una sola vez.
 *
 * El riel mide 64px, asi que arriba de ~60 el personaje ya no entra colapsado
 * sin comerse el aire; por eso las variantes grandes solo se aplican con la
 * sidebar abierta, que es donde el pedido dice que tiene que leerse.
 */
const SALIDA = join(process.cwd(), '.qa-lite', 'artifacts', 'phase4-golden', 'dico-tamanos')

const VARIANTES = [
  { nombre: 'A-56', colapsado: 56, expandido: 56 },
  { nombre: 'B-64-88', colapsado: 60, expandido: 88 },
  { nombre: 'C-64-112', colapsado: 60, expandido: 112 },
] as const

test('variantes de tamanio de Dico 2D en la sidebar', async ({ page }) => {
  await aplicarMovimiento(page, 'no-preference')
  await mkdir(SALIDA, { recursive: true })

  for (const v of VARIANTES) {
    await openAdmin(page, 'dark', DESKTOP)

    // El expandido se consigue con hover sobre la sidebar; el CSS de la
    // variante usa esa misma condicion para no tener que tocar el JS.
    await page.addStyleTag({
      content: `
        @media (min-width: 769px) {
          .ag-sidebar .dico-native-caja { --dico-native-size: ${v.colapsado}px !important; }
          .ag-sidebar .dico-avisos-idle { width: ${v.colapsado}px !important; height: ${v.colapsado}px !important; }
          .ag-sidebar:hover .dico-native-caja { --dico-native-size: ${v.expandido}px !important; }
          .ag-sidebar:hover .dico-avisos-idle { width: ${v.expandido}px !important; height: ${v.expandido}px !important; }
        }
      `,
    })

    await page.waitForTimeout(300)
    await page.screenshot({
      path: join(SALIDA, `${v.nombre}-colapsada.png`),
      clip: { x: 0, y: 0, width: 420, height: 320 },
    })

    // Expandir: el hover vive en la sidebar.
    await page.locator('.ag-sidebar').hover()
    await page.waitForTimeout(450)
    await page.screenshot({
      path: join(SALIDA, `${v.nombre}-expandida.png`),
      clip: { x: 0, y: 0, width: 420, height: 320 },
    })
  }
})
