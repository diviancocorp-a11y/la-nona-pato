import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from './fixtures'
import { MOBILE } from './surfaces'

/**
 * Forense del carrusel del catalogo. NO es un gate: instrumenta y reporta.
 *
 * Contesta con datos las tres preguntas que quedaron abiertas:
 *   1. por que hay dos capas `cp-pcg-horiz` a la vez
 *   2. quien agenda las animaciones que aparecen DESPUES de la quietud
 *   3. cuando pasa el tema de vacio a `ambar`
 */
const SALIDA = join(process.cwd(), '.qa-lite', 'artifacts', 'catalog-forensics')



test('forense del carrusel y del tema', async ({ page }) => {
  await page.setViewportSize(MOBILE)

  // Se instala ANTES de navegar: hay que ver el primer frame, no el estado ya
  // asentado. Un observador que llega tarde no puede distinguir "nacio asi" de
  // "cambio y se acomodo".
  await page.addInitScript(() => {
    const w = window as unknown as { __forense?: Record<string, unknown[]> }
    const t0 = performance.now()
    const reloj = () => Math.round(performance.now() - t0)
    w.__forense = { tema: [], capas: [], animaciones: [], mutaciones: [] }
    const F = w.__forense as Record<string, unknown[]>

    const describir = (el: Element) => {
      const camino: string[] = []
      let actual: Element | null = el
      while (actual && camino.length < 5) {
        const clases = String(actual.className || '').trim().split(/\s+/).filter(Boolean).slice(0, 3)
        camino.push(actual.tagName.toLowerCase() + (clases.length ? `.${clases.join('.')}` : ''))
        actual = actual.parentElement
      }
      return camino.join(' < ')
    }

    const mirar = () => {
      // 1. Tema: valor crudo del atributo que decide el tema del catalogo.
      const tema = document.body?.getAttribute('data-cp-theme') ?? '(sin body)'
      const ultimoTema = F.tema[F.tema.length - 1] as { valor?: string } | undefined
      if (!ultimoTema || ultimoTema.valor !== tema) F.tema.push({ ms: reloj(), valor: tema })

      // 2. Capas del carrusel, con identidad y estado visual de cada una.
      const capas = [...document.querySelectorAll('.cp-pcg-card [style*="cp-pcg-horiz"]')].map((el) => {
        const capa = el.closest('.cp-pcg-card > div') as HTMLElement | null
        const estilo = capa ? getComputedStyle(capa) : null
        return {
          camino: describir(el),
          capaEstilo: capa?.getAttribute('style')?.slice(0, 90) || null,
          opacity: estilo?.opacity ?? null,
          transform: estilo?.transform ?? null,
          clip: estilo?.clipPath ?? null,
        }
      })
      const firma = JSON.stringify(capas.map((c) => [c.camino, c.opacity, c.clip]))
      const ultima = F.capas[F.capas.length - 1] as { firma?: string } | undefined
      if (!ultima || ultima.firma !== firma) F.capas.push({ ms: reloj(), cuantas: capas.length, firma, capas })

      // 3. Animaciones vivas, para ver cuando aparece la tanda nueva.
      const vivas = document.getAnimations().map((a) => {
        const efecto = a.effect
        const target = efecto instanceof KeyframeEffect && efecto.target instanceof Element ? efecto.target : null
        return `${a instanceof CSSAnimation ? a.animationName : (a instanceof CSSTransition ? a.transitionProperty : a.id)}@${target ? describir(target).split(' < ')[0] : '?'}`
      }).sort()
      const firmaA = vivas.join(',')
      const ultimaA = F.animaciones[F.animaciones.length - 1] as { firma?: string } | undefined
      if (!ultimaA || ultimaA.firma !== firmaA) F.animaciones.push({ ms: reloj(), cuantas: vivas.length, firma: firmaA })

      requestAnimationFrame(mirar)
    }
    requestAnimationFrame(mirar)

    // 4. Quien monta y desmonta la capa: mutaciones sobre la tarjeta.
    const observarTarjeta = () => {
      const card = document.querySelector('.cp-pcg-card')
      if (!card) { setTimeout(observarTarjeta, 50); return }
      new MutationObserver((registros) => {
        for (const r of registros) {
          if (r.type !== 'childList') continue
          for (const n of r.addedNodes) {
            if (n instanceof Element) F.mutaciones.push({ ms: reloj(), que: 'monta', nodo: describir(n) })
          }
          for (const n of r.removedNodes) {
            if (n instanceof Element) F.mutaciones.push({ ms: reloj(), que: 'desmonta', nodo: describir(n) })
          }
        }
      }).observe(card, { childList: true, subtree: false })
    }
    observarTarjeta()
  })

  await page.goto('/')
  await page.waitForSelector('.cp-pcg-card', { timeout: 20000 })
  // 12 segundos: mas de dos ciclos de autoplay (4,5s) y mas que cualquier
  // carga de datos razonable.
  await page.waitForTimeout(12000)

  // De donde sale el `false`: la opcion del contexto o la emulacion explicita.
  const porContexto = await page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const porEmulateMedia = await page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const diagnosticoReduce = { porContexto, porEmulateMedia }

  const datos = await page.evaluate(() => ({
    reduce: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    tarjetas: document.querySelectorAll('.cp-pcg-card').length,
    forense: (window as unknown as { __forense: unknown }).__forense,
  }))

  await mkdir(SALIDA, { recursive: true })
  await writeFile(join(SALIDA, 'forense.json'), `${JSON.stringify({ ...datos, diagnosticoReduce }, null, 2)}\n`, 'utf8')

  const f = datos.forense as Record<string, Array<Record<string, unknown>>>
  console.log(`reduced-motion: ${datos.reduce}   tarjetas: ${datos.tarjetas}`)
  console.log(`\n== tema (cambios) ==`)
  for (const t of f.tema) console.log(`  ${String(t.ms).padStart(6)}ms  "${t.valor}"`)
  console.log(`\n== capas (cambios de firma) ==`)
  for (const c of f.capas) console.log(`  ${String(c.ms).padStart(6)}ms  ${c.cuantas} capa(s)`)
  console.log(`\n== animaciones (cambios de conjunto) ==`)
  for (const a of f.animaciones.slice(0, 40)) console.log(`  ${String(a.ms).padStart(6)}ms  ${a.cuantas}`)
  console.log(`\n== mutaciones en la tarjeta ==`)
  for (const m of f.mutaciones.slice(0, 30)) console.log(`  ${String(m.ms).padStart(6)}ms  ${m.que}  ${m.nodo}`)
})
