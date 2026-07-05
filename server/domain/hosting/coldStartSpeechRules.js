import { cleanTtsText } from './cleanTtsText.js';

const COLD_START_TTS_CHAR_LIMIT = 200;
const MIN_SENTENCE_BOUNDARY_INDEX = 30;
const MAX_RETRY_SENTENCES = 2;
const MIN_RETRY_TEXT_LENGTH = 5;
const SENTENCE_ENDINGS = ['。', '！', '？', '.', '!', '?'];
const SENTENCE_SPLIT_RE = /[。！？.!?]/;
const TTS_UNAVAILABLE_REASON = 'TTS unavailable';

/**
 * Build the first cold-start TTS candidate from the streamed intro text.
 *
 * @param {string} fullText Full cold-open message, possibly containing emotion tags.
 * @returns {string} Clean text capped for TTS generation, preferably ending at a sentence boundary.
 * @throws Does not throw; invalid input becomes an empty string.
 * Constraint: preserves the legacy 200-char cap so startup latency does not regress.
 */
export function coldStartSpeechText(fullText) {
  const cleanText = cleanTtsText(fullText || '');
  const sentenceEnd = Math.max(
    ...SENTENCE_ENDINGS.map(ending => cleanText.lastIndexOf(ending, COLD_START_TTS_CHAR_LIMIT)),
  );

  if (sentenceEnd > MIN_SENTENCE_BOUNDARY_INDEX) {
    return cleanText.slice(0, sentenceEnd + 1);
  }

  return cleanText.slice(0, COLD_START_TTS_CHAR_LIMIT);
}

/**
 * Build the one-shot retry text used when the first cold-start TTS attempt fails.
 *
 * @param {string} speechText First TTS candidate.
 * @returns {string} A shorter retry candidate, or empty string when retry would not help.
 * @throws Does not throw; malformed text returns an empty retry candidate.
 * Constraint: only shortens to the first two sentences to keep the retry bounded.
 */
export function coldStartRetrySpeechText(speechText) {
  const sentences = String(speechText || '').split(SENTENCE_SPLIT_RE).filter(Boolean);
  const retryText = sentences.slice(0, MAX_RETRY_SENTENCES).join('。')
    + (sentences.length > MAX_RETRY_SENTENCES ? '。' : '');

  if (retryText && retryText.length < String(speechText || '').length && retryText.length > MIN_RETRY_TEXT_LENGTH) {
    return retryText;
  }

  return '';
}

/**
 * Decide whether cold start should call the SpeechSynthPort.
 *
 * @param {boolean|null} ttsAvailability Known TTS availability from legacy health state.
 * @returns {boolean} True for available or unknown; false only when known unavailable.
 * @throws Does not throw.
 * Constraint: unknown means "try" to preserve the old optimistic startup path.
 */
export function shouldAttemptColdStartTts(ttsAvailability) {
  return ttsAvailability !== false;
}

/**
 * Normalize the text-only cold-start reason exposed to the client.
 *
 * @param {{reason?: string}|null} health SpeechSynthPort health payload.
 * @returns {string} Stable user-facing reason fallback.
 * @throws Does not throw.
 * Constraint: keeps the existing Socket payload field stable.
 */
export function textOnlyColdStartReason(health) {
  return health?.reason || TTS_UNAVAILABLE_REASON;
}
