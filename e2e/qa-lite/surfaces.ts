import type { Locator, Page } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, stabilizePage } from './fixtures'
import { navigateToAdminWithTheme } from './admin-theme.mjs'
import { recordAdminScrollCheckpoint } from './scroll-trace'
import {
  advanceFiniteAnimationQuiescence,
  FINITE_ANIMATION_TIMEOUT_MS,
  REQUIRED_QUIET_FRAMES,
} from './finite-animation-quiescence.mjs'
import {
  DICO_NEUTRAL_STRATEGY,
  validateDicoMotionStack,
} from './dico-neutral-contract.mjs'

export const DESKTOP = { width: 1440, height: 1000 }
export const MOBILE = { width: 390, height: 844 }

export function localStatusFromEnv() {
  const apiUrl = process.env.QA_SUPABASE_URL
  const serviceRoleKey = process.env.QA_SUPABASE_SERVICE_ROLE
  if (!apiUrl || !serviceRoleKey) throw new Error('Faltan variables locales QA_SUPABASE_URL/QA_SUPABASE_SERVICE_ROLE')
  const hostname = new URL(apiUrl).hostname
  if (!['127.0.0.1', 'localhost'].includes(hostname)) throw new Error(`Supabase QA no local: ${hostname}`)
  return { apiUrl, serviceRoleKey, anonKey: process.env.QA_SUPABASE_ANON_KEY || '' }
}

const finiteAnimationDiagnosticSequence = new Map<string, number>()

async function saveFiniteAnimationDiagnostic(surface: string, value: unknown) {
  const artifactRoot = process.env.QA_ARTIFACT_DIR
  const phase = process.env.QA_PHASE
  if (!artifactRoot || !phase) return null
  const key = `${phase}:${surface}`
  const sequence = (finiteAnimationDiagnosticSequence.get(key) || 0) + 1
  finiteAnimationDiagnosticSequence.set(key, sequence)
  const safeSurface = surface.replace(/[^a-z0-9_-]+/gi, '-')
  const root = join(artifactRoot, phase, 'finite-animation-diagnostics')
  const path = join(root, `${safeSurface}--${String(sequence).padStart(2, '0')}.json`)
  await mkdir(root, { recursive: true })
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  return path
}

async function waitForFiniteAnimations(root: Locator, surface: string) {
  const startedAt = performance.now()
  let frame = 0
  let state = { quietFrames: 0, quiescent: false, timedOut: false }
  const observed = new Map<string, Record<string, unknown>>()
  let lastActiveCount = 0

  while (!state.quiescent && !state.timedOut) {
    const snapshot = await root.evaluate((element) => new Promise<{
      activeCount: number
      animations: Array<Record<string, unknown>>
    }>((resolveFrame) => {
      requestAnimationFrame(() => {
        const describe = (target: Element | null) => {
          if (!target) return null
          const clean = (value: string) => value.replace(/[^a-z0-9_-]/gi, '-').slice(0, 80)
          const id = target.id ? `#${clean(target.id)}` : ''
          const classes = Array.from(target.classList)
            .slice(0, 8)
            .map((name) => `.${clean(name)}`)
            .join('')
          return `${target.tagName.toLowerCase()}${id}${classes}`
        }
        const animations = element.getAnimations({ subtree: true })
          .map((animation) => {
            const computed = animation.effect?.getComputedTiming()
            if (!computed || !Number.isFinite(Number(computed.endTime))) return null
            const timing = animation.effect?.getTiming()
            const target = animation.effect instanceof KeyframeEffect
              && animation.effect.target instanceof Element
              ? animation.effect.target
              : null
            return {
              constructor: animation.constructor.name,
              animationName: animation instanceof CSSAnimation ? animation.animationName : null,
              transitionProperty: animation instanceof CSSTransition
                ? animation.transitionProperty
                : null,
              target: describe(target),
              duration: Number(timing?.duration),
              delay: Number(timing?.delay),
              iterations: timing?.iterations,
              endTime: Number(computed.endTime),
              playState: animation.playState,
            }
          })
          .filter((animation): animation is NonNullable<typeof animation> => animation !== null)
        resolveFrame({
          activeCount: animations.filter(({ playState }) => (
            playState === 'pending' || playState === 'running'
          )).length,
          animations,
        })
      })
    }))
    frame += 1
    lastActiveCount = snapshot.activeCount
    for (const animation of snapshot.animations) {
      const key = JSON.stringify(animation)
      const previous = observed.get(key)
      observed.set(key, {
        ...animation,
        firstFrame: previous?.firstFrame || frame,
        lastFrame: frame,
        observations: Number(previous?.observations || 0) + 1,
      })
    }
    state = advanceFiniteAnimationQuiescence(state, {
      activeCount: snapshot.activeCount,
      elapsedMs: performance.now() - startedAt,
    })
  }

  const active = await root.evaluate((element) => element
    .getAnimations({ subtree: true })
    .filter((animation) => {
      const timing = animation.effect?.getComputedTiming()
      return timing
        && Number.isFinite(Number(timing.endTime))
        && (animation.playState === 'pending' || animation.playState === 'running')
    })
    .length)
  const diagnostic = {
    surface,
    requiredQuietFrames: REQUIRED_QUIET_FRAMES,
    timeoutMs: FINITE_ANIMATION_TIMEOUT_MS,
    elapsedMs: Math.round(performance.now() - startedAt),
    framesObserved: frame,
    quietFrames: state.quietFrames,
    timedOut: state.timedOut,
    lastActiveCount,
    finalActiveCount: active,
    observed: Array.from(observed.values()),
  }
  const diagnosticPath = await saveFiniteAnimationDiagnostic(surface, diagnostic)
  if (state.timedOut) {
    throw new Error(`FINITE ANIMATIONS DID NOT QUIESCE (${surface}) after ${FINITE_ANIMATION_TIMEOUT_MS}ms${
      diagnosticPath ? ` — artifact: ${diagnosticPath}` : ''
    }\n${JSON.stringify(diagnostic.observed, null, 2)}`)
  }
  expect(active).toBe(0)
}

