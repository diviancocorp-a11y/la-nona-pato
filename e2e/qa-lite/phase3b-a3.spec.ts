import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test, expect, aplicarMovimiento } from './fixtures'
import { DESKTOP, openAdmin } from './surfaces'

/**
 * Phase 3B — gate A3, cierre INTEGRADO del shell.
 *
 * El gate esta definido en `DICO-IMPLEMENTATION-STATUS.md` por sus seis
 * dimensiones —browser, light/dark, mobile, navegacion, focus y overflow— y no
 * por un procedimiento paso a paso. Asi que este spec no inventa umbrales:
 * re-mide sobre el HEAD integrado los contratos que Phase 3A y 3B YA dejaron
 * persistidos con numeros, que es lo unico que "cerrar integrado" puede
 * significar. Cada asercion cita de donde sale su numero.
 *
 * Lo que hace distinto a A3 de los gates de 3A/3B: aquellos midieron el shell
 * en su propia rama. Este lo mide despues de Machine Soul, del recovery
 * Presence/Slot, de Dico Native 2D, del runtime Physical y de Phase 9 — o sea,
 * con todo lo que se le monto encima.
 */
const SALIDA = join(process.cwd(), '.qa-lite', 'artifacts', 'phase3b-a3')

const TEMAS = ['light', 'dark'] as const

/* Los dos anchos que Phase 3A midio para la nav (PHASE-3A-CORRECTNESS.md 1.2).
 * 360 no es un capricho: es el ancho donde la pildora vieja desbordaba 181px. */
const ANCHOS_MOBILE = [
  { nombre: '390x844', width: 390, height: 844 },
  { nombre: '360x800', width: 360, height: 800 },
] as const

/** Lo que se ve del shell, medido en el navegador. */
const medirShell = (page: import('@playwright/test').Page) => page.evaluate(() => {
  const raiz = document.documentElement
  const items = [...document.querySelectorAll('.ag-bottom-nav .ag-nav-item')]
  const vpW = window.innerWidth
  const vpH = window.innerHeight
  return {
    // Contrato de overflow: el documento no puede ser mas ancho que el viewport.
    clientWidth: raiz.clientWidth,
    scrollWidth: raiz.scrollWidth,
    desborde: raiz.scrollWidth - raiz.clientWidth,
    nav: items.map((el) => {
      const b = el.getBoundingClientRect()
      return {
        nombre: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40),
        x: +b.x.toFixed(1),
        der: +(b.x + b.width).toFixed(1),
        w: +b.width.toFixed(1),
        h: +b.height.toFixed(1),
        // "Inalcanzable" en el sentido de 3A: el item queda fuera del viewport.
        fueraDelViewport: b.x < 0 || b.x + b.width > vpW || b.y + b.height > vpH,
      }
    }),
    // Autoridad de tema: `.ag-root` es el limite del owner `admin`
    // (DICO-PHASE-2B-THEME-OWNERSHIP.md).
    raizAdmin: (() => {
      const r = document.querySelector('.ag-root')
      if (!r) return null
      const cs = getComputedStyle(r)
      return {
        clases: r.className,
        // Los tokens que Phase 3A definio POR TEMA porque antes caian a su
        // fallback fijo y abrian el contraste a 1,24:1 en oscuro.
        surface: cs.getPropertyValue('--ag-surface').trim(),
        ink: cs.getPropertyValue('--ag-ink').trim(),
        ok: cs.getPropertyValue('--ag-ok').trim(),
        bad: cs.getPropertyValue('--ag-bad').trim(),
        warn: cs.getPropertyValue('--ag-warn').trim(),
        accentBorder: cs.getPropertyValue('--ag-accent-border').trim(),
        // Contraste REAL del par del shell, resuelto por el navegador. Es el
        // mismo par que 3A midio en 1,24:1: tinta sobre superficie.
        contraste: (() => {
          const canal = (c: number) => {
            const v = c / 255
            return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
          }
          const lum = (color: string) => {
            const sonda = document.createElement('span')
            sonda.style.color = color
            document.body.appendChild(sonda)
            const rgb = getComputedStyle(sonda).color.match(/\d+(\.\d+)?/g)
            sonda.remove()
            if (!rgb) return null
            const [r2, g2, b2] = rgb.slice(0, 3).map(Number)
            return 0.2126 * canal(r2) + 0.7152 * canal(g2) + 0.0722 * canal(b2)
          }
          const a = lum(cs.getPropertyValue('--ag-ink').trim())
          const b = lum(cs.getPropertyValue('--ag-surface').trim())
          if (a === null || b === null) return null
          const hi = Math.max(a, b)
          const lo = Math.min(a, b)
          return +(((hi + 0.05) / (lo + 0.05))).toFixed(2)
        })(),
      }
    })(),
  }
})

