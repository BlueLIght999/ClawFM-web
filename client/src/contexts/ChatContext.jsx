import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { useChatHistory } from '../hooks/useChatHistory.js';

const ChatContext = createContext(null);

export function ChatProvider({ socket, children }) {
  const [chatMessages, setChatMessages] = useChatHistory(socket);
  const [chatOpen, setChatOpen] = useState(false);
  const chatOpenRef = useRef(false);
  chatOpenRef.current = chatOpen;

  const [djDialogText, setDjDialogText] = useState('');
  const [djDialogStreaming, setDjDialogStreaming] = useState(false);
  const [djDialogVisible, setDjDialogVisible] = useState(false);
  const [djDialogMsgId, setDjDialogMsgId] = useState('');
  const djDialogTextRef = useRef('');
  const djStreamIdRef = useRef(null);

  // Hide DJ dialog when chat panel opens
  useEffect(() => {
    if (chatOpen) setDjDialogVisible(false);
  }, [chatOpen]);

  const sendMessage = useCallback((text) => {
    if (!socket) return;
    setChatMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', content: text }]);
    socket.emit('chat:message', { text });
  }, [socket, setChatMessages]);

  const hideDJDialog = useCallback(() => {
    setDjDialogVisible(false);
  }, []);

  const showDJMessage = useCallback((text) => {
    if (!chatOpenRef.current && text) {
      djDialogTextRef.current = text;
      setDjDialogText(text);
      setDjDialogStreaming(false);
      setDjDialogVisible(true);
      setDjDialogMsgId(`dj-msg-${Date.now()}`);
    }
  }, []);

  const appendDJStreamChunk = useCallback((messageId, token) => {
    setChatMessages(prev => {
      const last = prev[prev.length - 1];
      if (last && last.id === messageId && last.role === 'assistant') {
        return [...prev.slice(0, -1), { ...last, content: last.content + token }];
      }
      return [...prev, { id: messageId, role: 'assistant', content: token }];
    });
    if (!chatOpenRef.current) {
      if (djStreamIdRef.current !== messageId) {
        djStreamIdRef.current = messageId;
        djDialogTextRef.current = token || '';
        setDjDialogMsgId(messageId);
      } else {
        djDialogTextRef.current += token || '';
      }
      setDjDialogText(djDialogTextRef.current);
      setDjDialogStreaming(true);
      setDjDialogVisible(true);
    }
  }, [setChatMessages]);

  const endDJStream = useCallback(() => {
    setDjDialogStreaming(false);
    djStreamIdRef.current = null;
  }, []);

  // Also add a method to add a DJ transition message (used by socket handler)
  const addDJMessage = useCallback((text) => {
    setChatMessages(prev => [...prev, {
      id: `dj-msg-${Date.now()}`,
      role: 'assistant',
      content: text,
      isTransition: true,
    }]);
  }, [setChatMessages]);

  const value = {
    chatMessages,
    setChatMessages,
    chatOpen,
    setChatOpen,
    chatOpenRef,
    djDialogText,
    djDialogStreaming,
    djDialogVisible,
    djDialogMsgId,
    djDialogTextRef,
    sendMessage,
    hideDJDialog,
    showDJMessage,
    appendDJStreamChunk,
    endDJStream,
    addDJMessage,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat must be used within ChatProvider');
  return ctx;
}
