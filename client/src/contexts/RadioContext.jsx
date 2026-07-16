import { createContext, useContext, useState, useCallback, useRef } from 'react';

const RadioContext = createContext(null);

const DEFAULT_RADIO_STATE = {
  currentSong: null,
  startedAt: null,
  isPlaying: false,
  queueMode: 'shuffle',
  upcomingSongs: [],
  elapsed: 0,
  duration: 0,
  audioUrl: null,
};

export function RadioProvider({ socket, children }) {
  const [radioState, setRadioState] = useState(DEFAULT_RADIO_STATE);
  const musicAudioRef = useRef(null);
  const musicRetryRef = useRef(0);
  const isPlayingRef = useRef(false);
  isPlayingRef.current = radioState.isPlaying;

  const updateRadioState = useCallback((partial) => {
    setRadioState(prev => ({ ...prev, ...partial }));
  }, []);

  const skip = useCallback(() => {
    if (socket) socket.emit('player:skip');
  }, [socket]);

  const previous = useCallback(() => {
    if (socket) socket.emit('player:previous');
  }, [socket]);

  const pause = useCallback(() => {
    if (socket) socket.emit('player:pause');
  }, [socket]);

  const resume = useCallback(() => {
    if (socket) socket.emit('player:resume');
  }, [socket]);

  const setMode = useCallback((mode) => {
    if (socket) socket.emit('player:set-mode', { mode });
  }, [socket]);

  const value = {
    radioState,
    setRadioState,
    updateRadioState,
    skip,
    previous,
    pause,
    resume,
    setMode,
    musicAudioRef,
    musicRetryRef,
    isPlayingRef,
  };

  return <RadioContext.Provider value={value}>{children}</RadioContext.Provider>;
}

export function useRadio() {
  const ctx = useContext(RadioContext);
  if (!ctx) throw new Error('useRadio must be used within RadioProvider');
  return ctx;
}
