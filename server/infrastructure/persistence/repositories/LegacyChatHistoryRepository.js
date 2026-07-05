import { getChatHistory, saveChatMessage } from '../../../db/history.js';

/**
 * Wraps legacy chat_history helpers behind ChatHistoryRepository.
 *
 * @param {{getChatHistory: (limit: number) => object[]|null, saveChatMessage: (role: string, content: string) => void}=} legacy
 */
export function createLegacyChatHistoryRepository(legacy = {
  getChatHistory,
  saveChatMessage,
}) {
  return {
    recent(limit) {
      return legacy.getChatHistory(limit) || [];
    },
    append(role, content) {
      legacy.saveChatMessage(role, content);
    },
  };
}

export const legacyChatHistoryRepository = createLegacyChatHistoryRepository();
