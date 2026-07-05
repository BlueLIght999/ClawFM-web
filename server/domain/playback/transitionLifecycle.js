const NORMAL_SPEECH_GENERATION_TIMEOUT_MS = 15000;
const REFILL_SPEECH_GENERATION_TIMEOUT_MS = 60000;

/**
 * Start a song-ending transition only when the playhead is not already advancing.
 *
 * @param {object} playhead Current playhead state.
 * @param {number|string} transitionId Current scheduler transition id.
 * @returns {{shouldStart: boolean, transitionId: number|string, playhead: object}} Transition start decision.
 * @throws Does not throw.
 * Constraint: preserves the legacy double-advance guard for player:ended/skip races.
 */
export function beginTransitionIfIdle(playhead, transitionId) {
  if (playhead?._advancing) {
    return {
      shouldStart: false,
      transitionId,
      playhead,
    };
  }

  return {
    shouldStart: true,
    transitionId,
    playhead: {
      ...playhead,
      _advancing: true,
    },
  };
}

/**
 * Decide which DJ speech timer profile is needed for the upcoming transition.
 *
 * @param {object|null} nextSong Next queued song, if any.
 * @returns {{kind: 'normal'|'refill', nextSong: object|null, generationTimeoutMs: number}} Speech plan.
 * @throws Does not throw.
 * Constraint: keeps refill generation timeout at 60s and normal transition timeout at 15s.
 */
export function transitionSpeechPlan(nextSong) {
  if (!nextSong) {
    return {
      kind: 'refill',
      nextSong: null,
      generationTimeoutMs: REFILL_SPEECH_GENERATION_TIMEOUT_MS,
    };
  }

  return {
    kind: 'normal',
    nextSong,
    generationTimeoutMs: NORMAL_SPEECH_GENERATION_TIMEOUT_MS,
  };
}

/**
 * Check whether an async transition callback still belongs to the current transition.
 *
 * @param {{currentTransitionId: number|string, expectedTransitionId: number|string}} input Transition ids.
 * @returns {boolean} True when the callback should still advance playback.
 * @throws Does not throw.
 * Constraint: drops stale generation/playback timeouts after a new song has started.
 */
export function shouldHonorTransition({ currentTransitionId, expectedTransitionId }) {
  return currentTransitionId === expectedTransitionId;
}
