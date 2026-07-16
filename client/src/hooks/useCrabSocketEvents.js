import { useEffect } from 'react';
import { useCrab } from '../contexts/CrabContext.jsx';
import { useRadio } from '../contexts/RadioContext.jsx';

export function useCrabSocketEvents(socket) {
  const { setCrabState, setBubbles, setBubblesVisible, bubbleTimeoutRef } = useCrab();
  const { isPlayingRef } = useRadio();

  useEffect(() => {
    if (!socket) return;

    socket.on('crab:bubbles', ({ bubbles: newBubbles }) => {
      setBubbles(newBubbles);
      setBubblesVisible(true);
      setCrabState('blowing');
      setTimeout(() => {
        setCrabState(prev => prev === 'blowing' ? (isPlayingRef.current ? 'listening' : 'idle') : prev);
      }, 3000);
      if (bubbleTimeoutRef.current) clearTimeout(bubbleTimeoutRef.current);
      bubbleTimeoutRef.current = setTimeout(() => setBubblesVisible(false), 30000);
    });

    return () => {
      socket.off('crab:bubbles');
      if (bubbleTimeoutRef.current) clearTimeout(bubbleTimeoutRef.current);
    };
  }, [socket, setCrabState, setBubbles, setBubblesVisible, bubbleTimeoutRef, isPlayingRef]);
}
