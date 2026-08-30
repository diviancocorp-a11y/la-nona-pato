import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceFiniteAnimationQuiescence,
  FINITE_ANIMATION_TIMEOUT_MS,
} from '../finite-animation-quiescence.mjs';

function runSamples(activeCounts, elapsedStep = 16) {
  let state = { quietFrames: 0, quiescent: false, timedOut: false };
  return activeCounts.map((activeCount, index) => {
    state = advanceFiniteAnimationQuiescence(state, {
      activeCount,
      elapsedMs: (index + 1) * elapsedStep,
    });
    return state;
  });
}

test('alcanza quiescencia con tres frames vacios desde el inicio', () => {
  const states = runSamples([0, 0, 0]);
  assert.deepEqual(states.map(({ quietFrames }) => quietFrames), [1, 2, 3]);
  assert.equal(states[2].quiescent, true);
  assert.equal(states[2].timedOut, false);
});

test('una animacion que aparece despues del primer frame vacio reinicia la espera', () => {
  const states = runSamples([0, 1, 0, 0, 0]);
  assert.deepEqual(states.map(({ quietFrames }) => quietFrames), [1, 0, 1, 2, 3]);
  assert.equal(states[4].quiescent, true);
});

test('el contador vuelve a cero aunque ya hubiera dos frames silenciosos', () => {
  const states = runSamples([0, 0, 2]);
  assert.deepEqual(states.map(({ quietFrames }) => quietFrames), [1, 2, 0]);
  assert.equal(states[2].quiescent, false);
});

test('vence el limite sin declarar quiescencia', () => {
  const state = advanceFiniteAnimationQuiescence(
    { quietFrames: 0 },
    { activeCount: 1, elapsedMs: FINITE_ANIMATION_TIMEOUT_MS },
  );
  assert.equal(state.quiescent, false);
  assert.equal(state.timedOut, true);
});