async function expectStableLayout(page: Page, locators: Locator[]) {
  const measure = () => Promise.all(locators.map((locator) => locator.evaluate((element) => {
    const box = element.getBoundingClientRect()
    const text = (element.textContent || '').replace(/\s+/g, ' ').trim()
    return {
      text,
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
    }
  })))
  const before = await measure()
  await page.evaluate(() => new Promise<void>((resolveFrame) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolveFrame()))
  }))
  expect(await measure()).toEqual(before)
}

export const ADMIN_CONTINUOUS_DECORATIVE_MOTION = [
  {
    selector: '.ag-bg-glow.g1',
    expectedName: 'ag-glow-drift-1',
    duration: 38000,
    iterations: Infinity,
    freezeAt: 0,
    expectedCount: 1,
  },
  {
    selector: '.ag-bg-glow.g2',
    expectedName: 'ag-glow-drift-2',
    duration: 46000,
    iterations: Infinity,
    freezeAt: 0,
    expectedCount: 1,
  },
  // Dico ya no aporta movimiento INFINITO a esta superficie: el personaje es
  // una imagen y su pulso en `attention` corre dos vueltas y se detiene. Lo
  // que queda —entrada y pulso, los dos finitos— lo cubre
  // `DICO_NEUTRAL_STRATEGY`, que los neutraliza en su estado final.
  //
  // El SVG viejo sigue existiendo (`DicoCoreEscena` en el panel de productos
  // vacio) y sigue teniendo sus cinco loops. Sacarlo de aca NO es aflojar el
  // gate: si alguna vez cae en una superficie capturada, el guard de motion
  // sin registrar lo va a marcar como no declarado, que es lo correcto.
  {
    selector: '.dico-native-caja',
    expectedName: 'dico-native-entrada',
    duration: 1050,
    iterations: 1,
    strategy: 'static-neutral-dico',
    expectedCount: 1,
  },
  {
    selector: '.dico-pulso-giro',
    expectedName: 'dico-pulso-vuelta',
    duration: 1872,
    iterations: 2,
    strategy: 'static-neutral-dico',
    expectedCount: 1,
  },
  {
    // El unico movimiento realmente continuo que queda en la superficie.
    // `settleAdmin` deja el aviso ABIERTO, y con el aviso abierto la actividad
    // es `active`: el brillo Volt late sobre el aro del arte, para siempre.
    // Se congela en 0, que es el piso del latido (opacidad .42) y no depende
    // de cuando se saco la foto.
    selector: '.dico-pulso-brillo',
    expectedName: 'dico-pulso-activo',
    duration: 2800,
    iterations: Infinity,
    freezeAt: 0,
    expectedCount: 1,
    // El brillo late SOLO en `active`. En las demas actividades el elemento
    // existe y no anima. Declararlo asi permite exigir las dos mitades: con el
    // aviso abierto tiene que latir, y con el aviso cerrado tiene que estar
    // quieto. Aceptar "cero animaciones" a secas dejaria pasar un pulso que
    // dejo de funcionar.
    whenActivity: 'active',
  },
] as const

export const CATALOG_CONTINUOUS_DECORATIVE_MOTION = [
  {
    // La palabra que rota en el titulo. Antes era un `setInterval` que este
    // registro no podia ver ni congelar, y por eso `catalog--ambar` salia
    // distinto entre dos corridas del mismo commit. Ahora es una animacion CSS
    // declarada: tres palabras apiladas con el mismo ciclo y retraso
    // escalonado. Se congela en 1000ms, que cae dentro de la ventana en la que
    // la PRIMERA esta completamente visible y las otras dos siguen en su fase
    // de retraso, o sea con la opacidad 0 del fill `backwards`.
    selector: '.cp-verbo-palabra',
    expectedName: 'cp-verbo-rota',
    duration: 7500,
    iterations: Infinity,
    freezeAt: 1000,
    expectedCount: 3,
  },
  {
    selector: '.cp-pcg-card [aria-hidden][style*="cp-pcg-vert"]',
    expectedName: 'cp-pcg-vert',
    duration: 30000,
    iterations: Infinity,
    freezeAt: 0,
    expectedCount: 1,
  },
  {
    selector: '.cp-pcg-card [aria-hidden][style*="cp-pcg-circle"][style*="20s"]',
    expectedName: 'cp-pcg-circle',
    duration: 20000,
    iterations: Infinity,
    freezeAt: 0,
    expectedCount: 1,
  },
  {
    selector: '.cp-pcg-card [aria-hidden][style*="cp-pcg-circle"][style*="40s"]',
    expectedName: 'cp-pcg-circle',
    duration: 40000,
    iterations: Infinity,
    freezeAt: 0,
    expectedCount: 1,
  },
  {
    selector: '.cp-pcg-card [aria-hidden][style*="cp-pcg-horiz"]',
    expectedName: 'cp-pcg-horiz',
    duration: 40000,
    iterations: Infinity,
    freezeAt: 0,
    expectedCount: 1,
  },
  {
    selector: '.cp-pcg-card [aria-hidden][style*="cp-pcg-circle"][style*="24s"]',
    expectedName: 'cp-pcg-circle',
    duration: 24000,
    iterations: Infinity,
    freezeAt: 0,
    expectedCount: 1,
  },
] as const

