import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test, expect, aplicarMovimiento } from './fixtures'
import {
  openAdmin, irAProductos, ocultarUno, prenderTodo,
  anotarVisibilidad, restaurarVisibilidad,
} from './surfaces'

/**
 * Phase 4 — Golden Screen (Productos): captura de evidencia y contratos.
 *
 * Corre DOS veces con el mismo codigo: una antes de tocar la pantalla y otra
 * despues. La carpeta de salida la elige `QA_PHASE4_LOTE` (`antes` / `despues`),
 * asi que las dos corridas producen exactamente las mismas superficies con los
 * mismos nombres y se pueden mirar en paralelo.
 *
 * No es un gate same-ref: no compara pixeles contra un baseline. El gate de
 * Phase 4 es la aprobacion visual humana (ver el brief), y esto es lo que esa
 * persona necesita para poder mirar. Lo que SI verifica sin humano son los
 * contratos numericos G1/G3/G4, medidos en el navegador real y no sobre el
 * CSS: aca los colores ya estan resueltos por cascada, herencia y tema.
 *
 * Brief: platform/PHASE-4-GOLDEN-SCREEN-BRIEF.md
 */
const LOTE = process.env.QA_PHASE4_LOTE || 'antes'
const SALIDA = join(process.cwd(), '.qa-lite', 'artifacts', 'phase4-golden', LOTE)

const TEMAS = ['light', 'dark'] as const

/**
 * Los anchos que pidio la revision.
 *
 * 768 y 769 no son decorativos: es la frontera donde el panel cambia de
 * navegacion (bottom nav / sidebar) y donde Dico Physical deja de montarse
 * para `catalogo-vacio` (Phase 9). Una pantalla puede verse bien de los dos
 * lados y romperse justo en el cruce.
 */
const VIEWPORTS = [
  { nombre: '1440x1000', width: 1440, height: 1000 },
  { nombre: '1024x768', width: 1024, height: 768 },
  { nombre: '769x1000', width: 769, height: 1000 },
  { nombre: '768x1000', width: 768, height: 1000 },
  { nombre: '390x844', width: 390, height: 844 },
] as const

/** Minimos que NO se inventan aca: salen de Phase 3A y de AA. */
const MINIMO_CONTRASTE = 4.5
const MINIMO_TARGET = 44

/**
 * Todo lo que hay que saber de la pantalla, medido por el navegador.
 *
 * El contraste se calcula sobre el color YA RESUELTO (`getComputedStyle`
 * devuelve rgb, no el `var()`), y el fondo se busca subiendo por los ancestros
 * hasta encontrar uno no transparente — que es como lo ve el ojo. Medir contra
 * el fondo declarado del propio elemento daria `rgba(0,0,0,0)` y un contraste
 * fantasia.
 */
