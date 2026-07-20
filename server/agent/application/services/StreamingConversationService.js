import {
  chatAnnouncementText,
  displayTextFromDjStream,
  fallbackStreamEndText,
  shouldAnnounceChatSpeech,
  streamTokenFromChunk,
} from '../../domain/streamingChatRules.js';
import { createSentenceAccumulator } from '../../domain/sentenceAccumulator.js';
import { shouldFilterChunk, stripJsonFromText } from '../../domain/djJsonGuard.js';

const DJ_UNAVAILABLE_TEXT = 'DJ 暂时离线，请稍后再试。';

/**
 * Application service for chat LLM streaming.
 *
 * It keeps the socket protocol outside the service: callers pass an `onChunk`
 * callback and receive event payloads to emit.
 */
// eslint-disable-next-line max-lines-per-function
export function createStreamingConversationService({
  chat,
  chatHistory,
  speech,
  ttsAvailability = () => null,
}) {
  return {
    /**
     * Stream a DJ response and return socket-ready payloads.
     *
     * @param {{text: string, contextPrompt: string, routing: object, messageId: string, onChunk?: Function}} input
     * User text, assembled prompt, routed action, stable message id, and chunk callback.
     * @returns {Promise<object>} Stream end/unavailable payloads and optional speech announcement.
     * @throws Does not intentionally throw; stream errors are returned as `streamError`.
     * Constraint: `onChunk` is transport-agnostic and must not be a socket object.
     */
    // eslint-disable-next-line complexity
    async streamReply({ text, contextPrompt, routing, messageId, onChunk = () => {}, mergedStream = null }) {
      const stream = mergedStream
        ? mergedStream
        : await chat.stream(text, contextPrompt);
      if (!stream) {
        return {
          unavailableMessage: { text: DJ_UNAVAILABLE_TEXT },
        };
      }

      let fullText = '';
      let jsonBuffering = false;  // P0: buffer JSON tokens to prevent leaking to frontend
      try {
        for await (const chunk of stream) {
          const token = mergedStream ? chunk : streamTokenFromChunk(chunk);
          if (token) {
            fullText += token;
            // P0: detect JSON start — buffer instead of emitting to frontend
            if (!jsonBuffering && shouldFilterChunk(token)) {
              jsonBuffering = true;
            }
            if (!jsonBuffering) {
              onChunk({ messageId, token });
            }
          }
        }

        // If we buffered JSON, strip it and emit only the clean text
        if (jsonBuffering) {
          const cleaned = stripJsonFromText(fullText);
          if (cleaned) {
            onChunk({ messageId, token: cleaned });
          }
        }

        const displayText = displayTextFromDjStream(fullText);
        chatHistory.append('assistant', displayText);
        return {
          streamEnd: { messageId, fullText: displayText },
          speechAnnouncement: shouldAnnounceChatSpeech(routing?.action, displayText, ttsAvailability())
            ? { text: chatAnnouncementText(displayText), type: 'chat-announce' }
            : null,
        };
      } catch (streamError) {
        return {
          streamEnd: { messageId, fullText: fallbackStreamEndText(fullText, text) },
          streamError,
        };
      }
    },

    /**
     * Generate audio for a deferred chat announcement.
     *
     * @param {{text: string, type: string}|null} announcement Speech request returned by `streamReply`.
     * @returns {Promise<{audioUrl: string, text: string, type: string}|null>} Speech-start payload or null.
     * @throws Does not throw; TTS failures degrade to null.
     * Constraint: callers decide whether and where to emit the returned payload.
     */
    async synthesizeAnnouncement(announcement) {
      if (!announcement) return null;
      try {
        const audioUrl = await speech.synthesize(announcement.text);
        if (!audioUrl) return null;
        return {
          audioUrl,
          text: announcement.text,
          type: announcement.type,
        };
      } catch {
        return null;
      }
    },

    /**
     * Stream DJ response with incremental sentence-level TTS.
     *
     * TTS synthesis starts as soon as a complete sentence is detected in the
     * stream, achieving pipeline parallelism between LLM output and audio
     * synthesis.
     *
     * @param {{text: string, contextPrompt: string, routing: object, messageId: string, onChunk?: Function, onSpeechSegment?: Function, mergedStream?: AsyncIterable<string>}} input
     * @returns {Promise<object>} Stream end payload + speech segments info.
     */
    // eslint-disable-next-line complexity
    async streamReplyWithIncrementalTts({
      text, contextPrompt, routing: _routing, messageId,
      onChunk = () => {},
      onSpeechSegment = () => {},
      mergedStream = null,
    }) {
      const stream = mergedStream
        ? mergedStream
        : await chat.stream(text, contextPrompt);

      if (!stream) {
        return { unavailableMessage: { text: DJ_UNAVAILABLE_TEXT } };
      }

      const sentenceAcc = createSentenceAccumulator();
      let fullText = '';
      const speechPromises = [];
      let segmentIndex = 0;

      try {
        for await (const chunk of stream) {
          const token = mergedStream ? chunk : streamTokenFromChunk(chunk);
          if (token) {
            fullText += token;
            onChunk({ messageId, token });

            const sentences = sentenceAcc.feed(token);
            for (const sentence of sentences) {
              const idx = segmentIndex++;
              const p = speech.synthesize(sentence)
                .then(audioUrl => {
                  if (audioUrl) {
                    onSpeechSegment({ messageId, audioUrl, text: sentence, index: idx });
                  }
                })
                .catch(e => console.warn('[Streaming] Speech synthesis failed (degraded):', e.message));
              speechPromises.push(p);
            }
          }
        }

        const remaining = sentenceAcc.flush();
        if (remaining) {
          const idx = segmentIndex++;
          const p = speech.synthesize(remaining)
            .then(audioUrl => {
              if (audioUrl) {
                onSpeechSegment({ messageId, audioUrl, text: remaining, index: idx });
              }
            })
            .catch(e => console.warn('[Streaming] Remaining speech synthesis failed (degraded):', e.message));
          speechPromises.push(p);
        }

        await Promise.all(speechPromises);

        const displayText = displayTextFromDjStream(fullText);
        chatHistory.append('assistant', displayText);
        return {
          streamEnd: { messageId, fullText: displayText },
          speechSegmentCount: segmentIndex,
        };
      } catch (streamError) {
        await Promise.allSettled(speechPromises);
        return {
          streamEnd: { messageId, fullText: fallbackStreamEndText(fullText, text) },
          streamError,
        };
      }
    },
  };
}