function motionRegistryForSurface(surface: string) {
  return surface.startsWith('catalog--')
    ? CATALOG_CONTINUOUS_DECORATIVE_MOTION
    : ADMIN_CONTINUOUS_DECORATIVE_MOTION
}

async function inventoryInfiniteMotion(page: Page, surface: string) {
  const registry = motionRegistryForSurface(surface)
  const registrySelectors = registry.map((entry) => entry.selector)
  const animations = await page.evaluate((selectors) => {
    const describe = (element: Element | null) => {
      if (!element) return null
      const id = element.id ? `#${element.id}` : ''
      const classes = Array.from(element.classList).map((name) => `.${name}`).join('')
      return `${element.tagName.toLowerCase()}${id}${classes}`
    }
    const isDicoElement = (element: Element) => Array.from(element.classList)
      .some((name) => name === 'dico' || name.startsWith('dico-') || name.startsWith('dico--'))
    const nearestDico = (element: Element) => {
      let current: Element | null = element
      while (current && !isDicoElement(current)) current = current.parentElement
      return current
    }

    return document.getAnimations()
      .map((animation) => {
        const effect = animation.effect
        const target = effect instanceof KeyframeEffect && effect.target instanceof Element
          ? effect.target
          : null
        const timing = effect?.getTiming()
        if (!target || timing?.iterations !== Infinity) return null
        return {
          selector: describe(target),
          className: target.getAttribute('class') || '',
          animationName: animation instanceof CSSAnimation ? animation.animationName : animation.id,
          duration: Number(timing.duration),
          iterations: 'Infinity',
          playState: animation.playState,
          dicoElementOrAncestor: describe(nearestDico(target)),
          registeredSelector: selectors.find((selector) => target.matches(selector)) || null,
        }
      })
      .filter((entry) => entry !== null)
  }, registrySelectors)

  const artifactRoot = process.env.QA_ARTIFACT_DIR
  const phase = process.env.QA_PHASE
  if (artifactRoot && phase) {
    const root = join(artifactRoot, phase, 'motion-inventory')
    await mkdir(root, { recursive: true })
    await writeFile(join(root, `${surface}.json`), `${JSON.stringify(animations, null, 2)}\n`, 'utf8')
  }

  const unknown = animations.filter((animation) => animation.registeredSelector === null)
  if (unknown.length > 0) {
    throw new Error(`QA Lite infinite motion not allowlisted (${surface}):\n${JSON.stringify(unknown, null, 2)}`)
  }
  return animations
}

export async function inventoryAdminInfiniteMotion(page: Page, surface: string) {
  return inventoryInfiniteMotion(page, surface)
}

export async function inventoryCatalogInfiniteMotion(page: Page, surface: string) {
  return inventoryInfiniteMotion(page, surface)
}

async function installDicoMotionStackObserver(page: Page) {
  await page.addInitScript((contract) => {
    const cacheKey = 'qa-lite:dico-original-motion-stack'
    const state = window as unknown as { __qaDicoMotionStack?: unknown }
    const cached = sessionStorage.getItem(cacheKey)
    if (cached) {
      state.__qaDicoMotionStack = JSON.parse(cached, (_key, value) => (
        value === '__qa_infinity__' ? Infinity : value
      ))
      return
    }
    state.__qaDicoMotionStack = undefined
    const snapshot = () => contract.nodes.map((entry) => ({
      selector: entry.selector,
      nodes: Array.from(document.querySelectorAll(entry.selector)).map((element) => {
        const style = getComputedStyle(element)
        const box = element.getBoundingClientRect()
        return {
          target: `${element.tagName.toLowerCase()}.${Array.from(element.classList).join('.')}`,
          styles: {
            animationName: style.animationName,
            transform: style.transform,
            opacity: style.opacity,
            filter: style.filter,
            transformStyle: style.transformStyle,
          },
          box: { x: box.x, y: box.y, width: box.width, height: box.height },
          animations: element.getAnimations().map((animation) => {
            const timing = animation.effect?.getTiming()
            return {
              name: animation instanceof CSSAnimation ? animation.animationName : animation.id,
              duration: Number(timing?.duration),
              iterations: timing?.iterations,
              playState: animation.playState,
              currentTime: animation.currentTime === null ? null : Number(animation.currentTime),
            }
          }),
        }
      }),
    }))
    // El observer espera a que TODOS los selectores del contrato lleguen a su
    // cuenta. Si uno nunca aparece —porque el componente dejo de montarse— la
    // espera no termina nunca y del lado de Node solo se ve "el predicado
    // expiro", que no dice cual falto. Se guarda ademas lo ULTIMO que se vio,
    // para poder responder la pregunta en positivo: que hay realmente en la
    // pantalla.
    const state2 = state as { __qaDicoMotionStackVisto?: unknown }
    const observe = () => {
      if (state.__qaDicoMotionStack !== undefined) return
      const candidate = snapshot()
      state2.__qaDicoMotionStackVisto = candidate.map((group, index) => ({
        selector: group.selector,
        esperados: contract.nodes[index].expectedCount,
        encontrados: group.nodes.length,
      }))
      // La mitad positiva: que animaciones de Dico HAY corriendo. Sin esto el
      // diagnostico dice que falta, pero no que lo reemplazo.
      state2.__qaDicoMotionVivo = Array.from(document.querySelectorAll('*'))
        .flatMap((element) => element.getAnimations()
          .filter((animation) => animation instanceof CSSAnimation
            && animation.animationName.startsWith('dico'))
          .map((animation) => ({
            elemento: `${element.tagName.toLowerCase()}.${Array.from(element.classList).join('.')}`,
            animacion: (animation as CSSAnimation).animationName,
            iteraciones: animation.effect?.getTiming()?.iterations,
            duracion: Number(animation.effect?.getTiming()?.duration),
          })))
      // CONVERGER NO ES SOLO QUE EXISTAN LOS NODOS. El pulso existe desde el
      // primer frame, pero mientras el panel carga corre en `processing`, que
      // es infinito; recien cuando termina de cargar pasa a `attention`, que
      // son dos vueltas y para. Si el observer se conformara con la cuenta,
      // fotografiaria el estado de carga y el contrato leeria `Infinity`.
      const asentado = (group: typeof candidate[number], entry: typeof contract.nodes[number]) => (
        group.nodes.length === entry.expectedCount
        && group.nodes.every((node) => node.animations.length === 1
          && node.animations[0].name === entry.animationName
          && node.animations[0].duration === entry.duration
          && node.animations[0].iterations === entry.iterations)
      )
      if (candidate.every((group, index) => asentado(group, contract.nodes[index]))) {
        state.__qaDicoMotionStack = candidate
        sessionStorage.setItem(cacheKey, JSON.stringify(candidate, (_key, value) => (
          value === Infinity ? '__qa_infinity__' : value
        )))
        return
      }
      requestAnimationFrame(observe)
    }
    requestAnimationFrame(observe)
  }, DICO_NEUTRAL_STRATEGY)
}