const medirPantalla = (page: import('@playwright/test').Page, minimo: number) => page.evaluate((MIN) => {
  const raiz = document.documentElement

  /** Un color con su alfa. `null` si el navegador no devolvio un color. */
  const rgba = (v: string): [number, number, number, number] | null => {
    const m = v.match(/rgba?\(([^)]+)\)/)
    if (!m) return null
    const p = m[1].split(/[,\s/]+/).filter(Boolean).map((x) => parseFloat(x))
    if (p.length < 3 || p.some((n) => Number.isNaN(n))) return null
    return [p[0], p[1], p[2], p.length >= 4 ? p[3] : 1]
  }

  const rgb = (v: string): [number, number, number] | null => {
    const c = rgba(v)
    if (!c || c[3] === 0) return null
    return [c[0], c[1], c[2]]
  }

  /** `sobre` visto a traves de `capa`, con su alfa. */
  const componer = (
    capa: [number, number, number, number],
    sobre: [number, number, number],
  ): [number, number, number] => [
    capa[0] * capa[3] + sobre[0] * (1 - capa[3]),
    capa[1] * capa[3] + sobre[1] * (1 - capa[3]),
    capa[2] * capa[3] + sobre[2] * (1 - capa[3]),
  ]

  const lum = ([r, g, b]: [number, number, number]) => {
    const c = (v: number) => {
      const x = v / 255
      return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
    }
    return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b)
  }

  const ratio = (a: [number, number, number], b: [number, number, number]) => {
    const [x, y] = [lum(a), lum(b)]
    return Math.round(((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)) * 100) / 100
  }

  /**
   * El fondo que el ojo ve detras del texto, COMPUESTO.
   *
   * Tomar el color base de una capa semitransparente como si fuera opaco
   * invierte el resultado y no un poco: `.ag-btn-mini` usa `--ag-bg-soft`,
   * que es `rgba(9,9,11,.04)` en claro y `rgba(255,255,255,.05)` en oscuro.
   * Sin componer, el boton "Ocultar" del tema CLARO se medía contra negro
   * puro y daba 2,57:1 — un defecto inexistente, y del signo contrario al
   * real. Se juntan las capas hasta la primera opaca y se componen de atras
   * hacia adelante, que es lo que hace el navegador.
   */
  const fondoReal = (el: Element): [number, number, number] => {
    const capas: Array<[number, number, number, number]> = []
    let n: Element | null = el
    let base: [number, number, number] = [255, 255, 255]
    while (n) {
      const c = rgba(getComputedStyle(n).backgroundColor)
      if (c && c[3] > 0) {
        if (c[3] >= 1) { base = [c[0], c[1], c[2]]; break }
        capas.push(c)
      }
      n = n.parentElement
    }
    let out = base
    for (let i = capas.length - 1; i >= 0; i -= 1) out = componer(capas[i], out)
    return [Math.round(out[0]), Math.round(out[1]), Math.round(out[2])]
  }

  const panel = document.querySelector('.ag-root')
  /**
   * La PANTALLA, que es lo que Phase 4 se comprometio a dejar impecable.
   *
   * Es el contenedor de ProductsPanel, NO `.ag-main`. Adentro de main tambien
   * viven las oportunidades y el aviso de Dico, que son Phase 8/9 y traen su
   * propia deuda declarada («Ver el salon» a 3,17:1, anotada en 3B §8).
   * Cobrarsela a Phase 4 seria reabrir dos fases cerradas por la ventana.
   * Todo eso, mas el topbar y la nav, se reporta como contexto: a la vista,
   * fuera del gate.
   */
  const pantalla = document.querySelector('.ag-pantalla-productos')
  const enPantalla = (el: Element) => !!pantalla && pantalla.contains(el)

  /**
   * Visible PARA EL OJO, que no es lo mismo que presente en el layout.
   *
   * `.ag-sr-only` mide 1x1 con `clip-path: inset(50%)`: existe para lectores
   * de pantalla y no se ve. Sin este filtro, el `<h2>Secciones</h2>` de la
   * sidebar entraba como "texto negro sobre fondo negro, 1:1" — un defecto
   * que no existe. Se descarta por su geometria y su clip, no por su clase,
   * para que valga igual si el patron aparece con otro nombre.
   */
  const visible = (el: Element) => {
    const b = el.getBoundingClientRect()
    if (b.width <= 1 || b.height <= 1) return false
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.opacity === '0') return false
    if (cs.clipPath && cs.clipPath !== 'none' && cs.clipPath.includes('inset(50%')) return false
    return true
  }

  /* ── G1: contraste de todo texto de la pantalla ── */
  const textos: Array<Record<string, unknown>> = []
  /* G6: lo mismo, pero acotado a las filas de productos ocultos y guardando
     tambien lo que pasa. Es el unico bloque de la pantalla donde el diseño
     ATENUA a proposito, asi que es donde hay que mirar el margen. */
  const ocultos: Array<Record<string, unknown>> = []
  const conTexto = [...(panel?.querySelectorAll('*') || [])].filter((el) => {
    if (!visible(el)) return false
    // Solo nodos con texto PROPIO: si no, cada contenedor reporta el texto de
    // sus hijos y el mismo par se mide diez veces.
    return [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent || '').trim().length > 0)
  })
  for (const el of conTexto) {
    const cs = getComputedStyle(el)
    const tinta = rgb(cs.color)
    if (!tinta) continue
    // Desde el elemento MISMO, no desde el padre: un boton con fondo propio
    // —el CTA dorado, el badge de conteo— se estaba midiendo contra el fondo
    // de la tarjeta que tiene detras. Daba 1:1 en tres superficies y ninguno
    // de esos tres defectos era real. `fondoReal` ya sube solo si el elemento
    // es transparente, asi que empezar aca no pierde el caso del texto suelto.
    const fondo = fondoReal(el)
    // `opacity` no entra en el `color` computado, pero el ojo la ve: el
    // contador de cada categoria es un span con `opacity: .6` sobre el titulo.
    // Sin esto se mide una tinta que nadie ve, y siempre por el lado optimista.
    let alfa = 1
    for (let n: Element | null = el; n; n = n.parentElement) {
      const o = parseFloat(getComputedStyle(n).opacity)
      if (Number.isFinite(o)) alfa *= o
    }
    const tintaVista = alfa >= 1 ? tinta : componer([...tinta, alfa] as [number, number, number, number], fondo)
    const r = ratio(tintaVista, fondo)
    const px = parseFloat(cs.fontSize)
    const peso = parseInt(cs.fontWeight, 10) || 400
    // AA: 3:1 vale solo para texto grande (>=24px, o >=18.66px en negrita).
    const grande = px >= 24 || (px >= 18.66 && peso >= 700)
    const exigido = grande ? 3 : MIN

    /* ── PRODUCTOS OCULTOS — la regresion especifica de PASS 3 ──────────
     * Un producto apagado se dibuja "atenuado", y atenuado no puede querer
     * decir ilegible: sigue siendo texto que el dueño del negocio tiene que
     * poder leer para volver a prenderlo. La version con `opacity: .55`
     * dejaba el nombre en 4,0:1 y el boton de la fila en 2,6:1 — medido
     * sobre treinta filas, invisible con cuatro.
     * Se guardan TODAS las mediciones de esas filas, no solo las que fallan,
     * para que el artifact muestre el margen que hay y no solo el veredicto.
     * La composicion alfa ya la hizo `tintaVista` unas lineas mas arriba: es
     * la misma cuenta para todos, no una excepcion para este caso. */
    const filaOculta = el.closest('.ag-fila.esta-oculta')
    if (filaOculta) {
      ocultos.push({
        producto: (filaOculta.querySelector('.ag-fila-nombre')?.textContent || '').trim().slice(0, 40),
        texto: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40),
        clase: el.className?.toString().slice(0, 40) || null,
        contraste: r,
        exigido,
        cumple: r >= exigido,
      })
    }

    if (r < exigido) {
      textos.push({
        ambito: enPantalla(el) ? 'pantalla' : 'shell',
        texto: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60),
        clase: el.className?.toString().slice(0, 40) || null,
        color: cs.color,
        colorVisto: `rgb(${tintaVista.map((n) => Math.round(n)).join(', ')})`,
        fondo: `rgb(${fondo.join(', ')})`,
        px,
        peso,
        contraste: r,
        exigido,
      })
    }
  }

  /* ── G3: targets de las acciones de cada fila ── */
  const targets = [...(panel?.querySelectorAll('button, a[href], input, select') || [])]
    .filter(visible)
    .map((el) => {
      const b = el.getBoundingClientRect()
      return {
        ambito: enPantalla(el) ? 'pantalla' : 'shell',
        nombre: (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || '').replace(/\s+/g, ' ').trim().slice(0, 40),
        w: Math.round(b.width * 10) / 10,
        h: Math.round(b.height * 10) / 10,
      }
    })

  /* ── G4: overflow ── */
  return {
    hayPantalla: !!pantalla,
    desborde: raiz.scrollWidth - raiz.clientWidth,
    textosQueFallan: textos,
    ocultos,
    totalTextosMedidos: conTexto.length,
    targets,
    // La pantalla que se esta mirando, para que el artifact no mienta sobre
    // cual era: si el panel abriera en otra pestania, todo lo de arriba seria
    // de otra superficie.
    seccionActiva: (panel?.querySelector('.ag-nav-item[aria-current], .ag-nav-item.is-activa')?.textContent || '').trim().slice(0, 30) || null,
    tituloVisible: (panel?.querySelector('h2')?.textContent || '').trim().slice(0, 40) || null,
  }
}, minimo)

