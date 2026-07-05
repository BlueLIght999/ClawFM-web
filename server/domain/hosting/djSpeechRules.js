const SPEECH_CHARS_PER_SECOND = 15;
const TRANSITION_NO_TTS_DELAY_MS = 3000;
const REFILL_NO_TTS_DELAY_MS = 2500;

/**
 * Estimate spoken duration from cleaned DJ speech text.
 *
 * @param {string} text Clean speech text.
 * @returns {number} Duration in seconds.
 * @throws Does not throw.
 * Constraint: keeps the legacy scheduler estimate of roughly 15 chars/second.
 */
export function estimatedSpeechDurationSeconds(text) {
  return String(text || '').length / SPEECH_CHARS_PER_SECOND;
}

/**
 * Decide whether generated speech is stale and should not interrupt playback.
 *
 * @param {{expectedTransitionId: string, currentTransitionId: string, isPlaying: boolean}} input Transition guard state.
 * @returns {boolean} True when speech belongs to an old transition or music already started.
 * @throws Does not throw.
 * Constraint: preserves the legacy race guard before emitting DJ speech audio.
 */
export function shouldDropStaleSpeech({ expectedTransitionId, currentTransitionId, isPlaying }) {
  return currentTransitionId !== expectedTransitionId || isPlaying === true;
}

/**
 * Return the readable pause used when transition TTS cannot play.
 *
 * @returns {number} Delay in milliseconds.
 * @throws Does not throw.
 * Constraint: preserves the legacy 3s pause so text-only DJ transitions remain readable.
 */
export function transitionNoTtsDelayMs() {
  return TRANSITION_NO_TTS_DELAY_MS;
}

/**
 * Return the readable pause used when refill TTS cannot play.
 *
 * @returns {number} Delay in milliseconds.
 * @throws Does not throw.
 * Constraint: preserves the legacy 2.5s pause for queue-refill DJ text.
 */
export function refillNoTtsDelayMs() {
  return REFILL_NO_TTS_DELAY_MS;
}