async function inventoryDicoMotionStack(page: Page, surface: string) {
  try {
    await expect.poll(() => page.evaluate(() => (
      (window as unknown as { __qaDicoMotionStack?: unknown }).__qaDicoMotionStack !== undefined
    ))).toBe(true)
  } catch (error) {
    // El gemelo positivo del contrato: en vez de "expiro la espera", decir
    // exactamente que selector falto y cuantos habia.
    const visto = await page.evaluate(() => (
      (window as unknown as { __qaDicoMotionStackVisto?: Array<Record<string, unknown>> })
        .__qaDicoMotionStackVisto
    ))
    const vivo = await page.evaluate(() => (
      (window as unknown as { __qaDicoMotionVivo?: Array<Record<string, unknown>> })
        .__qaDicoMotionVivo
    ))
    const detalle = Array.isArray(visto)
      ? visto.map((row) => `  ${row.selector}: esperados ${row.esperados}, encontrados ${row.encontrados}`).join('\n')
      : '  (el observer no llego a correr)'
    throw new Error(
      `El stack de motion de Dico nunca llego a la forma del contrato en ${surface}.\n${detalle}\nEn cambio, lo que SI esta corriendo:\n`
      + `${(vivo || []).map((row) => `  ${row.elemento} -> ${row.animacion} x${row.iteraciones}`).join('\n') || '  (ninguna animacion dico-*)'}\n`
      + `Original: ${(error as Error).message}`,
    )
  }
  const groups = await page.evaluate(() => (
    (window as unknown as { __qaDicoMotionStack?: unknown }).__qaDicoMotionStack
  ))
  validateDicoMotionStack(groups)

  const artifactRoot = process.env.QA_ARTIFACT_DIR
  const phase = process.env.QA_PHASE
  if (artifactRoot && phase) {
    const root = join(artifactRoot, phase, 'dico-motion-stack')
    await mkdir(root, { recursive: true })
    await writeFile(join(root, `${surface}.json`), `${JSON.stringify(groups, (_key, value) => (
      value === Infinity ? 'Infinity' : value
    ), 2)}\n`, 'utf8')
  }
  return groups
}

