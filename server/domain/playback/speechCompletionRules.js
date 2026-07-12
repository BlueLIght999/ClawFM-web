/**
 * Pure domain rules for DJ speech completion classification.
 *
 * When the frontend signals that a DJ speech has finished playing,
 * the system must decide what playback action to take based on the
 * speech type.  These rules encode that classification without any IO.
 */

/** @typedef {'cold-start' | 'normal' | 'no-op'} SpeechCompletionAction */

/**
 * Classify what should happen after a DJ speech finishes.
 *
 * @param {string | undefined | null} type — the speech type from the client.
 * @returns {SpeechCompletionAction}
 *   - 'cold-start'  → start music after cold-open speech
 *   - 'no-op'       → chat / chat-announce: do nothing to playback
 *   - 'normal'      → transition / refill / undefined: signal scheduler speech is done
 */
export function classifySpeechCompletion(type) {
  if (type === 'cold-start') return 'cold-start';
  if (type === 'chat' || type === 'chat-announce') return 'no-op';
  return 'normal';
}

/**
 * @param {string | undefined | null} type
 * @returns {boolean}
 */
export function isColdStartCompletion(type) {
  return classifySpeechCompletion(type) === 'cold-start';
}

/**
 * @param {string | undefined | null} type
 * @returns {boolean}
 */
export function isNoOpCompletion(type) {
  return classifySpeechCompletion(type) === 'no-op';
}
