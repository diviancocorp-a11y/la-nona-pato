/**
 * Que movimiento tiene Dico en el Admin, y como se lo deja quieto.
 *
 * ESTE CONTRATO CAMBIO DE NATURALEZA. Antes Dico era un SVG con cinco
 * animaciones INFINITAS —piso, boya, bamboleo, parpadeo, sacada— y la
 * estrategia existia para congelarlas: sin eso, dos capturas del mismo commit
 * salian distintas. Con los assets finales 2D no queda ninguna animacion
 * infinita en la superficie: el arte es una imagen y lo unico que se mueve es
 * el pulso, que en `attention` corre DOS vueltas y se detiene.
 *
 * Asi que el trabajo ya no es congelar un loop sino verificar que el
 * movimiento sea finito y quede asentado. Se sigue neutralizando igual
 * —anular la animacion y fijar el estado final— porque una animacion finita
 * capturada a mitad de camino es tan no-determinista como un loop.
 */
export const DICO_NEUTRAL_STRATEGY = Object.freeze({
  strategy: 'static-neutral-dico',
  nodes: [
    // La entrada de primera vez: un giro de 1,05s que termina en la identidad.
    { selector: '.dico-native-caja', expectedCount: 1, animationName: 'dico-native-entrada', duration: 1050, iterations: 1, playStates: ['running', 'finished'], styles: { animation: 'none', transform: 'none', opacity: '1', transformStyle: 'flat' } },
    // El pulso en `attention`: 2,6s x 0,72 = 1872ms, dos vueltas y para.
    { selector: '.dico-pulso-giro', expectedCount: 1, animationName: 'dico-pulso-vuelta', duration: 1872, iterations: 2, playStates: ['running', 'finished'], styles: { animation: 'none', transform: 'none' } },
  ],
})

/**
 * El gemelo positivo: que Dico ESTE. Neutralizar el movimiento no sirve de
 * nada si lo que queda es un hueco — un contrato que solo mira animaciones
 * pasaria feliz con el personaje sin renderizar.
 */
export const DICO_PRESENCIA_ESPERADA = Object.freeze({
  arte: { selector: '.dico-native-arte', expectedCount: 1 },
  pulso: { selector: '.dico-pulso', expectedCount: 1 },
})

export function validateDicoMotionStack(groups) {
  const errors = []
  const expectedSelectors = new Set(DICO_NEUTRAL_STRATEGY.nodes.map((entry) => entry.selector))
  for (const group of groups) {
    if (!expectedSelectors.has(group.selector)) errors.push(`unexpected selector ${group.selector}`)
  }
  for (const expected of DICO_NEUTRAL_STRATEGY.nodes) {
    const group = groups.find((entry) => entry.selector === expected.selector)
    if (!group) {
      errors.push(`missing selector ${expected.selector}`)
      continue
    }
    if (group.nodes.length !== expected.expectedCount) {
      errors.push(`${expected.selector} expected ${expected.expectedCount}, got ${group.nodes.length}`)
      continue
    }
    for (const node of group.nodes) {
      if (node.animations.length !== 1) {
        errors.push(`${expected.selector} expected one animation, got ${node.animations.length}`)
        continue
      }
      const animation = node.animations[0]
      if (animation.name !== expected.animationName) errors.push(`${expected.selector} unexpected animation ${animation.name}`)
      if (animation.duration !== expected.duration) errors.push(`${expected.selector} unexpected duration ${animation.duration}`)
      if (animation.iterations !== expected.iterations) errors.push(`${expected.selector} unexpected iterations ${animation.iterations}`)
      if (expected.playStates && !expected.playStates.includes(animation.playState)) {
        errors.push(`${expected.selector} expected ${expected.playStates.join('/')}, got ${animation.playState}`)
      }
    }
  }
  if (errors.length > 0) throw new Error(`Dico motion contract failed:\n${errors.join('\n')}`)
  return true
}

export function applyNeutralStylePlan(groups) {
  return groups.map((group) => {
    const expected = DICO_NEUTRAL_STRATEGY.nodes.find((entry) => entry.selector === group.selector)
    if (!expected) return structuredClone(group)
    return {
      ...structuredClone(group),
      nodes: group.nodes.map((node) => ({
        ...structuredClone(node),
        styles: { ...node.styles, ...expected.styles },
        animations: [],
      })),
    }
  })
}