async function canonicalizeNeutralDico(page: Page, surface: string) {
  const result = await page.evaluate(async (contract) => {
    const snapshot = () => contract.nodes.map((entry) => ({
      selector: entry.selector,
      nodes: Array.from(document.querySelectorAll(entry.canonicalSelector || entry.selector)).map((element) => {
        const style = getComputedStyle(element)
        const box = element.getBoundingClientRect()
        return {
          target: `${element.tagName.toLowerCase()}.${Array.from(element.classList).join('.')}`,
          styles: {
            animationName: style.animationName,
            transform: style.transform,
            opacity: style.opacity,
            filter: style.filter,
            transformStyle: style.transformStyle,
          },
          box: { x: box.x, y: box.y, width: box.width, height: box.height },
          animations: element.getAnimations().map((animation) => {
            const timing = animation.effect?.getTiming()
            return {
              name: animation instanceof CSSAnimation ? animation.animationName : animation.id,
              duration: Number(timing?.duration),
              iterations: timing?.iterations,
              playState: animation.playState,
              currentTime: animation.currentTime === null ? null : Number(animation.currentTime),
            }
          }),
        }
      }),
    }))
    const apply = () => {
      for (const entry of contract.nodes) {
        for (const element of document.querySelectorAll(entry.canonicalSelector || entry.selector)) {
          if (!(element instanceof HTMLElement || element instanceof SVGElement)) continue
          for (const [property, value] of Object.entries(entry.styles)) {
            ;(element.style as unknown as Record<string, string>)[property] = value
          }
        }
      }
    }
    const before = snapshot()
    apply()
    const afterFirstApply = snapshot()
    apply()
    const afterSecondApply = snapshot()
    const frames = []
    for (let frame = 0; frame < 3; frame += 1) {
      await new Promise<void>((resolveFrame) => requestAnimationFrame(() => resolveFrame()))
      frames.push(snapshot())
    }
    const isDico = (element: Element) => {
      let current: Element | null = element
      while (current) {
        if (Array.from(current.classList).some((name) => name === 'dico' || name.startsWith('dico-') || name.startsWith('dico--'))) return true
        current = current.parentElement
      }
      return false
    }
    // Que NO quede movimiento vivo sobre Dico. No es lo mismo que "cero
    // animaciones": el pulso Volt de `active` es infinito y lo congela el
    // registro de movimiento continuo, asi que queda presente pero en pausa.
    // Exigir cero borraria esa distincion y obligaria a sacar el pulso del
    // registro, que es justo lo que no hay que hacer. Una animacion que sigue
    // en `running` sigue fallando.
    const remainingAnimations = document.getAnimations().flatMap((animation) => {
      const effect = animation.effect
      const target = effect instanceof KeyframeEffect && effect.target instanceof Element ? effect.target : null
      if (!target || !isDico(target)) return []
      if (animation.playState !== 'running') return []
      return [{
        target: `${target.tagName.toLowerCase()}.${Array.from(target.classList).join('.')}`,
        name: animation instanceof CSSAnimation ? animation.animationName : animation.id,
        playState: animation.playState,
      }]
    })
    const visible = (selector: string, expectedCount: number) => {
      const nodes = Array.from(document.querySelectorAll(selector))
      return nodes.length === expectedCount && nodes.every((element) => {
        const box = element.getBoundingClientRect()
        const style = getComputedStyle(element)
        return box.width > 0 && box.height > 0 && style.display !== 'none'
          && style.visibility !== 'hidden' && Number(style.opacity) > 0
      })
    }
    return {
      original: (window as unknown as { __qaDicoMotionStack?: unknown }).__qaDicoMotionStack || null,
      before,
      afterFirstApply,
      afterSecondApply,
      frames,
      remainingAnimations,
      // Que Dico ESTE, no solo que este quieto. Con el SVG esto miraba cara,
      // cuerpo y brazos; con el asset final el equivalente es el arte y su
      // pulso, que son las dos capas que componen la presencia.
      visibility: {
        arte: visible('.dico-native-arte', 1),
        pulso: visible('.dico-pulso', 1),
      },
    }
  }, DICO_NEUTRAL_STRATEGY)

  expect(result.original).not.toBeNull()
  validateDicoMotionStack(result.original)
  expect(result.afterSecondApply).toEqual(result.afterFirstApply)
  expect(result.frames).toEqual([
    result.afterSecondApply,
    result.afterSecondApply,
    result.afterSecondApply,
  ])
  expect(result.remainingAnimations).toEqual([])
  expect(result.visibility).toEqual({ arte: true, pulso: true })
  for (const entry of DICO_NEUTRAL_STRATEGY.nodes) {
    const group = result.afterSecondApply.find((item) => item.selector === entry.selector)
    expect(group?.nodes).toHaveLength(entry.expectedCount)
    for (const node of group?.nodes || []) {
      expect(node.animations).toEqual([])
      expect(node.styles.animationName).toBe('none')
      for (const [property, value] of Object.entries(entry.styles)) {
        if (property === 'animation') continue
        expect(node.styles[property as keyof typeof node.styles]).toBe(value)
      }
    }
  }

  const artifactRoot = process.env.QA_ARTIFACT_DIR
  const phase = process.env.QA_PHASE
  if (artifactRoot && phase) {
    const root = join(artifactRoot, phase, 'motion-canonicalization')
    await mkdir(root, { recursive: true })
    await writeFile(join(root, `${surface}.json`), `${JSON.stringify({
      strategy: DICO_NEUTRAL_STRATEGY.strategy,
      nodesAffected: DICO_NEUTRAL_STRATEGY.nodes.map(({ selector, expectedCount }) => ({ selector, expectedCount })),
      before: result.before,
      after: result.afterSecondApply,
      animationsRemoved: result.before.flatMap((group) => group.nodes.flatMap((node) => (
        node.animations.map((animation) => ({ selector: group.selector, target: node.target, ...animation }))
      ))),
      finalGeometry: result.afterSecondApply.map((group) => ({
        selector: group.selector,
        boxes: group.nodes.map((node) => node.box),
      })),
      visibility: result.visibility,
      quietFrames: 3,
      idempotent: true,
    }, null, 2)}\n`, 'utf8')
  }
}

