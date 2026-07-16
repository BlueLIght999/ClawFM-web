import { createContext, useContext, useState, useRef, useEffect } from 'react';

const CrabContext = createContext(null);

export function CrabProvider({ isPlaying, children }) {
  const [crabState, setCrabState] = useState('idle');
  const crabStateRef = useRef(crabState);
  crabStateRef.current = crabState;

  const [bubbles, setBubbles] = useState([]);
  const [bubblesVisible, setBubblesVisible] = useState(false);
  const bubbleTimeoutRef = useRef(null);

  // Random idle ↔ listening toggle during music playback
  useEffect(() => {
    if (!isPlaying) return;

    const scheduleNext = () => {
      const delay = 10000 + Math.random() * 20000;
      return setTimeout(() => {
        const cur = crabStateRef.current;
        if (cur === 'idle') setCrabState('listening');
        else if (cur === 'listening') setCrabState('idle');
        timerRef.current = scheduleNext();
      }, delay);
    };

    const timerRef = { current: null };
    timerRef.current = scheduleNext();
    return () => clearTimeout(timerRef.current);
  }, [isPlaying]);

  const value = {
    crabState,
    setCrabState,
    crabStateRef,
    bubbles,
    setBubbles,
    bubblesVisible,
    setBubblesVisible,
    bubbleTimeoutRef,
  };

  return <CrabContext.Provider value={value}>{children}</CrabContext.Provider>;
}

export function useCrab() {
  const ctx = useContext(CrabContext);
  if (!ctx) throw new Error('useCrab must be used within CrabProvider');
  return ctx;
}
