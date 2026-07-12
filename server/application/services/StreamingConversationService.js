import {
  chatAnnouncementText,
  displayTextFromDjStream,
  fallbackStreamEndText,
  shouldAnnounceChatSpeech,
  streamTokenFromChunk,
} from '../../domain/hosting/streamingChatRules.js';

const DJ_UNAVAILABLE_TEXT = 'Sorry, the DJ booth is having technical difficulties. Try again later.';

/**
 * Application service for chat LLM streaming.
 *
 * It keeps the socket protocol outside the service: callers pass an `onChunk`
 * callback and receive event payloads to emit.
 */
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
    async streamReply({ text, contextPrompt, routing, messageId, onChunk = () => {} }) {
      const stream = await chat.stream(text, contextPrompt);
      if (!stream) {
        return {
          unavailableMessage: { text: DJ_UNAVAILABLE_TEXT },
        };
      }

      let fullText = '';
      try {
        for await (const chunk of stream) {
          const token = streamTokenFromChunk(chunk);
          if (token) {
            fullText += token;
            onChunk({ messageId, token });
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
  };
}
