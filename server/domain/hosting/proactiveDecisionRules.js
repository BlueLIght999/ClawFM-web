/**
 * Proactive speech decision pure rules — extracted from services/proactive.js.
 *
 * Validates the decider's response and determines whether to synthesize TTS.
 * Pure functions: no side effects, no I/O, no mutations.
 */

const SPEECH_SYNTHESIS_THRESHOLD = 0.4;

/**
 * Validate that the proactive speech decision is actionable.
 *
 * @param {object|null|undefined} decision Decision from the decider.
 * @returns {boolean} True when decision.shouldSpeak is truthy and message is non-empty.
 * @throws Does not throw.
 */
export function isValidSpeechDecision(decision) {
  if (!decision) return false;
  if (!decision.shouldSpeak) return false;
  if (!decision.message) return false;
  return true;
}

/**
 * Determine whether TTS synthesis should be attempted for the proactive speech.
 *
 * @param {object} input
 * @param {boolean} input.speechAvailable Whether the TTS provider is healthy.
 * @param {number} input.randomValue Random value in [0, 1) for the 40% chance gate.
 * @param {boolean} input.isAdvancing Whether a song transition is in progress.
 * @returns {boolean} True when TTS should be synthesized.
 * @throws Does not throw.
 * Constraint: 40% of eligible proactive speeches get TTS (randomValue < 0.4).
 *   Song transitions always suppress TTS (avoids overlapping audio).
 */
export function shouldSynthesizeSpeech({ speechAvailable, randomValue, isAdvancing }) {
  if (!speechAvailable) return false;
  if (isAdvancing) return false;
  if (randomValue >= SPEECH_SYNTHESIS_THRESHOLD) return false;
  return true;
}
