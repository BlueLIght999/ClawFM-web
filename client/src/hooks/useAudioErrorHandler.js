import { useCallback } from 'react';

/**
 * Returns an onError handler for the music <audio> element.
 * Retries up to 2 times with linear backoff (800ms, 1600ms).
 * After exhausting retries, emits 'player:ended' to skip to next song.
 */
export function useAudioErrorHandler({ audioRef, audioUrl, connected, socket, retryRef }) {
  return useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;
    if (!connected) return;
    if (retryRef.current >= 2) {
      retryRef.current = 0;
      if (socket) socket.emit('player:ended');
      return;
    }
    retryRef.current += 1;
    const retryDelay = 800 * retryRef.current;
    setTimeout(() => {
      if (!connected) return;
      if (audio.src !== audioUrl) return;
      audio.load();
      audio.play().catch(() => {
        if (retryRef.current >= 2 && socket) socket.emit('player:ended');
      });
    }, retryDelay);
  }, [audioRef, audioUrl, connected, socket, retryRef]);
}
