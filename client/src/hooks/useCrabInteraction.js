import { useCallback, useEffect } from 'react';
import { useCrab } from '../contexts/CrabContext.jsx';
import { useChat } from '../contexts/ChatContext.jsx';
import { useColdStart } from '../contexts/ColdStartContext.jsx';
import { useRadio } from '../contexts/RadioContext.jsx';
import { E } from '../constants/events.js';

/**
 * Consolidates crab-related event handlers:
 * - handleCrabClick: toggles chat, emits crab:click
 * - handleBubbleClick: emits bubble-click, triggers bounce animation
 * - handleDJDialogReply: opens chat
 * - deferred cold-start speech: plays pending speech after cold start completes
 */
export function useCrabInteraction({ socket, setDjSpeechUrl }) {
  const { setCrabState } = useCrab();
  const { setChatOpen } = useChat();
  const { coldPhase, pendingSpeechRef } = useColdStart();
  const { isPlayingRef } = useRadio();

  const handleCrabClick = useCallback(() => {
    setChatOpen(prev => !prev);
    if (socket) socket.emit('crab:click', { interaction: 'chat' });
  }, [socket, setChatOpen]);

  const handleBubbleClick = useCallback((tag) => {
    if (!socket) return;
    socket.emit(E.CRAB_BUBBLE_CLICK, tag);
    setCrabState('bouncing');
    setTimeout(() => setCrabState(isPlayingRef.current ? 'listening' : 'idle'), 2000);
  }, [socket, setCrabState, isPlayingRef]);

  const handleDJDialogReply = useCallback(() => {
    setChatOpen(true);
  }, [setChatOpen]);

  // Play deferred cold-start speech after exit animation completes
  useEffect(() => {
    if (coldPhase !== 'done') return;
    const url = pendingSpeechRef.current;
    if (!url) return;
    pendingSpeechRef.current = null;
    setDjSpeechUrl(url);
    setCrabState('talking');
  }, [coldPhase, pendingSpeechRef, setDjSpeechUrl, setCrabState]);

  return { handleCrabClick, handleBubbleClick, handleDJDialogReply };
}
