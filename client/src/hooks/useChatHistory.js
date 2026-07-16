import { useState, useEffect } from 'react';

const STORAGE_KEY = 'clawfm_chat_history';
const MAX_STORED = 10;

/**
 * useChatHistory — manages chat messages with localStorage persistence
 * and server chat:history event handling.
 *
 * On mount, initializes from localStorage for instant display after
 * browser refresh. When the server sends chat:history (on new connection),
 * it overrides local state with server-authoritative data.
 *
 * @param {object} socket - Socket.IO client instance
 * @returns {[Array, function]} Tuple of [chatMessages, setChatMessages]
 */
export function useChatHistory(socket) {
  // Initialize from localStorage for instant display on refresh
  const [chatMessages, setChatMessages] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Listen for server chat:history event (authoritative — overrides local)
  useEffect(() => {
    if (!socket) return;

    const handleChatHistory = ({ messages }) => {
      if (messages && messages.length > 0) {
        setChatMessages(messages.map((m, i) => ({
          id: `history-${Date.now()}-${i}`,
          role: m.role,
          content: m.content,
          isHistory: true,
        })));
      }
    };

    socket.on('chat:history', handleChatHistory);
    return () => socket.off('chat:history', handleChatHistory);
  }, [socket]);

  // Auto-save to localStorage (capped at MAX_STORED messages)
  useEffect(() => {
    if (chatMessages.length > 0) {
      const toStore = chatMessages.slice(-MAX_STORED);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
      } catch {
        // localStorage might be full or unavailable — silently ignore
      }
    }
  }, [chatMessages]);

  return [chatMessages, setChatMessages];
}
