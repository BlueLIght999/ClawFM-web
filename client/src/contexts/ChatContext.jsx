import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { useChatHistory } from '../hooks/useChatHistory.js';

const ChatContext = createContext(null);

export function ChatProvider({ socket, children }) {
  const [chatMessages, setChatMessages] = useChatHistory(socket);
  const [chatOpen, setChatOpen] = useState(false);
  const chatOpenRef = useRef(false);
  chatOpenRef.current = chatOpen;

  // P1: "DJ is thinking" state — shown between message send and first stream chunk
  const [isDjThinking, setIsDjThinking] = useState(false);

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
    // P1: show "DJ is thinking" immediately after user sends
    setIsDjThinking(true);
    socket.emit('chat:message', { text });
  }, [socket, setChatMessages]);

  // P1: called when DJ_STREAM_START arrives — DJ begins processing
  const startDjThinking = useCallback(() => {
    setIsDjThinking(true);
  }, []);

  // P1: called when first chunk arrives or stream ends — clear thinking state
  const clearDjThinking = useCallback(() => {
    setIsDjThinking(false);
  }, []);

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
    // P1: clear thinking state when first chunk arrives
    setIsDjThinking(false);
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
    // P1: clear thinking state when stream ends
    setIsDjThinking(false);
    djStreamIdRef.current = null;
  }, []);

  // Also add a method to add a DJ transition message (used by socket handler)
  const addDJMessage = useCallback((text) => {
    // P1: clear thinking state when DJ message arrives (non-streaming path)
    setIsDjThinking(false);
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
    isDjThinking,        // P1: thinking indicator state
    setIsDjThinking,
    startDjThinking,     // P1: called on DJ_STREAM_START
    clearDjThinking,     // P1: called on first chunk / stream end
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
