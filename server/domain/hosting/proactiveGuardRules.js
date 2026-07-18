/**
 * Proactive speech guard pure rules — extracted from services/proactive.js.
 *
 * Determines whether the DJ is allowed to attempt proactive speech.
 * All 6 conditions must pass:
 *   1. Proactive speech is enabled
 *   2. Cold start is complete (coldStartState === 'done')
 *   3. Radio is currently playing
 *   4. No song transition is in progress (not advancing)
 *   5. At least 2 songs have played since last speech
 *   6. At least 90 seconds have passed since last speech
 *   7. There is a current song
 *
 * Pure function: no side effects, no I/O, no mutations.
 */

const MIN_SONGS_SINCE_SPEECH = 2;
const MIN_MS_SINCE_SPEECH = 90000;

/**
 * Check whether proactive speech can be attempted.
 *
 * @param {object} scheduler Scheduler state with coldStartState, isPlaying, isAdvancing, songsSinceLastSpeech, currentSong.
 * @param {object} timing Timing state with enabled, nowMs, lastSpeechMs.
 * @returns {boolean} True when all guards pass.
 * @throws Does not throw.
 */
export function canAttemptProactiveSpeech(scheduler, timing) {
  if (!timing?.enabled) return false;
  if (scheduler?.coldStartState !== 'done') return false;
  if (!scheduler?.isPlaying) return false;
  if (scheduler?.isAdvancing) return false;
  if ((scheduler?.songsSinceLastSpeech ?? 0) < MIN_SONGS_SINCE_SPEECH) return false;
  if ((timing.nowMs - timing.lastSpeechMs) < MIN_MS_SINCE_SPEECH) return false;
  if (!scheduler?.currentSong) return false;
  return true;
}