test('Phase 4 — Productos: evidencia y contratos G1/G3/G4 en 2 temas x 5 anchos', async ({ page }) => {
  await aplicarMovimiento(page, 'no-preference')
  await mkdir(SALIDA, { recursive: true })

  /* G6 SE FABRICA SU PROPIO CASO.
   *
   * El seed trae sus cuatro productos VISIBLES: no hay ninguna fila atenuada
   * que medir. La primera version de este gate se apoyaba en que algun otro
   * spec hubiera dejado uno apagado — o sea que pasaba o no segun el orden de
   * los archivos, que es exactamente el defecto que este pase vino a sacar
   * del harness. Apagar uno aca lo vuelve deterministico, y se repone al
   * final para no cambiarle el fixture a nadie. */
  await openAdmin(page, 'light', { width: 1440, height: 1000 })
  await irAProductos(page)
  /* Se anota como estaba y se normaliza: prender todo y apagar exactamente
     uno. Sin el `prenderTodo`, este gate dependia de en que estado se lo
     dejaran los specs de Dico, que corren antes y se van dejando el catalogo
     apagado. Al final se repone lo anotado. */
  const alEntrar = await anotarVisibilidad(page)
  await prenderTodo(page)
  const apagado = await ocultarUno(page)

  const filas: Array<Record<string, unknown>> = []
  const problemas: string[] = []

  for (const tema of TEMAS) {
    for (const vp of VIEWPORTS) {
      await openAdmin(page, tema, { width: vp.width, height: vp.height })

      const caso = `${tema}--${vp.nombre}`
      const m = await medirPantalla(page, MINIMO_CONTRASTE)

      // La captura es la evidencia para el ojo humano; el JSON es para poder
      // discutirla con numeros en vez de con adjetivos.
      await page.screenshot({
        path: join(SALIDA, `productos-${caso}.png`),
        fullPage: true,
        caret: 'hide',
      })

      const chicos = m.targets.filter((t) => t.h < MINIMO_TARGET || t.w < MINIMO_TARGET)
      const dePantalla = <T extends { ambito: string }>(xs: T[]) => xs.filter((x) => x.ambito === 'pantalla')
      const deShell = <T extends { ambito: string }>(xs: T[]) => xs.filter((x) => x.ambito !== 'pantalla')

      filas.push({
        caso,
        desborde: m.desborde,
        textosMedidos: m.totalTextosMedidos,
        // Lo que Phase 4 se comprometio a dejar en cero.
        contrastePantalla: dePantalla(m.textosQueFallan),
        targetsChicosPantalla: dePantalla(chicos),
        // Contexto: deuda del shell, a la vista pero fuera del gate.
        contrasteShell: deShell(m.textosQueFallan),
        targetsChicosShell: deShell(chicos),
        targets: m.targets.length,
        tituloVisible: m.tituloVisible,
        ocultos: m.ocultos,
      })

      // G4 — el contrato de A3, sin mover el umbral.
      if (m.desborde !== 0) problemas.push(`${caso}: el documento desborda ${m.desborde}px`)
      // Sanidad: si la pantalla no esta o no se midio un solo texto, todo lo
      // de arriba seria un cero vacio que parece un exito.
      if (!m.hayPantalla) problemas.push(`${caso}: no existe .ag-main — no se midio ninguna pantalla`)
      if (m.totalTextosMedidos === 0) problemas.push(`${caso}: no se midio ni un texto — la pantalla no cargo`)
    }
  }

  /* PASS 1 — la burbuja de Dico, abierta.
   *
   * El lote de arriba nunca la muestra: se abre con un gesto. Sin esta captura
   * no hay como revisar de donde sale el globo ni si se cierra tocando afuera,
   * que son dos de los puntos del pase. Se mide en los dos temas y en los dos
   * lados de la frontera de 769, que es donde Dico cambia de lugar. */
  const burbuja: Array<Record<string, unknown>> = []
  for (const tema of TEMAS) {
    for (const vp of [VIEWPORTS[0], VIEWPORTS[4]]) {
      await openAdmin(page, tema, { width: vp.width, height: vp.height })
      const caso = `${tema}--${vp.nombre}`
      const trigger = page.locator('.ag-root button.dico-avisos-trigger')
      if (await trigger.count() === 0) continue

      await trigger.click()
      await expect(trigger).toHaveAttribute('aria-expanded', 'true')
      await page.waitForTimeout(400)
      await page.screenshot({ path: join(SALIDA, `burbuja-${caso}.png`), caret: 'hide' })

      // De donde sale el globo respecto de la cara: negativo = por arriba.
      const geo = await page.evaluate(() => {
        const cara = document.querySelector('.ag-root .dico-avisos-idle')?.getBoundingClientRect()
        const globo = document.querySelector('.ag-root .dico-avisos-mensaje')?.getBoundingClientRect()
        if (!cara || !globo) return null
        return {
          caraTop: Math.round(cara.top), caraIzq: Math.round(cara.left),
          globoTop: Math.round(globo.top), globoIzq: Math.round(globo.left),
          globoAncho: Math.round(globo.width),
          /* En ESCRITORIO el contrato es "a la altura de la cara, hacia la
             derecha": el globo empieza antes de que termine la cara y no a su
             izquierda. En MOBILE no puede cumplirse —Dico vive en la barra de
             arriba y no hay pantalla por encima—, asi que ahi lo que se mide
             es que cuelgue pegado a la barra y no flotando a media altura. */
          arribaDelPie: globo.top < cara.bottom,
          aLaDerecha: globo.left >= cara.left,
          pegadoALaBarra: globo.top - cara.bottom < 24,
        }
      })

      // Cerrar tocando AFUERA: el contrato nuevo del pase.
      await page.mouse.click(5, Math.round(vp.height / 2))
      await page.waitForTimeout(250)
      const cerroAfuera = await trigger.getAttribute('aria-expanded') === 'false'

      burbuja.push({ caso, ...(geo || {}), cerroAfuera })
      if (!cerroAfuera) problemas.push(`${caso}: la burbuja no se cerro al tocar afuera`)
    }
  }

  await writeFile(join(SALIDA, 'burbuja.json'), `${JSON.stringify({ lote: LOTE, burbuja }, null, 2)}
`, 'utf8')

  // Devolver el catalogo como estaba antes de fabricar el caso de G6.
  await openAdmin(page, 'light', { width: 1440, height: 1000 })
  await irAProductos(page)
  await restaurarVisibilidad(page, alEntrar)

  await writeFile(join(SALIDA, 'medicion.json'), `${JSON.stringify({ lote: LOTE, filas }, null, 2)}\n`, 'utf8')

  // El lote `antes` DOCUMENTA el estado; no falla por el. Fallar ahi seria no
  // poder capturar nunca el baseline de una pantalla que justamente sabemos
  // que tiene deuda. El lote `despues` SI exige los contratos.
  if (LOTE.endsWith('despues')) {
    const g1 = filas.flatMap((f) => (f.contrastePantalla as unknown[]).map((d) => ({ caso: f.caso, d })))
    const g3 = filas.flatMap((f) => (f.targetsChicosPantalla as unknown[]).map((t) => ({ caso: f.caso, t })))
    expect(g1, `G1 — textos de la pantalla por debajo de ${MINIMO_CONTRASTE}:1`).toEqual([])
    expect(g3, `G3 — targets de la pantalla por debajo de ${MINIMO_TARGET}px`).toEqual([])

    /* ── G6 · PRODUCTOS OCULTOS ─────────────────────────────────────────
     * La regresion especifica de PASS 3. G1 ya cubre "ningun texto de la
     * pantalla falla", asi que esto no agrega cobertura: agrega INTENCION.
     * Si mañana alguien vuelve a atenuar una fila apagada con `opacity`, el
     * error va a decir que rompio el contrato de los productos ocultos y con
     * que numero, en vez de aparecer como un texto mas en una lista de
     * treinta. Y el artifact guarda el margen de cada fila, no solo el
     * veredicto, para poder ver cuanto falta antes de que sea un problema.
     *
     * Se exige que la medicion EXISTA: un seed sin ningun producto apagado
     * dejaria este gate pasando en verde sin haber medido nada. */
    const medidas = filas.flatMap((f) => (f.ocultos as Array<Record<string, unknown>>)
      .map((o) => ({ caso: f.caso, ...o })))
    expect(medidas.length, 'G6 — no se midio ningun producto oculto: el fixture no tiene ninguno apagado')
      .toBeGreaterThan(0)
    const flojos = medidas.filter((o) => !o.cumple)
    expect(flojos, 'G6 — texto o control de un producto oculto por debajo de AA').toEqual([])
  }
  expect(problemas, 'G4 y sanidad de la medicion').toEqual([])
})