export async function freezeContinuousDecorativeMotion(
  page: Page,
  { requireDicoMotion = false, surface = 'unknown' } = {},
) {
  const registry = motionRegistryForSurface(surface)
  const requireInventory = requireDicoMotion || surface.startsWith('catalog--')
  if (requireInventory) await inventoryInfiniteMotion(page, surface)
  if (requireDicoMotion) await waitForFiniteAnimations(page.locator('.ag-root'), surface)
  for (const entry of registry) {
    const nodes = page.locator(entry.selector)
    const count = await nodes.count()
    if (requireInventory) expect(count).toBe(entry.expectedCount)
    if (count === 0) continue

    const motionContract = await nodes.evaluateAll((elements) => elements.map((element) => (
      element.getAnimations().map((animation) => {
        const timing = animation.effect?.getTiming()
        return {
          name: animation instanceof CSSAnimation ? animation.animationName : animation.id,
          duration: Number(timing?.duration),
          iterations: timing?.iterations,
        }
      })
    )))
    // Actividad declarada por el propio componente. Es el eje que decide que
    // animacion corresponde; leerla es mas honesto que adivinar por la fase.
    const actividad = 'whenActivity' in entry
      ? await page.locator('[data-dico-pulso]').first()
        .getAttribute('data-dico-pulso').catch(() => null)
      : null
    const correspondeAnimar = !('whenActivity' in entry) || actividad === entry.whenActivity

    for (const animations of motionContract) {
      if ('strategy' in entry && entry.strategy === 'static-neutral-dico' && animations.length === 0) {
        // La misma pagina visita varias superficies Admin. La primera pasada
        // deja estos nodos neutralizados inline; una pasada posterior debe
        // aceptar ese estado ya canonico sin debilitar el inventario inicial.
        continue
      }
      if (!correspondeAnimar) {
        // La otra mitad del contrato: si la actividad no es la que anima, el
        // nodo tiene que estar QUIETO. No se saltea, se verifica.
        expect(animations, `${entry.selector} anima en actividad ${actividad}`).toEqual([])
        continue
      }
      expect(animations).toEqual([{
        name: entry.expectedName,
        duration: entry.duration,
        iterations: entry.iterations,
      }])
    }

    if ('strategy' in entry && entry.strategy === 'static-neutral-dico') continue
    if (!correspondeAnimar) continue

    const result = await nodes.evaluateAll(async (elements, freezeAt) => {
      const animations = elements.flatMap((element) => element.getAnimations())
      for (const animation of animations) {
        animation.pause()
        await animation.ready.catch(() => undefined)
        animation.currentTime = freezeAt
      }
      const snapshot = () => elements.map((element) => {
        const box = element.getBoundingClientRect()
        const style = window.getComputedStyle(element)
        return {
          transform: style.transform,
          opacity: style.opacity,
          box: {
            x: box.x,
            y: box.y,
            width: box.width,
            height: box.height,
          },
        }
      })
      const before = snapshot()
      await new Promise<void>((resolveFrame) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolveFrame()))
      })
      return {
        before,
        after: snapshot(),
        animations: animations.map((animation) => ({
          playState: animation.playState,
          currentTime: Number(animation.currentTime),
        })),
      }
    }, entry.freezeAt)
    expect(result.animations).toEqual(
      result.animations.map(() => ({ playState: 'paused', currentTime: entry.freezeAt })),
    )
    expect(result.after).toEqual(result.before)
  }
  if (requireDicoMotion) await canonicalizeNeutralDico(page, surface)
  await recordAdminScrollCheckpoint(page, 'after-freeze-continuous-decorative-motion')
}

async function canonicalizeAdminScroll(page: Page) {
  await page.evaluate(() => window.scrollTo(0, 0))
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
  await expect.poll(() => page.evaluate(() => document.scrollingElement?.scrollTop ?? null)).toBe(0)
}

export async function loginAdmin(page: Page) {
  const email = process.env.QA_ADMIN_EMAIL
  const password = process.env.QA_ADMIN_PASSWORD
  if (!email || !password) throw new Error('Faltan credenciales Auth locales de QA Lite')
  const redact = (value: string) => {
    let sanitized = value
    const knownSecrets = [
      email,
      password,
      process.env.QA_SUPABASE_ANON_KEY,
      process.env.QA_SUPABASE_SERVICE_ROLE,
    ].filter((secret): secret is string => Boolean(secret))
    for (const secret of knownSecrets) sanitized = sanitized.split(secret).join('[redacted]')
    return sanitized
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
      .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[redacted-jwt]')
      .replace(/sb_(?:publishable|secret)_[A-Za-z0-9_-]+/g, '[redacted-key]')
      .replace(/(?:refresh_token|access_token|authorization)\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]')
      .trim()
  }
  const collectFeedback = async () => {
    const visibleMessages = await page.locator('[role="alert"], form > div').evaluateAll((elements) => (
      elements
        .filter((element) => {
          const style = window.getComputedStyle(element)
          return style.display !== 'none'
            && style.visibility !== 'hidden'
            && element.getClientRects().length > 0
        })
        .map((element) => {
          const text = element instanceof HTMLElement ? element.innerText : element.textContent
          return text?.replace(/\s+/g, ' ').trim() || ''
        })
        .filter(Boolean)
    ))
    const validationMessages = await page.locator('form input').evaluateAll((inputs) => (
      inputs
        .map((input) => input instanceof HTMLInputElement ? input.validationMessage.trim() : '')
        .filter(Boolean)
    ))
    return [...new Set([...visibleMessages, ...validationMessages].map(redact))]
  }
  const safePageUrl = () => {
    const currentUrl = new URL(page.url())
    return `${currentUrl.protocol}//${currentUrl.host}${currentUrl.pathname}`
  }
  const formatDiagnostic = async (status: number, hostname: string, pathname: string) => {
    const feedback = await collectFeedback()
    const visibleError = feedback.length > 0
      ? ` — visible error: ${JSON.stringify(feedback.join(' | '))}`
      : ' — visible error: none'
    return `HTTP ${status} ${hostname} ${pathname} — page: ${safePageUrl()}${visibleError}`
  }

  const adminRoot = page.locator('.ag-root')
  const login = page.locator('input[type="email"]')
  await expect(adminRoot.or(login)).toBeVisible()
  if (await adminRoot.isVisible()) return

  await login.fill(email)
  await page.locator('input[type="password"]').fill(password)

  const isPasswordLogin = (rawUrl: string, method: string) => {
    try {
      const url = new URL(rawUrl)
      return method === 'POST'
        && url.pathname === '/auth/v1/token'
        && url.searchParams.get('grant_type') === 'password'
    } catch {
      return false
    }
  }
  const authRequestPromise = page.waitForRequest((request) => (
    isPasswordLogin(request.url(), request.method())
  ))
  const authResponsePromise = page.waitForResponse((response) => (
    isPasswordLogin(response.url(), response.request().method())
  ))

  await page.locator('button[type="submit"]').click()
  const [authRequest, authResponse] = await Promise.all([
    authRequestPromise,
    authResponsePromise,
  ])
  await authResponse.finished().catch(() => null)
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))

  const authUrl = new URL(authRequest.url())
  const authResult = {
    status: authResponse.status(),
    hostname: authUrl.hostname,
    pathname: authUrl.pathname,
  }
  const diagnostic = await formatDiagnostic(authResult.status, authResult.hostname, authResult.pathname)
  console.log(`QA local auth response: ${diagnostic}`)

  if (!authResponse.ok()) throw new Error(`QA local auth failed: ${diagnostic}`)
  try {
    await expect(adminRoot).toBeVisible()
  } catch {
    const finalDiagnostic = await formatDiagnostic(authResult.status, authResult.hostname, authResult.pathname)
    throw new Error(`QA local auth submit did not enter admin: ${finalDiagnostic}`)
  }
}

