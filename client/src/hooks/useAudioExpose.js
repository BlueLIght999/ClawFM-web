import { useState, useEffect } from 'react';

/**
 * Manages audio element exposure and speech pause on disconnect.
 * - Exposes music audio element to parent for Spectrum visualization
 * - Pauses speech audio when socket disconnects (server down / killed)
 */
export function useAudioExpose({ musicAudioRef, speechAudioRef, loggedIn, connected }) {
  const [audioEl, setAudioEl] = useState(null);

  // Expose audio element for Spectrum
  useEffect(() => {
    const el = musicAudioRef.current;
    if (el) {
      el.crossOrigin = 'anonymous';
      setAudioEl(el);
    }
  }, [loggedIn, musicAudioRef]);

  // Pause speech audio when socket disconnects
  useEffect(() => {
    if (connected) return;
    const speech = speechAudioRef.current;
    if (speech) speech.pause();
  }, [connected, speechAudioRef]);

  return { audioEl };
}
