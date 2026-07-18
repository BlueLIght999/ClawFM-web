import { useState, useRef } from 'react';
import { useRadioSocketEvents } from './useRadioSocketEvents.js';
import { useChatSocketEvents } from './useChatSocketEvents.js';
import { useSpeechPlayback } from './useSpeechPlayback.js';

/**
 * Manages DJ speech URL state, refs, socket event wiring, and speech playback.
 *
 * Consolidates:
 *   - djSpeechUrl state + djSpeechUrlRef + speechTypeRef
 *   - useRadioSocketEvents (returns pendingSongChangeRef)
 *   - useChatSocketEvents (wires chat → speech URL updates)
 *   - useSpeechPlayback (plays speech, handles end + deferred song change)
 *
 * @param {object} params
 * @param {object} params.socket — Socket.IO client
 * @param {object} params.musicAudioRef — ref to music audio element
 * @param {object} params.speechAudioRef — ref to speech audio element
 * @param {boolean} params.isPlaying — whether radio is currently playing
 * @param {function} params.updateRadioState — updates radio state
 * @param {object} params.pendingSpeechRef — ref for pending cold-start speech
 * @returns {{ djSpeechUrl, setDjSpeechUrl, djSpeechUrlRef, speechTypeRef, pendingSongChangeRef }}
 */
export function useDjSpeech({ socket, musicAudioRef, speechAudioRef, isPlaying, updateRadioState, pendingSpeechRef }) {
  const [djSpeechUrl, setDjSpeechUrl] = useState(null);
  const djSpeechUrlRef = useRef(null);
  const speechTypeRef = useRef('transition');

  // Socket event listeners — radio events return pendingSongChangeRef
  const { pendingSongChangeRef } = useRadioSocketEvents(socket, djSpeechUrlRef);
  useChatSocketEvents(socket, djSpeechUrlRef, speechTypeRef, setDjSpeechUrl, pendingSpeechRef);

  // DJ speech playback — handles speech end + deferred song change
  useSpeechPlayback({
    djSpeechUrl,
    speechAudioRef,
    musicAudioRef,
    speechTypeRef,
    socket,
    isPlaying,
    onSpeechEnd: () => {
      setDjSpeechUrl(null);
      djSpeechUrlRef.current = null;
    },
    onDeferredSongChange: () => {
      if (pendingSongChangeRef.current) {
        const pending = pendingSongChangeRef.current;
        pendingSongChangeRef.current = null;
        updateRadioState(pending);
      }
    },
  });

  return { djSpeechUrl, setDjSpeechUrl, djSpeechUrlRef, speechTypeRef, pendingSongChangeRef };
}