export async function openAdmin(page: Page, theme: 'light' | 'dark', viewport = DESKTOP) {
  await page.setViewportSize(viewport)
  await installDicoMotionStackObserver(page)
  await navigateToAdminWithTheme(page, theme)
  await recordAdminScrollCheckpoint(page, 'after-goto')
  await loginAdmin(page)
  await expect(page.locator('.ag-root')).toHaveClass(new RegExp(`ag-theme-${theme}`))
  await expect(page.locator('.ag-root button.dico-avisos-trigger')).toBeVisible()
  await expect(page.getByText('Te quedaron 10 horas sin vender', { exact: true })).toBeVisible()
  await stabilizePage(page)
  await recordAdminScrollCheckpoint(page, 'after-open-admin')
  return '.ag-root'
}

export async function settleAdmin(page: Page) {
  const root = page.locator('.ag-root')
  const theme = await root.evaluate((element) => (
    element.classList.contains('ag-theme-dark') ? 'dark' : 'light'
  ))
  const viewport = page.viewportSize()
  const surface = `admin--${theme}--${viewport?.width || 0}x${viewport?.height || 0}`
  await inventoryDicoMotionStack(page, surface)
  const opportunity = page.getByText('Te quedaron 10 horas sin vender', { exact: true })
  const noticeTrigger = root.locator('button.dico-avisos-trigger')
  const bubbleControl = root.locator('button.dico-burbuja-contenido')
  const bubbleVisibleText = root.locator('.dico-burbuja-texto')
  const bubbleFullText = root.locator('.dico-burbuja-lectura')

  await expect(opportunity).toBeVisible()
  await recordAdminScrollCheckpoint(page, 'after-opportunity')
  await expect(noticeTrigger).toHaveCount(1)
  await expect(noticeTrigger).toBeVisible()
  await expect(noticeTrigger).toHaveAttribute('aria-expanded', 'false')
  await noticeTrigger.click()
  await expect(noticeTrigger).toHaveAttribute('aria-expanded', 'true')
  await recordAdminScrollCheckpoint(page, 'after-notice-open')
  await expect(bubbleControl).toHaveCount(1)
  await expect(bubbleControl).toBeVisible()
  await expect(bubbleFullText).toHaveCount(1)
  const fullText = (await bubbleFullText.textContent() || '').replace(/\s+/g, ' ').trim()
  expect(fullText.length).toBeGreaterThan(0)

  await recordAdminScrollCheckpoint(page, 'before-bubble-click')
  await bubbleControl.click()
  await recordAdminScrollCheckpoint(page, 'after-bubble-click')
  await expect(bubbleVisibleText).toHaveText(fullText)
  await expect(bubbleControl).toHaveAttribute('tabindex', '-1')
  await expect(root.locator('.dico-burbuja-cursor')).toHaveCount(0)
  await canonicalizeAdminScroll(page)
  await recordAdminScrollCheckpoint(page, 'after-scroll-canonicalization')

  await stabilizePage(page)
  await waitForFiniteAnimations(root, surface)
  await expectStableLayout(page, [root, opportunity, noticeTrigger, bubbleControl, bubbleVisibleText])
  await recordAdminScrollCheckpoint(page, 'after-settle-admin')
}

