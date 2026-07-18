/**
 * Refill pure rules + R1 invariant guard — extracted from scheduler.js.
 *
 * R1 invariant: "电台不静默" — the radio must never go silent while playing.
 *
 * These rules govern what happens when the queue is exhausted:
 *   - shouldTriggerRefill: detect when a refill is needed
 *   - refillOutcome: determine the refill action
 *   - r1InvariantHolds: verify the R1 invariant is maintained
 *
 * All functions are pure: no side effects, no I/O, no mutations.
 */

/**
 * Determine whether a refill should be triggered.
 *
 * @param {{queueLength: number, isPlaying: boolean, hasCurrentSong?: boolean}} input
 * @returns {boolean} True when a refill is needed.
 * @throws Does not throw.
 * Constraint: only triggers when playing, queue is empty, and there is a current song
 *   (no point refilling when nothing is playing).
 */
export function shouldTriggerRefill({ queueLength, isPlaying, hasCurrentSong = true }) {
  if (!isPlaying) return false;
  if (queueLength > 0) return false;
  if (!hasCurrentSong) return false;
  return true;
}

/**
 * Determine the refill outcome based on queue and refill state.
 *
 * @param {object} input
 * @param {boolean} input.queueHasNext Whether the queue has a next song.
 * @param {object|null} input.refillSong Song from refill provider, if any.
 * @param {object|null} input.nextSong Next song from queue, if any.
 * @param {boolean} input.refillAttempted Whether a refill was already attempted.
 * @returns {{action: string, song?: object, shouldStop: boolean, reason?: string}}
 * @throws Does not throw.
 * Constraint: R1 guard — only allows stop after refill has been attempted and failed.
 */
export function refillOutcome({ queueHasNext, refillSong, nextSong, refillAttempted = false }) {
  if (queueHasNext && nextSong) {
    return { action: 'playNext', song: nextSong, shouldStop: false };
  }

  if (refillSong) {
    return { action: 'playRefillSong', song: refillSong, shouldStop: false };
  }

  if (!refillAttempted) {
    return { action: 'triggerRefill', shouldStop: false };
  }

  return {
    action: 'stopWithWarning',
    shouldStop: true,
    reason: 'refill failed — queue exhausted after refill attempt',
  };
}

/**
 * Check whether the R1 invariant (radio never goes silent while playing) holds.
 *
 * @param {object} input
 * @param {boolean} input.isPlaying Whether the radio is currently playing.
 * @param {object|null} input.currentSong Current song, if any.
 * @param {number} input.queueLength Number of songs in the queue.
 * @param {boolean} input.refillInProgress Whether a refill is currently in progress.
 * @returns {boolean} True when the invariant holds.
 * @throws Does not throw.
 * Constraint: returns false when playing without a song, or when playing with
 *   an empty queue and no refill in progress (impending silence).
 */
export function r1InvariantHolds({ isPlaying, currentSong, queueLength, refillInProgress = false }) {
  // Idle state: not playing and no current song — invariant holds
  if (!isPlaying && !currentSong) return true;

  // Playing without a current song — invariant violated
  if (isPlaying && !currentSong) return false;

  // Playing with a current song but empty queue and no refill — invariant at risk
  if (isPlaying && currentSong && queueLength === 0 && !refillInProgress) return false;

  // All other states — invariant holds
  return true;
}
