import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test, expect, aplicarMovimiento } from './fixtures'
import { DESKTOP, openAdmin } from './surfaces'

/**
 * Las dos intervenciones sobre la app real.
 *
 * Lo que jsdom no puede decir: si el dedo de `pointDown` cae de verdad sobre el
 * CTA, y si Physical tapa algo que no deberia.
 */
const SALIDA = join(process.cwd(), '.qa-lite', 'artifacts', 'intervenciones')

test('catalogo vacio: el dedo cae sobre el CTA y no hay dos Dicos', async ({ page }) => {
  await aplicarMovimiento(page, 'no-preference')
  await openAdmin(page, 'light', DESKTOP)
  await mkdir(SALIDA, { recursive: true })

  // El fixture tiene productos: se vacia el catalogo desde el DOM no se puede,
  // asi que se fuerza el empty state ocultando las filas no alcanza. Se navega
  // a productos y se mide lo que haya; si hay productos, este bloque verifica
  // la NO aparicion, que tambien es contrato.
  await page.getByRole('button', { name: /^Productos/ }).click()
  await page.waitForTimeout(500)

  const hayProductos = await page.locator('[data-section]').count()
  expect(hayProductos).toBeGreaterThan(0)

  const estado = await page.evaluate(() => ({
    escena2D: document.querySelectorAll('.dico-cuadro--core').length,
    ancla: document.querySelectorAll('[data-dico-objetivo]').length,
    physical: document.querySelectorAll('.dico-pose').length,
    native: document.querySelectorAll('[data-dico-native]').length,
  }))
  await writeFile(join(SALIDA, 'catalogo-con-productos.json'), `${JSON.stringify(estado, null, 2)}\n`, 'utf8')

  // Con catalogo cargado no hay intervencion ni escena: el empty state ni
  // siquiera se monta.
  expect(estado.physical, 'Physical salio sin motivo').toBe(0)
  expect(estado.escena2D, 'la escena 2D aparecio con catalogo cargado').toBe(0)

  // NUNCA dos Dicos: si alguna vez conviven escena 2D y Physical, es bug.
  expect(estado.escena2D === 0 || estado.physical === 0, 'dos Dicos a la vez').toBe(true)
  await page.screenshot({ path: join(SALIDA, 'catalogo-con-productos.png'), caret: 'hide' })
})

test('nada visible: apagar el ultimo saca a Dico worried', async ({ page }) => {
  await aplicarMovimiento(page, 'no-preference')
  await openAdmin(page, 'light', DESKTOP)
  await mkdir(SALIDA, { recursive: true })
  await page.getByRole('button', { name: /^Productos/ }).click()
  await page.waitForTimeout(500)

  // Al montar con productos visibles NO hay intervencion. Es el caso B del
  // contrato: nadie apago nada todavia.
  await expect(page.locator('.dico-pose')).toHaveCount(0)

  const ocultar = page.getByRole('button', { name: 'Ocultar' })
  const cuantos = await ocultar.count()
  expect(cuantos, 'el fixture no tiene productos visibles que apagar').toBeGreaterThan(0)

  // Apagar todos menos el ultimo: ninguno de esos dispara nada.
  for (let i = 0; i < cuantos - 1; i += 1) {
    await page.getByRole('button', { name: 'Ocultar' }).first().click()
    await page.waitForTimeout(220)
    await expect(page.locator('.dico-pose'), `apagar el ${i + 1} de ${cuantos} disparo la intervencion`)
      .toHaveCount(0)
  }

  // El ultimo si.
  await page.getByRole('button', { name: 'Ocultar' }).first().click()
  await expect(page.locator('.dico-pose')).toHaveCount(1)

  // LA CARRERA. Resolver el estado ENSEGUIDA —dentro de los 780ms de la
  // animacion de entrada— tiene que cerrar igual. La maquina solo acepta
  // `CLOSE_PHYSICAL` desde `physical_open`, asi que sin reconciliacion contra
  // el estado el cierre se tragaba y Dico quedaba afuera para siempre.
  await page.getByRole('button', { name: 'Mostrar' }).first().click()
  await expect(page.locator('.dico-pose'), 'el cierre se trago durante la apertura').toHaveCount(0)

  // Y se vuelve a poder: apagar el ultimo otra vez la trae de nuevo.
  await page.getByRole('button', { name: 'Ocultar' }).first().click()
  await expect(page.locator('.dico-pose')).toHaveCount(1)
  const pose = await page.locator('[data-dico-physical]').getAttribute('data-dico-physical')
  expect(pose, 'salio otra pose').toBe('worried')

  const conIntervencion = await page.evaluate(() => {
    const capa = document.querySelector('.dico-pose-capa--actual') as HTMLImageElement | null
    const burbuja = document.querySelector('.dico-intervencion-mensaje')?.getBoundingClientRect()
    return {
      src: capa?.getAttribute('src') || null,
      burbuja: burbuja ? { x: +burbuja.x.toFixed(1), y: +burbuja.y.toFixed(1) } : null,
      texto: document.querySelector('.dico-burbuja-lectura')?.textContent || '',
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    }
  })
  await writeFile(join(SALIDA, 'nada-visible.json'), `${JSON.stringify(conIntervencion, null, 2)}\n`, 'utf8')
  expect(conIntervencion.src).toContain('dico-3d-worried.webp')
  expect(conIntervencion.texto).toContain('vacía')
  expect(conIntervencion.overflowX, 'la intervencion produjo scroll horizontal').toBe(false)
  await page.screenshot({ path: join(SALIDA, 'nada-visible.png'), caret: 'hide' })

  // Recuperar el estado la cierra: sin timers, la resuelve la accion.
  await page.getByRole('button', { name: 'Mostrar' }).first().click()
  // Primero se ESPERA el cierre y despues se lee: leer antes captura el
  // instante del click, cuando la intervencion todavia no se retiro.
  await expect(page.locator('.dico-pose')).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => (
    document.querySelector('[data-dico-intervencion]')?.getAttribute('data-dico-intervencion')
  )), { message: 'la intervencion quedo colgada' }).toBe('')
  await page.screenshot({ path: join(SALIDA, 'nada-visible-resuelta.png'), caret: 'hide' })
})
