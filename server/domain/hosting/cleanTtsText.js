/**
 * Pure TTS text cleaning — no IO.
 * Extracted from services/tts.js (duplicated at lines 87 & 120) so both
 * TTS engines reuse one tested implementation (CODING-STYLE 1.5 no-duplication).
 *
 * 1. Strip angle-bracket tags (emotion tags like <happy>)
 * 2. Newlines/carriage-returns → space
 * 3. Trim leading/trailing whitespace
 */
export function cleanTtsText(text) {
  return text.replace(/<[^>]+>/g, '').replace(/[\n\r]/g, ' ').trim();
}
