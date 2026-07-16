export const INTENT_SEPARATOR = '|||';

const FALLBACK_INTENT = { action: 'chat', params: {} };

/**
 * Incremental parser for intent-prefixed streams.
 *
 * LLM outputs JSON intent on the first line, then `|||` separator,
 * then the reply text. This parser feeds tokens one by one, detects
 * the separator, parses the intent JSON, and emits reply tokens.
 *
 * @returns {{ feed: (token: string) => void, getIntent: () => object|null, isIntentReady: () => boolean, getReplyTokens: () => string[], clearReplyTokens: () => void, flush: () => object|null }}
 */
export function createIntentStreamParser() {
  let buffer = '';
  let separatorFound = false;
  let intent = null;
  let replyTokens = [];

  return {
    feed(token) {
      if (separatorFound) {
        replyTokens.push(token);
        return;
      }
      buffer += token;
      const sepIdx = buffer.indexOf(INTENT_SEPARATOR);
      if (sepIdx !== -1) {
        const jsonPart = buffer.slice(0, sepIdx).trim();
        try {
          intent = JSON.parse(jsonPart);
        } catch {
          intent = { ...FALLBACK_INTENT };
        }
        separatorFound = true;
        const afterSep = buffer.slice(sepIdx + INTENT_SEPARATOR.length);
        const cleaned = afterSep.replace(/^\n+/, '');
        if (cleaned) replyTokens.push(cleaned);
      }
    },

    getIntent() { return intent; },
    isIntentReady() { return separatorFound; },
    getReplyTokens() { return replyTokens; },
    clearReplyTokens() { replyTokens = []; },

    /**
     * Called when stream ends. If separator was never found,
     * returns a fallback intent.
     * @returns {object|null} The parsed intent, or fallback.
     */
    flush() {
      if (!separatorFound) {
        intent = { ...FALLBACK_INTENT };
        separatorFound = true;
      }
      return intent;
    },
  };
}
