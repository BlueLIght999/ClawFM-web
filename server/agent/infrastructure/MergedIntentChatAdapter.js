import { deepSeekLlmAdapter } from '../../infrastructure/llm/DeepSeekLlmAdapter.js';
import { createIntentStreamParser } from '../domain/intentStreamParser.js';

/**
 * Merged intent+chat adapter.
 *
 * Combines intent extraction and streaming chat into a single LLM call.
 * The LLM outputs JSON intent first, then `|||` separator, then reply text.
 *
 * Uses a push-based pump: rawStream consumption starts immediately when
 * streamWithIntent returns, buffering reply tokens in a queue. This ensures
 * `await intent` resolves even if the caller has not yet started iterating
 * the reply stream (fixing the lazy-generator deadlock).
 *
 * @param {{llm?: object}} deps
 * @returns {{streamWithIntent: (messages: Array, options?: object) => Promise<{intent: Promise<object>, stream: AsyncIterable<string>|null}>}}
 */
export function createMergedIntentChatAdapter({ llm = deepSeekLlmAdapter } = {}) {
  return {
    async streamWithIntent(messages, { maxTokens = 300, temperature = 0.8 } = {}) {
      const parser = createIntentStreamParser();
      let intentResolve;
      const intentPromise = new Promise(resolve => { intentResolve = resolve; });
      let intentResolved = false;

      const rawStream = await llm.streamRaw(messages, { maxTokens, temperature });
      if (!rawStream) {
        intentResolve({ action: 'chat', params: {} });
        return { intent: intentPromise, stream: null };
      }

      // Push-based buffer: pump starts immediately, tokens are queued
      const pendingTokens = [];
      let streamDone = false;
      let resolveWaiter = null;

      function pushToken(token) {
        if (resolveWaiter) {
          const r = resolveWaiter;
          resolveWaiter = null;
          r(token);
        } else {
          pendingTokens.push(token);
        }
      }

      function finishStream() {
        streamDone = true;
        if (resolveWaiter) {
          const r = resolveWaiter;
          resolveWaiter = null;
          r(null);
        }
      }

      // Start pumping immediately (does not block return)
      // eslint-disable-next-line complexity
      (async () => {
        try {
          for await (const chunk of rawStream) {
            const token = chunk?.choices?.[0]?.delta?.content || '';
            if (!token) continue;
            parser.feed(token);

            if (parser.isIntentReady() && !intentResolved) {
              intentResolved = true;
              intentResolve(parser.getIntent());
            }

            const tokens = parser.getReplyTokens();
            if (tokens.length > 0) {
              pushToken(tokens.join(''));
              parser.clearReplyTokens();
            }
          }
        } catch (e) {
          // Stream error — consumer will see truncated stream
          console.warn('[MergedChat] Stream parsing error (truncated):', e.message);
        }
        if (!intentResolved) {
          intentResolved = true;
          intentResolve(parser.flush());
        }
        finishStream();
      })();

      async function* replyStream() {
        while (true) {
          if (pendingTokens.length > 0) {
            yield pendingTokens.shift();
          } else if (streamDone) {
            break;
          } else {
            const token = await new Promise(resolve => { resolveWaiter = resolve; });
            if (token === null) break;
            yield token;
          }
        }
      }

      return { intent: intentPromise, stream: replyStream() };
    },
  };
}

export const mergedIntentChatAdapter = createMergedIntentChatAdapter();