test('A3 — navegacion, overflow y tokens por tema, en los dos temas y los dos anchos', async ({ page }) => {
  await aplicarMovimiento(page, 'no-preference')
  await mkdir(SALIDA, { recursive: true })

  const filas: Array<Record<string, unknown>> = []
  const problemas: string[] = []
  /** Los tokens de cada tema, para compararlos ENTRE SI al final. */
  const contraste: Record<string, { surface: string; ink: string; contraste: number | null }> = {}

  for (const tema of TEMAS) {
    // ── Escritorio: overflow y tokens ────────────────────────────────────
    await openAdmin(page, tema, DESKTOP)
    const escritorio = await medirShell(page)
    filas.push({ caso: `${tema}/1440x1000`, ...escritorio })
    await page.screenshot({ path: join(SALIDA, `shell-${tema}-1440.png`), caret: 'hide' })

    if (escritorio.desborde !== 0) {
      problemas.push(`${tema}/1440: el documento desborda ${escritorio.desborde}px`)
    }
    if (!escritorio.raizAdmin) {
      problemas.push(`${tema}/1440: no hay .ag-root — el shell perdio su autoridad de tema`)
    } else {
      // PHASE-3A-CORRECTNESS.md 1.1: la tabla de tokens por tema. Si alguno
      // vuelve a resolver vacio, volvio a caer al fallback fijo y el par de
      // contraste se abre otra vez sin que falle nada visible.
      for (const [token, valor] of Object.entries(escritorio.raizAdmin)) {
        if (token === 'clases') continue
        if (!valor) problemas.push(`${tema}/1440: --ag-${token} no resuelve (volvio al fallback)`)
      }
      // OJO CON LOS HEXES DE 3A: no se comparan contra la tabla.
      //
      // Phase 3B re-baso la escala neutra a Zinc/Carbon y lo dejo declarado en
      // su seccion 0 ("Divergencia declarada"), asi que hoy `--ag-surface` es
      // `var(--ms-white)` en claro y `var(--ms-zinc-900)` en oscuro. Exigir
      // #FFFDF7/#262626 seria hacer fallar al shell por cumplir 3B.
      //
      // Lo que SI sigue vigente es el defecto que 3A vino a matar: los tokens
      // no existian, cada `var(--ag-surface, #fffdf7)` caia a su literal fijo,
      // y en oscuro el fondo quedaba congelado en el crema del claro mientras
      // el texto seguia al tema — 1,24:1. La firma de esa falla no es un hex
      // concreto: es que el token valga LO MISMO en los dos temas. Eso es lo
      // que se mide, mas el contraste real del par del shell.
      contraste[tema] = escritorio.raizAdmin
    }

    // ── Mobile: navegacion y overflow en los dos anchos medidos por 3A ───
    for (const ancho of ANCHOS_MOBILE) {
      await openAdmin(page, tema, { width: ancho.width, height: ancho.height })
      const m = await medirShell(page)
      filas.push({ caso: `${tema}/${ancho.nombre}`, ...m })
      await page.screenshot({ path: join(SALIDA, `shell-${tema}-${ancho.nombre}.png`), caret: 'hide' })

      const etiqueta = `${tema}/${ancho.nombre}`
      // 3A 1.2, columna "Desborde": 0. No se sube.
      if (m.desborde !== 0) problemas.push(`${etiqueta}: la nav desborda ${m.desborde}px`)
      // Columna "Inalcanzables": ninguna.
      const fuera = m.nav.filter((i) => i.fueraDelViewport)
      if (fuera.length) {
        problemas.push(`${etiqueta}: ${fuera.length} seccion(es) fuera del viewport (${fuera.map((i) => i.nombre).join(', ')})`)
      }
      // Columna "Targets < 44": 0. Es el minimo tactil, no un promedio.
      const chicos = m.nav.filter((i) => i.h < 44 || i.w < 44)
      if (chicos.length) {
        problemas.push(`${etiqueta}: ${chicos.length} target(s) bajo 44px (${chicos.map((i) => `${i.nombre} ${i.w}x${i.h}`).join(', ')})`)
      }
      if (!m.nav.length) problemas.push(`${etiqueta}: no hay navegacion inferior`)
    }
  }

  // ── La firma del defecto de 3A, medida entre temas ──────────────────────
  // Si `--ag-surface` vuelve a valer lo mismo en claro y en oscuro, es que
  // volvio a caer a un literal fijo: exactamente el bug que abrio el par a
  // 1,24:1 y que sobrevivio meses porque `var()` con fallback nunca falla.
  if (contraste.light && contraste.dark) {
    if (contraste.light.surface === contraste.dark.surface) {
      problemas.push(`--ag-surface vale lo mismo en los dos temas (${contraste.light.surface}): volvio al fallback fijo`)
    }
    if (contraste.light.ink === contraste.dark.ink) {
      problemas.push(`--ag-ink vale lo mismo en los dos temas (${contraste.light.ink})`)
    }
    // Y el par real del shell —tinta sobre superficie, el que 3A midio en
    // 1,24:1— tiene que pasar AA. 4,5:1 no es un umbral nuevo: es el que 3A
    // uso para declarar que 20 de 23 elementos "incumplian".
    for (const tema of TEMAS) {
      const c = contraste[tema]?.contraste
      if (c === null || c === undefined) {
        problemas.push(`${tema}: no se pudo medir el contraste del par del shell`)
      } else if (c < 4.5) {
        problemas.push(`${tema}: tinta sobre superficie da ${c}:1, AA pide 4.5:1`)
      }
    }
  } else {
    problemas.push('no se pudieron leer los tokens en los dos temas')
  }

  await writeFile(join(SALIDA, 'shell.json'), `${JSON.stringify(filas, null, 2)}\n`, 'utf8')
  await writeFile(join(SALIDA, 'shell-problemas.json'), `${JSON.stringify(problemas, null, 2)}\n`, 'utf8')
  expect(problemas, 'contratos de shell rotos').toEqual([])
})

