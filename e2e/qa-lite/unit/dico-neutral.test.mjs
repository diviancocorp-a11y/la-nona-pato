import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DICO_NEUTRAL_STRATEGY, applyNeutralStylePlan, validateDicoMotionStack,
} from '../dico-neutral-contract.mjs'

function validStack() {
  return DICO_NEUTRAL_STRATEGY.nodes.map((entry) => ({
    selector: entry.selector,
    nodes: Array.from({ length: entry.expectedCount }, () => ({
      styles: { opacity: '0.5', transform: 'matrix(1, 0, 0, 1, 0, 0)', filter: 'blur(1px)' },
      animations: [{
        name: entry.animationName,
        duration: entry.duration,
        iterations: entry.iterations,
        playState: entry.playStates?.[0] || 'running',
      }],
    })),
  }))
}

test('inventario Dico previo contiene la pila completa', () => {
  assert.equal(validateDicoMotionStack(validStack()), true)
})

test('cantidad Dico incorrecta falla', () => {
  const stack = validStack()
  stack.find((entry) => entry.selector === '.dico-ojo').nodes.pop()
  assert.throws(() => validateDicoMotionStack(stack), /expected 2, got 1/)
})

test('animacion Dico inesperada falla', () => {
  const stack = validStack()
  stack[0].nodes[0].animations[0].name = 'unexpected-motion'
  assert.throws(() => validateDicoMotionStack(stack), /unexpected animation/)
})

test('pose neutral elimina efectos y es idempotente', () => {
  const once = applyNeutralStylePlan(validStack())
  const twice = applyNeutralStylePlan(once)
  assert.deepEqual(twice, once)
  for (const group of once) {
    const contract = DICO_NEUTRAL_STRATEGY.nodes.find((entry) => entry.selector === group.selector)
    for (const node of group.nodes) {
      assert.deepEqual(node.animations, [])
      for (const [property, value] of Object.entries(contract.styles)) {
        assert.equal(node.styles[property], value)
      }
    }
  }
})
