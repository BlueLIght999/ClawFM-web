const CHAT_SPEECH_ACTIONS = new Set([
  'play_search',
  'play_mood',
  'play_artist',
  'play_song',
  'recommend',
  'plan_refresh',
]);

const SENTENCE_SPLIT_RE = /[。！？.!?]/;

import { extractSayFromText, stripJsonFromText } from './djJsonGuard.js';

/**
 * Extract streamed token text from an OpenAI-compatible chunk.
 *
 * @param {object|null} chunk Stream chunk from the LLM client.
 * @returns {string} Token content, or empty string when the chunk has no text.
 * @throws Does not throw; malformed chunks are ignored.
 * Constraint: keeps the existing Socket streaming behavior of only emitting truthy tokens.
 */
export function streamTokenFromChunk(chunk) {
  return chunk?.choices?.[0]?.delta?.content || '';
}

/**
 * Convert the accumulated DJ stream into the text shown to the listener.
 *
 * @param {string} fullText Raw accumulated stream text.
 * @returns {string} `say` from structured JSON when present, otherwise the raw text.
 * @throws Does not throw; invalid JSON is displayed as-is.
 * Constraint: preserves the legacy "JSON only matters when it has a say field" behavior.
 */
export function displayTextFromDjStream(fullText) {
  // P0: use djJsonGuard for robust JSON extraction + stripping
  const extracted = extractSayFromText(fullText);
  if (extracted !== fullText) return extracted; // JSON was found and say extracted
  // No JSON — strip any residual JSON blocks from mixed content
  return stripJsonFromText(fullText);
}

/**
 * Pick the final text emitted when streaming throws.
 *
 * @param {string} partialText Text already streamed before the error.
 * @param {string} userText Original user message.
 * @returns {string} Partial assistant text, or the user text as the legacy fallback.
 * @throws Does not throw.
 * Constraint: keeps the existing stream-end payload shape stable.
 */
export function fallbackStreamEndText(partialText, userText) {
  return partialText || userText;
}

/**
 * Build the short TTS announcement used after song-request chat actions.
 *
 * @param {string} displayText Text shown in chat.
 * @returns {string} First one or two sentence fragments, or the first 100 chars when empty.
 * @throws Does not throw.
 * Constraint: matches the legacy split/join behavior, including no truncation for unpunctuated text.
 */
export function chatAnnouncementText(displayText) {
  return String(displayText || '').split(SENTENCE_SPLIT_RE).filter(Boolean).slice(0, 2).join('。')
    || String(displayText || '').slice(0, 100);
}

/**
 * Decide whether chat output should trigger a brief TTS announcement.
 *
 * @param {string} action Routed chat action.
 * @param {string} displayText Text that would be announced.
 * @param {boolean|null} ttsAvailability Known TTS availability.
 * @returns {boolean} True when action, text and TTS state allow announcement.
 * @throws Does not throw.
 * Constraint: unknown TTS state remains optimistic, same as the legacy handler.
 */
export function shouldAnnounceChatSpeech(action, displayText, ttsAvailability) {
  return CHAT_SPEECH_ACTIONS.has(action) && !!displayText && ttsAvailability !== false;
}
