import { useEffect, useRef } from 'react';

export function useAudioController({ audioRef, audioUrl, isPlaying, loggedIn, connected }) {
  const musicRetryRef = useRef(0);

  useEffect(() => {
    if (!loggedIn) return;
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;
    if (audio.src === audioUrl) return;
    musicRetryRef.current = 0;
    audio.src = audioUrl;
    audio.load();
    audio.play().catch(() => {});
  }, [audioUrl, loggedIn, audioRef]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;
    if (!loggedIn) return;
    if (!connected) return;
    if (isPlaying) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, [isPlaying, loggedIn, connected, audioUrl, audioRef]);

  useEffect(() => {
    if (connected) return;
    const audio = audioRef.current;
    if (audio) audio.pause();
  }, [connected, audioRef]);

  return { musicRetryRef };
}
