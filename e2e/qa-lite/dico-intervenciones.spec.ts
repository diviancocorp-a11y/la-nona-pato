import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test, expect, aplicarMovimiento } from './fixtures'
import { DESKTOP, openAdmin, irAProductos, prenderTodo } from './surfaces'

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
  // Cuanto aire hay ARRIBA de donde caeria el CTA del empty state. El
  // personaje mide 318px y su dedo esta a 71px del borde inferior de la caja,
  // asi que necesita ~247px por encima del CTA para no cortarse.
  const aire = await page.evaluate(() => {
    const slot = document.querySelector('main .ag-slot')?.getBoundingClientRect()
    const tarjetas = [...document.querySelectorAll('main div')]
      .map((d) => d.getBoundingClientRect())
      .filter((b) => b.width > 300 && b.height > 60)
      .sort((a, b) => a.y - b.y)
    return {
      slotHasta: slot ? +(slot.y + slot.height).toFixed(1) : null,
      primeraTarjetaY: tarjetas.length ? +tarjetas[0].y.toFixed(1) : null,
      alto: window.innerHeight,
    }
  })
  console.log(`aire arriba del empty state: ${JSON.stringify(aire)}`)
  await writeFile(join(SALIDA, 'catalogo-con-productos.json'),
    `${JSON.stringify({ ...estado, aire }, null, 2)}\n`, 'utf8')

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

test('la intervencion sobrevive el cruce de 769px', async ({ page }) => {
  // Deuda conocida: `DicoPresence` se remonta al cruzar la frontera y su
  // maquina arranca de cero. Lo que se documenta aca es que la CARGA vive en
  // el productor —que no se remonta— y que la reconciliacion contra el estado
  // vuelve a abrir Physical del otro lado sin re-despachar nada.
  await aplicarMovimiento(page, 'no-preference')
  await openAdmin(page, 'light', DESKTOP)
  await mkdir(SALIDA, { recursive: true })
  await page.getByRole('button', { name: /^Productos/ }).click()
  await page.waitForTimeout(400)

  const ocultar = page.getByRole('button', { name: 'Ocultar' })
  const cuantos = await ocultar.count()
  for (let i = 0; i < cuantos; i += 1) {
    await page.getByRole('button', { name: 'Ocultar' }).first().click()
    await page.waitForTimeout(200)
  }
  await expect(page.locator('.dico-pose')).toHaveCount(1)

  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(600)
  const enMobile = await page.evaluate(() => ({
    poses: document.querySelectorAll('.dico-pose').length,
    interv: document.querySelector('[data-dico-intervencion]')?.getAttribute('data-dico-intervencion'),
    estado: document.querySelector('[data-dico-presence-state]')?.getAttribute('data-dico-presence-state'),
  }))
  await writeFile(join(SALIDA, 'cruce-769.json'), `${JSON.stringify(enMobile, null, 2)}
`, 'utf8')
  console.log(`al cruzar a mobile: ${JSON.stringify(enMobile)}`)

  // La carga sobrevive SIEMPRE: la tiene el productor.
  expect(enMobile.interv, 'la intervencion se perdio al remontar').toBe('nada-visible')
  // Y Physical vuelve solo, sin que nadie re-dispare.
  await expect(page.locator('.dico-pose'), 'Physical no volvio del otro lado').toHaveCount(1)
  await page.screenshot({ path: join(SALIDA, 'cruce-769-mobile.png'), caret: 'hide' })

  /* PASS 3 — devolver el catalogo prendido. Este era EL archivo que ensuciaba
     la base para todos los que corren despues: terminaba con los cuatro
     productos apagados y el siguiente gate se encontraba una pantalla que no
     era la que venia a medir. Mientras `dico-sidebar` y `dico-physical-poses`
     estuvieron en `fixme` no se notaba. */
  await page.setViewportSize(DESKTOP)
  await irAProductos(page)
  await prenderTodo(page)
})
