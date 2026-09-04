import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test, expect } from './fixtures'
import {
  openAdmin, irAProductos, apagarTodo, mostrarUno,
  anotarVisibilidad, restaurarVisibilidad,
} from './surfaces'

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

/* PHASE 4 · PASS 3 — REINSTRUMENTADO con la intervencion real.
 *
 * Sacaba a Physical con «Traer a Dico», que PASS 2 elimino. Ahora lo saca
 * `nada-visible`, disparada como la dispara un usuario: apagar el catalogo
 * hasta que no queda nada visible. Los helpers estan en `surfaces.ts` y
 * explican por que importa que sea una TRANSICION a cero y no un estado.
 */

/* Tabular hasta la sidebar SIN presupuesto inventado.
 *
 * Antes eran «40 pasos». Ese numero alcanzaba con los cuatro productos del
 * seed y dejo de alcanzar con el catalogo de revision: la sidebar viene
 * DESPUES del workspace en el DOM, asi que con 21 productos hay mas de
 * sesenta controles por delante y el gate fallaba por contar, no por un
 * defecto. Subir el numero a ojo lo habria escondido hasta el proximo
 * catalogo mas grande.
 *
 * El presupuesto se DERIVA del anillo real: se cuentan los focusables del
 * documento y se recorren todos, mas dos vueltas de margen. Si con eso no se
 * llega, la sidebar de verdad quedo fuera del orden de tabulacion, que es lo
 * unico que este contrato queria detectar.
 */
async function tabularHastaLaSidebar(page: import('@playwright/test').Page) {
  const presupuesto = await page.evaluate(() => (
    document.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
    ).length + 2
  ))
  for (let pasos = 0; pasos < presupuesto; pasos += 1) {
    await page.keyboard.press('Tab')
    const dentro = await page.evaluate(() => Boolean(document.activeElement?.closest('.ag-sidebar-item')))
    if (dentro) return true
  }
  return false
}

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
      /* Soltar el foco SIN clickear la pantalla.
       *
       * Antes esto era un click en la esquina inferior derecha del body, para
       * devolver el punto de partida del tabulador al principio del
       * documento. Con los cuatro productos del seed esa esquina caia en el
       * vacio; con el catalogo de revision cayo sobre el tacho de un producto
       * y ABRIO el modal «Eliminar Tiramisu», cuyo velo de 1280x860 tapaba
       * despues al contador de Dico. El gate moria 90 segundos mas tarde
       * culpando a un `<div>` sin nombre.
       *
       * Un click a ciegas sobre una pantalla con datos siempre le va a pegar
       * a algo. `blur()` consigue lo mismo —el foco vuelve al body y el
       * proximo Tab arranca de cero— y no toca ningun control. Los Tab que
       * vienen despues siguen siendo teclas de verdad, que es lo que
       * `:focus-visible` necesita. */
      await page.evaluate(() => (document.activeElement as HTMLElement)?.blur())
      const dentro = await tabularHastaLaSidebar(page)
      expect(dentro, `${w}px: no se llega a la sidebar tabulando el anillo entero`).toBe(true)
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

/* ── DICO NO LE SACA CAPACIDADES A LA NAVEGACION ────────────────────────────
 *
 * Con el aviso abierto y con Physical afuera, la sidebar tiene que seguir
 * expandiendose —por hover Y por teclado— y Dico tiene que correrse solo.
 *
 * VA EN SU PROPIO TEST, no como segunda mitad del anterior. PASS 3 lo
 * reinstrumento con la intervencion real, y traer y guardar a Physical cuatro
 * veces dejo al test unico en 90s justos: el limite del harness. Partirlo le
 * da a cada contrato su propio presupuesto sin tocar el reloj de nadie, y de
 * paso hace que un fallo diga cual de las dos cosas se rompio.
 */