test('A3 — el dialogo atrapa el foco, cierra con Escape y tapa la navegacion', async ({ page }) => {
  await aplicarMovimiento(page, 'no-preference')
  await mkdir(SALIDA, { recursive: true })

  const problemas: string[] = []
  const filas: Array<Record<string, unknown>> = []

  for (const tema of TEMAS) {
    // La hoja de "Mas" es el `Dialog` de 3A montado en el shell real: es la
    // via honesta de ejercitar la primitiva sin fabricar un caso de prueba.
    await openAdmin(page, tema, { width: 390, height: 844 })
    const mas = page.locator('.ag-nav-item--mas')
    if (await mas.count() === 0) {
      problemas.push(`${tema}: no hay boton "Mas" — el desborde accesible de 3A no se monto`)
      continue
    }

    await mas.click()
    const dialogo = page.locator('[role="dialog"]')
    await expect(dialogo).toBeVisible()

    const medida = await page.evaluate(() => {
      const dlg = document.querySelector('[role="dialog"]') as HTMLElement | null
      if (!dlg) return null
      const backdrop = document.querySelector('.ag-dialog-backdrop') as HTMLElement | null
      const zDe = (el: Element | null) => (el ? getComputedStyle(el).zIndex : null)
      const b = backdrop?.getBoundingClientRect()
      // 3A 1.3/1.4: "0 de 5 items de nav reciben el click con el dialogo
      // abierto (antes 8 de 8), todos tapados por el backdrop".
      const items = [...document.querySelectorAll('.ag-bottom-nav .ag-nav-item')]
      const reciben = items.filter((el) => {
        const r = el.getBoundingClientRect()
        const arriba = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
        return arriba === el || el.contains(arriba)
      }).length
      return {
        zPanel: zDe(dlg),
        zBackdrop: zDe(backdrop),
        backdropCubreViewport: b
          ? b.width >= window.innerWidth && b.height >= window.innerHeight
          : false,
        itemsDeNavQueRecibenClick: reciben,
        totalItemsDeNav: items.length,
        focoAdentro: dlg.contains(document.activeElement),
        foco: document.activeElement?.tagName.toLowerCase() || null,
        ariaModal: dlg.getAttribute('aria-modal'),
      }
    })
    filas.push({ tema, ...medida })

    if (!medida) {
      problemas.push(`${tema}: el dialogo no llego al DOM`)
      continue
    }
    // Contrato de foco de 3A: al abrir, el foco cae DENTRO del dialogo.
    if (!medida.focoAdentro) {
      problemas.push(`${tema}: el foco quedo fuera del dialogo (${medida.foco})`)
    }
    // Contrato de capas de 3A: backdrop 800, panel 810 — los numeros exactos
    // que dejo escritos, no "un z-index alto".
    if (medida.zBackdrop !== '800') {
      problemas.push(`${tema}: backdrop z=${medida.zBackdrop}, el contrato dice 800`)
    }
    if (medida.zPanel !== '810') {
      problemas.push(`${tema}: panel z=${medida.zPanel}, el contrato dice 810`)
    }
    if (!medida.backdropCubreViewport) {
      problemas.push(`${tema}: el backdrop no cubre el viewport`)
    }
    // La regresion que 3A vino a matar: el stacking context de `main`
    // encerraba al dialogo y la nav seguia clickeable por debajo.
    if (medida.itemsDeNavQueRecibenClick !== 0) {
      problemas.push(`${tema}: ${medida.itemsDeNavQueRecibenClick}/${medida.totalItemsDeNav} items de nav siguen recibiendo el click con el dialogo abierto`)
    }

    // Escape cierra: el otro medio defecto de 1.3.
    await page.keyboard.press('Escape')
    await expect(dialogo, `${tema}: Escape no cerro el dialogo`).toHaveCount(0)
  }

  await writeFile(join(SALIDA, 'dialogo.json'), `${JSON.stringify(filas, null, 2)}\n`, 'utf8')
  await writeFile(join(SALIDA, 'dialogo-problemas.json'), `${JSON.stringify(problemas, null, 2)}\n`, 'utf8')
  expect(problemas, 'contratos de foco y capas rotos').toEqual([])
})
