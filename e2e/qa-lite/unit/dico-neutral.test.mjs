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
  const pulso = DICO_NEUTRAL_STRATEGY.nodes.find((entry) => entry.selector === '.dico-pulso-giro')
  assert.deepEqual(
    { count: pulso.expectedCount, name: pulso.animationName, duration: pulso.duration, vueltas: pulso.iterations },
    { count: 1, name: 'dico-pulso-vuelta', duration: 1872, vueltas: 2 },
  )
})

test('el movimiento de Dico en Admin es finito, no un loop', () => {
  // El contrato viejo declaraba cinco animaciones infinitas. Si alguna vuelve
  // a ser infinita, la superficie deja de ser determinista y hay que
  // congelarla, no declararla: este test lo hace explicito.
  for (const nodo of DICO_NEUTRAL_STRATEGY.nodes) {
    assert.ok(Number.isFinite(nodo.iterations), `${nodo.selector} declara iteraciones infinitas`)
  }
})

test('cantidad Dico incorrecta falla', () => {
  const stack = validStack()
  stack.find((entry) => entry.selector === '.dico-pulso-giro').nodes.pop()
  assert.throws(() => validateDicoMotionStack(stack), /expected 1, got 0/)
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
