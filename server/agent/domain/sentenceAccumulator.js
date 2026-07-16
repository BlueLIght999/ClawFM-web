const SENTENCE_END_RE = /[。！？.!?]/;

/**
 * Incremental sentence accumulator.
 * Feed tokens one by one; complete sentences are returned when
 * sentence-ending punctuation is detected.
 *
 * @returns {{ feed: (token: string) => string[], flush: () => string|null }}
 */
export function createSentenceAccumulator() {
  let buffer = '';

  return {
    feed(token) {
      buffer += token;
      const sentences = [];
      while (true) {
        const match = buffer.match(SENTENCE_END_RE);
        if (!match) break;
        const idx = match.index;
        sentences.push(buffer.slice(0, idx + 1));
        buffer = buffer.slice(idx + 1);
      }
      return sentences;
    },
    flush() {
      const remaining = buffer.trim();
      buffer = '';
      return remaining || null;
    },
  };
}
