import { useEffect } from 'react';

/**
 * useSpeechPlayback — manages DJ speech audio lifecycle.
 *
 * Extracted from App.jsx for testability. Handles:
 * - Loading and playing speech audio when djSpeechUrl changes
 * - Ducking music during speech
 * - Proper cleanup when URL changes (pause, remove src, neutralize callbacks)
 * - Emitting dj-speech-finished when speech ends
 *
 * @param {object} params
 * @param {string|null} params.djSpeechUrl - Speech audio URL (null = no speech)
 * @param {RefObject<HTMLAudioElement>} params.speechAudioRef - Ref to speech audio element
 * @param {RefObject<HTMLAudioElement>} params.musicAudioRef - Ref to music audio element
 * @param {RefObject<string>} params.speechTypeRef - Ref to current speech type
 * @param {object} params.socket - Socket.IO client instance
 * @param {boolean} params.isPlaying - Whether music is playing (for resume after speech)
 * @param {function} params.onSpeechEnd - Callback when speech ends (clears djSpeechUrl)
 * @param {function} params.onDeferredSongChange - Callback to apply deferred song change
 */
export function useSpeechPlayback({
  djSpeechUrl,
  speechAudioRef,
  musicAudioRef,
  speechTypeRef,
  socket,
  isPlaying,
  onSpeechEnd,
  onDeferredSongChange,
}) {
  useEffect(() => {
    if (!djSpeechUrl || !speechAudioRef.current) return;

    const speech = speechAudioRef.current;
    const curType = speechTypeRef.current;

    // Chat is text-only — never pause music for chat speech
    if (curType === 'chat') {
      onSpeechEnd();
      return;
    }

    const isAnnounce = curType === 'chat-announce' || curType === 'proactive';
    const music = musicAudioRef.current;
    const prevVolume = music?.volume;

    // Duck music
    if (music) {
      if (curType === 'proactive') {
        music.volume = 0.1;
      } else if (isAnnounce) {
        music.volume = 0.2;
      } else {
        music.pause();
      }
    }

    let resolved = false;
    let loadTimeout = null;

    const finish = () => {
      if (resolved) return;
      resolved = true;
      clearTimeout(loadTimeout);
      onSpeechEnd();
      if (music && isAnnounce && prevVolume !== undefined) {
        music.volume = prevVolume;
      }
      if (socket) socket.emit('dj-speech-finished', { type: curType });
      if (music && !isAnnounce && isPlaying) {
        music.play().catch(() => {});
      }
      onDeferredSongChange();
    };

    const canplayHandler = () => {
      clearTimeout(loadTimeout);
      speech.play().then(() => {}).catch(() => { finish(); });
    };

    // Set up speech audio
    speech.src = djSpeechUrl;
    if (curType === 'proactive') speech.volume = 0.6;
    else if (curType === 'chat-announce') speech.volume = 0.85;
    else speech.volume = 1.0;

    speech.onended = finish;
    speech.onerror = () => {
      if (resolved) return;
      speech.load();
      setTimeout(() => {
        if (resolved) return;
        speech.play().catch(() => { finish(); });
      }, 800);
    };

    speech.addEventListener('canplay', canplayHandler, { once: true });
    loadTimeout = setTimeout(() => {
      speech.play().catch(() => {});
    }, 2000);
    speech.load();

    // Safety: force-finish if speech hangs
    const safety = setTimeout(() => {
      if (speech && !speech.ended && !speech.paused) return;
      finish();
    }, curType === 'cold-start' ? 15000 : 30000);

    // Cleanup — comprehensive: pause, remove src, neutralize finish
    return () => {
      clearTimeout(safety);
      clearTimeout(loadTimeout);
      resolved = true; // ★ Key fix: neutralize old finish closure
      speech.removeEventListener('canplay', canplayHandler);
      speech.pause();
      speech.removeAttribute('src');
      speech.load();
      if (music && isAnnounce && prevVolume !== undefined) {
        music.volume = prevVolume;
      }
    };
  }, [djSpeechUrl]);
}
