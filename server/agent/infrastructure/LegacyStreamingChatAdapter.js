import { chatWithDj } from '../../services/claude.js';

export function createLegacyStreamingChatAdapter(streamChat = chatWithDj) {
  return {
    stream(text, contextPrompt) {
      return streamChat(text, contextPrompt);
    },
  };
}

export const legacyStreamingChatAdapter = createLegacyStreamingChatAdapter();
