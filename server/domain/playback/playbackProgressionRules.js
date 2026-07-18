/**
 * Playback progression pure rules — extracted from scheduler.js.
 *
 * These rules govern how the playhead transitions between songs:
 *   - startSongPlayhead: initialize playhead when starting a new song
 *   - transitionDelayForPlayback: calculate when to trigger song-ending transition
 *   - skipOutcome: determine what happens when skipping with empty queue
 *
 * All functions are pure: no side effects, no I/O, no mutations.
 */

import { normalizePlaybackDurationMs, nextTransitionDelayMs } from './transitionTiming.js';

/**
 * Build a fresh playing playhead for a new song.
 *
 * @param {object} song Song to start playing.
 * @param {number} nowMs Current timestamp in milliseconds.
 * @returns {object} New playhead state with song loaded and playing.
 * @throws Does not throw.
 * Constraint: normalizes duration, resets advancing flag.
 */
export function startSongPlayhead(song, nowMs) {
  return {
    currentSong: song,
    startedAt: nowMs,
    songDuration: normalizePlaybackDurationMs(song),
    isPlaying: true,
    _advancing: false,
  };
}

/**
 * Calculate the delay before the scheduler should trigger a song-ending transition.
 *
 * @param {{durationMs: number, elapsedMs?: number, minimumDelayMs?: number}} input Playback timing.
 * @returns {number|null} Delay in ms, or null when the song is too short for a transition.
 * @throws Does not throw.
 * Constraint: delegates to transitionTiming.nextTransitionDelayMs.
 */
export function transitionDelayForPlayback({ durationMs, elapsedMs = 0, minimumDelayMs }) {
  return nextTransitionDelayMs({ durationMs, elapsedMs, minimumDelayMs });
}

/**
 * Determine the outcome of a skip operation based on queue state.
 *
 * @param {{queueHasNext: boolean}} input Queue availability.
 * @returns {{shouldStop: boolean, playhead?: object}} Skip decision.
 * @throws Does not throw.
 * Constraint: when the queue is empty, returns a stopped playhead (currentSong=null, isPlaying=false).
 *   R1 invariant: callers must trigger a refill before allowing the radio to go silent.
 */
export function skipOutcome({ queueHasNext }) {
  if (queueHasNext) {
    return { shouldStop: false };
  }
  return {
    shouldStop: true,
    playhead: {
      currentSong: null,
      isPlaying: false,
    },
  };
}
