import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { test, expect } from './fixtures'
import { DESKTOP, openAdmin } from './surfaces'

/**
 * La secuencia completa de invocacion, capturada sobre la app real.
 *
 * Dico 2D presente -> se lo invoca -> Physical entra y Dico 2D DESAPARECE ->
 * se lo guarda -> Dico 2D vuelve. Lo que se mira es que el 2D no conviva con
 * el 3D en ningun momento: son la misma presencia en dos planos, no dos
 * personajes.
 */
const SALIDA = join(process.cwd(), '.qa-lite', 'artifacts', 'phase-b6r-native', 'secuencia')

test.use({ reducedMotion: 'no-preference' })

async function foto(page: import('@playwright/test').Page, nombre: string) {
  await mkdir(SALIDA, { recursive: true })
  await page.screenshot({ path: join(SALIDA, `${nombre}.png`), caret: 'hide' })
}

const estado = (page: import('@playwright/test').Page) => page.evaluate(() => (
  document.querySelector('[data-dico-presence-state]')?.getAttribute('data-dico-presence-state')
))

test('click en Dico -> Physical -> vuelve', async ({ page }) => {
  await openAdmin(page, 'light', DESKTOP)
  const native = page.locator('[data-dico-native]')
  const physical = page.locator('.dico-physical')

  await expect(native).toHaveCount(1)
  expect(await estado(page)).toBe('native_idle')
  await foto(page, '1-native-idle')

  await page.locator('button.dico-slot-control').click()
  await expect(physical).toHaveCount(1)
  // Mientras Physical esta en escena, Dico 2D NO existe en el DOM.
  await expect(native).toHaveCount(0)
  await foto(page, '2-physical-opening')

  await expect.poll(() => estado(page)).toBe('physical_open')
  await expect(native).toHaveCount(0)
  await foto(page, '3-physical-open')

  await page.locator('button.dico-slot-control').click()
  await expect.poll(() => estado(page)).toBe('native_idle')
  await expect(native).toHaveCount(1)
  await expect(physical).toHaveCount(0)
  await foto(page, '4-de-vuelta')
})
