export const DICO_NEUTRAL_STRATEGY = Object.freeze({
  strategy: 'static-neutral-dico',
  nodes: [
    { selector: '.dico-piso', expectedCount: 1, animationName: 'dico-piso', duration: 5800, iterations: Infinity, styles: { animation: 'none', transform: 'none', opacity: '0.2' } },
    { selector: '.dico-boya', expectedCount: 1, animationName: 'dico-boya', duration: 5800, iterations: Infinity, styles: { animation: 'none', transform: 'none' } },
    { selector: '.dico-bamboleo', expectedCount: 1, animationName: 'dico-bamboleo', duration: 8200, iterations: Infinity, styles: { animation: 'none', transform: 'none' } },
    { selector: '.dico-ojo', expectedCount: 2, animationName: 'dico-parpadeo', duration: 8800, iterations: Infinity, styles: { animation: 'none', transform: 'none' } },
    { selector: '.dico--entrada .dico-escena', canonicalSelector: '.dico-escena', expectedCount: 1, animationName: 'dico-entrada-vuelta', duration: 1050, iterations: 1, playStates: ['running', 'finished'], styles: { animation: 'none', transform: 'none', opacity: '1', transformStyle: 'flat' } },
    { selector: '.dico--entrada .dico-cara', canonicalSelector: '.dico-cara', expectedCount: 1, animationName: 'dico-cara-vuelta', duration: 1050, iterations: 1, playStates: ['running', 'finished'], styles: { animation: 'none', opacity: '1' } },
    { selector: '.dico--entrada .dico-cuerpo-render', canonicalSelector: '.dico-cuerpo-render', expectedCount: 3, animationName: 'dico-luz-vuelta', duration: 1050, iterations: 1, playStates: ['running', 'finished'], styles: { animation: 'none', filter: 'none' } },
  ],
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
