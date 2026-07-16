/**
 * chatHistoryFilter.js — Extract recent conversations from chat history.
 *
 * A "conversation" is a user message followed by an assistant reply.
 * This function finds the Nth-from-last assistant message, then includes
 * all messages from that point (plus any preceding user messages) to the end.
 */

/**
 * Extract the last N conversations (user + assistant pairs) from history.
 *
 * @param {Array<{role: string, content: string}>} history - Messages in chronological order (oldest first)
 * @param {number} conversationCount - Number of assistant messages to include
 * @returns {Array<{role: string, content: string}>} Filtered messages in chronological order
 */
export function filterRecentConversations(history, conversationCount) {
  if (!history || history.length === 0) return [];

  let assistantCount = 0;
  let nthAssistantIndex = -1;

  // Find the Nth-from-last assistant message by scanning backward
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === 'assistant') {
      assistantCount++;
      if (assistantCount >= conversationCount) {
        nthAssistantIndex = i;
        break;
      }
    }
  }

  // No assistant messages — no complete conversations
  if (assistantCount === 0) return [];

  // If fewer than N assistant messages found, use the first assistant's index
  let nthIndex = nthAssistantIndex;
  if (nthIndex === -1) {
    nthIndex = history.findIndex(m => m.role === 'assistant');
  }

  // Include any user messages immediately preceding the Nth assistant
  let startIndex = nthIndex;
  while (startIndex > 0 && history[startIndex - 1].role === 'user') {
    startIndex--;
  }

  return history.slice(startIndex);
}
