export const REQUIRED_QUIET_FRAMES = 3;
export const FINITE_ANIMATION_TIMEOUT_MS = 15_000;

export function advanceFiniteAnimationQuiescence(
  state,
  { activeCount, elapsedMs },
  {
    requiredQuietFrames = REQUIRED_QUIET_FRAMES,
    timeoutMs = FINITE_ANIMATION_TIMEOUT_MS,
  } = {},
) {
  const quietFrames = activeCount === 0 ? state.quietFrames + 1 : 0;
  const quiescent = quietFrames >= requiredQuietFrames;
  return {
    quietFrames,
    quiescent,
    timedOut: !quiescent && elapsedMs >= timeoutMs,
  };
}