test('Dico no le saca capacidades a la sidebar en los cuatro anchos', async ({ page }) => {
  await openAdmin(page, 'light', { width: 1440, height: 900 })
  await mkdir(SALIDA, { recursive: true })
  await irAProductos(page)
  const alEntrar = await anotarVisibilidad(page)
  const informe: Record<string, unknown>[] = []

  for (const { w, h, chasis } of ANCHOS) {
    if (chasis !== 'sidebar') continue
    await page.setViewportSize({ width: w, height: h })
    await page.waitForTimeout(320)
    const fila: Record<string, unknown> = { ancho: w }

    {
      const anchoDe = () => page.locator('.ag-sidebar').evaluate((el) => el.getBoundingClientRect().width)
      const izquierdaDe = (sel: string) => page.locator(sel).evaluate((el) => (
        +el.getBoundingClientRect().x.toFixed(1)
      )).catch(() => null)
      const alejar = async () => { await page.mouse.move(w - 40, h - 40); await page.waitForTimeout(300) }

      await alejar()
      const riel = await anchoDe()

      // 1. Con el aviso abierto.
      /* Nada puede estar tapando al contador: si algo lo cubre, el click se
         reintenta 90s y el error final culpa a un `<div>` anonimo. Esto lo
         dice de entrada y con nombre y apellido. */
      const tapa = await page.evaluate(() => {
        const t = document.querySelector('button.dico-avisos-trigger') as HTMLElement
        const b = t.getBoundingClientRect()
        const top = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)
        if (!top || t.contains(top)) return null
        return `${top.tagName}.${(top.className || '').toString().trim() || '(sin clase)'}`
      })
      expect(tapa, `${w}px: algo tapa el contador de Dico`).toBeNull()
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

      /* 2. Con Physical afuera, traido por la intervencion real.
         No se repone el catalogo entero en cada ancho: la limpieza de la
         vuelta anterior deja UN producto visible, que es todo lo que hace
         falta para volver a caer a cero. Reponer los cuatro cuatro veces
         costaba 48 clicks y dejaba el gate en 138s, o sea afuera de los 90s
         del harness — y subir ese numero para tapar el costo era justamente
         lo que no habia que hacer. */
      await irAProductos(page)
      await apagarTodo(page)
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
      const enSidebar = await tabularHastaLaSidebar(page)
      expect(enSidebar, `${w}px: con Physical afuera no se llega a la sidebar con Tab`).toBe(true)
      await page.waitForTimeout(320)
      expect(await anchoDe(), `${w}px: con Physical afuera el teclado no expande`).toBeGreaterThan(riel)
      await page.screenshot({ path: join(SALIDA, `${w}-teclado-physical.png`), caret: 'hide' })

      /* Guardar a Physical y dejar el catalogo listo para el proximo ancho.
         Se cierra RESOLVIENDO la intervencion —volviendo a prender el
         catalogo— y no con el control de la burbuja: si se cerrara a mano, la
         carga seguiria viva en el productor y la proxima vuelta arrancaria
         sin la transicion que necesita para volver a dispararla. */
      await page.evaluate(() => (document.activeElement as HTMLElement)?.blur())
      await mostrarUno(page)
      await expect(page.locator('.dico-physical')).toHaveCount(0)
      await expect.poll(() => page.evaluate(() => (
        document.querySelector('[data-dico-presence-state]')?.getAttribute('data-dico-presence-state')
      ))).toBe('native_idle')
      await alejar()
      fila.expandeConAviso = anchoConAviso
      fila.expandeConPhysical = anchoConPhysical
    }
    informe.push(fila)
  }

  // Devolver el catalogo como se lo encontro (ver `restaurarVisibilidad`).
  await page.setViewportSize({ width: 1440, height: 900 })
  await irAProductos(page)
  await restaurarVisibilidad(page, alEntrar)

  await writeFile(join(SALIDA, 'informe-dico.json'), `${JSON.stringify(informe, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify(informe, null, 2))
})