export async function openPos(page: Page, theme: 'light' | 'dark', viewport = DESKTOP) {
  await openAdmin(page, theme, viewport)
  await settleAdmin(page)
  await page.getByRole('button', { name: /^Pedidos/ }).click()
  const order = page.locator('article').filter({ hasText: 'Carla QA' })
  const expandOrder = order.getByRole('button', { name: /Carla QA/i })
  const cobrar = order.getByRole('button', { name: /^Cobrar / })
  try {
    await expect(order).toBeVisible()
    await expect(expandOrder).toBeVisible()
    await expandOrder.click()
    await expect(cobrar).toBeVisible()
  } catch {
    const normalize = (value: string) => value.replace(/\s+/g, ' ').trim()
    const sanitize = (value: string) => {
      let sanitized = normalize(value)
      const knownSecrets = [
        process.env.QA_ADMIN_EMAIL,
        process.env.QA_ADMIN_PASSWORD,
        process.env.QA_SUPABASE_ANON_KEY,
        process.env.QA_SUPABASE_SERVICE_ROLE,
      ].filter((secret): secret is string => Boolean(secret))
      for (const secret of knownSecrets) sanitized = sanitized.split(secret).join('[redacted]')
      return sanitized
        .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
        .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[redacted-jwt]')
        .replace(/sb_(?:publishable|secret)_[A-Za-z0-9_-]+/g, '[redacted-key]')
        .replace(/(?:refresh_token|access_token|authorization|password|contraseña)\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]')
        .replace(/\+?\d[\d\s().-]{7,}\d/g, '[redacted-phone]')
    }
    const visibleText = async (selector: string) => page.locator(selector).evaluateAll((elements) => (
      elements
        .filter((element) => {
          const style = window.getComputedStyle(element)
          return style.display !== 'none'
            && style.visibility !== 'hidden'
            && element.getClientRects().length > 0
        })
        .map((element) => element.textContent?.replace(/\s+/g, ' ').trim() || '')
        .filter(Boolean)
    ))
    const visibleButtons = []
    const buttons = page.getByRole('button')
    for (let index = 0; index < await buttons.count(); index += 1) {
      const button = buttons.nth(index)
      if (!await button.isVisible().catch(() => false)) continue
      const snapshot = await button.ariaSnapshot().catch(() => '')
      const firstLine = snapshot.split(/\r?\n/).find((line) => /^- button/.test(line.trim())) || ''
      const quotedName = firstLine.trim().match(/^- button "([^"]*)"/)?.[1]
      const fallbackName = await button.innerText().catch(() => '')
      visibleButtons.push(sanitize(quotedName || fallbackName || '(sin nombre accesible)'))
    }

    const headings = (await visibleText('h1, h2, h3, h4, h5, h6')).map(sanitize)
    const orderCards = (await visibleText('article')).map(sanitize)
    const statusLabels = ['Esperando pago', 'Nuevo', 'En preparación', 'Listo', 'Completado', 'Cancelado']
    const seededOrders = orderCards
      .filter((text) => /QA/i.test(text))
      .map((text) => ({
        text,
        visibleStatus: statusLabels.find((status) => text.includes(status)) || 'sin estado visible',
      }))
    const visibleElementCount = await page.locator('body *').evaluateAll((elements) => (
      elements.filter((element) => {
        const style = window.getComputedStyle(element)
        return style.display !== 'none'
          && style.visibility !== 'hidden'
          && element.getClientRects().length > 0
      }).length
    ))
    const currentUrl = new URL(page.url())
    const diagnostic = {
      url: `${currentUrl.protocol}//${currentUrl.host}${currentUrl.pathname}`,
      documentTitle: sanitize(await page.title()),
      visibleHeadings: headings,
      visibleButtons,
      visibleElementCount,
      visibleOrderCount: orderCards.length,
      orderCards,
      seededOrders,
      buttonsContainingCobrar: visibleButtons.filter((name) => /cobrar/i.test(name)),
      screenshot: 'not captured',
      errorContext: 'Playwright genera error-context.md al lanzar este diagnostico',
    }
    const artifactRoot = process.env.QA_ARTIFACT_DIR
    if (artifactRoot) {
      const phase = process.env.QA_PHASE || 'unknown'
      const diagnosticsDir = join(artifactRoot, phase, 'diagnostics')
      await mkdir(diagnosticsDir, { recursive: true })
      const screenshotPath = join(
        diagnosticsDir,
        `pos-cobrar-missing-${theme}-${viewport.width}x${viewport.height}.png`,
      )
      await page.screenshot({ path: screenshotPath, fullPage: false })
      diagnostic.screenshot = screenshotPath
    }
    throw new Error(`QA local POS Cobrar missing:\n${JSON.stringify(diagnostic, null, 2)}`)
  }
  await cobrar.click()
  const dialog = page.locator('[role="dialog"][aria-label^="Cobrar el pedido"]')
  await expect(dialog).toBeVisible()
  await stabilizePage(page)
  const root = page.locator('.ag-root')
  const activeOrders = page.locator('.ag-nav-item.active[data-section="orders"]')
  const activeOrdersIcon = activeOrders.locator('svg.ag-nav-icon')
  const activeOrdersLabel = activeOrders.locator('.ag-nav-label')
  const surface = `pos--${theme}--${viewport.width}x${viewport.height}`
  await expect(activeOrders).toHaveCount(1)
  await expect(activeOrdersIcon).toHaveCount(1)
  await expect(activeOrdersLabel).toHaveCount(1)
  await waitForFiniteAnimations(root, surface)
  await expectStableLayout(page, [root, activeOrders, activeOrdersIcon, activeOrdersLabel, dialog])
  return '[role="dialog"][aria-label^="Cobrar el pedido"]'
}

export async function openCatalog(page: Page, theme: 'ambar' | 'noche' | 'carbon') {
  await page.setViewportSize(MOBILE)
  await page.goto('/')
  await expect(page.locator('body')).toHaveAttribute('data-cp-theme', theme)
  await expect(page.locator('.cp-arclogo-ring')).toHaveCount(0)
  await expect(page.locator('footer')).toBeVisible()
  const rootSelector = '#main-content > .cp-root:has(footer)'
  const root = page.locator(rootSelector)
  await expect(root).toHaveCount(1)
  await expect(root).toBeVisible()
  await stabilizePage(page)
  await waitForFiniteAnimations(root, `catalog--${theme}--${MOBILE.width}x${MOBILE.height}`)
  const unfinishedOpacityTransitions = await root.locator('[style*="transition"][style*="opacity"]').evaluateAll((elements) => (
    elements.filter((element) => {
      if (!(element instanceof HTMLElement) || element.style.opacity === '') return false
      return Math.abs(Number(window.getComputedStyle(element).opacity) - Number(element.style.opacity)) > 0.0001
    }).length
  ))
  expect(unfinishedOpacityTransitions).toBe(0)
  await expectStableLayout(page, [root])
  return rootSelector
}
