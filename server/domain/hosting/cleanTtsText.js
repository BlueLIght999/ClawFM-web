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
  // `[^>]+` is a negated class and already consumes each character once, so this
  // regex is linear -- sonarjs reports the `<...>` shape conservatively. There is
  // no equivalent rewrite that keeps the documented behaviour (strip everything up
  // to the first `>`), so the finding is disabled with that reasoning rather than
  // traded for a different meaning.
  // eslint-disable-next-line sonarjs/super-linear-regex
  return text.replace(/<[^>]+>/g, '').replace(/[\n\r]/g, ' ').trim();
}
