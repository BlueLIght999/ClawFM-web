import { createContext, useContext, useState, useRef, useEffect } from 'react';

const ColdStartContext = createContext(null);

export function ColdStartProvider({ children, socket, connected, loggedIn, onDeferredSpeech }) {
  const [coldPhase, setColdPhase] = useState('loading');
  const [coldPhaseText, setColdPhaseText] = useState('');
  const [coldOpenText, setColdOpenText] = useState('');
  const coldPhaseRef = useRef(coldPhase);
  coldPhaseRef.current = coldPhase;
  const pendingSpeechRef = useRef(null);

  // Exit animation timer: fades out overlay → 'done'
  useEffect(() => {
    if (coldPhase !== 'exit') return;
    const timer = setTimeout(() => setColdPhase('done'), 900);
    return () => clearTimeout(timer);
  }, [coldPhase]);

  // Signal server that client is ready for cold start (logged in + connected)
  useEffect(() => {
    if (socket && connected && loggedIn) {
      socket.emit('client:ready');
    }
  }, [socket, connected, loggedIn]);

  // Play deferred cold-start speech after exit animation completes
  // Only fires when onDeferredSpeech callback is provided; otherwise App.jsx handles it
  useEffect(() => {
    if (coldPhase !== 'done') return;
    const url = pendingSpeechRef.current;
    if (!url || !onDeferredSpeech) return;
    pendingSpeechRef.current = null;
    onDeferredSpeech(url);
  }, [coldPhase, onDeferredSpeech]);

  const isColdLoading = coldPhase !== 'done';

  const value = {
    coldPhase,
    setColdPhase,
    coldPhaseRef,
    coldPhaseText,
    setColdPhaseText,
    coldOpenText,
    setColdOpenText,
    pendingSpeechRef,
    isColdLoading,
  };

  return <ColdStartContext.Provider value={value}>{children}</ColdStartContext.Provider>;
}

export function useColdStart() {
  const ctx = useContext(ColdStartContext);
  if (!ctx) throw new Error('useColdStart must be used within ColdStartProvider');
  return ctx;
}
