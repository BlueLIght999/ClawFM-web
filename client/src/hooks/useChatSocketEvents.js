import { useEffect } from 'react';
import { useChat } from '../contexts/ChatContext.jsx';
import { useCrab } from '../contexts/CrabContext.jsx';
import { useRadio } from '../contexts/RadioContext.jsx';
import { useColdStart } from '../contexts/ColdStartContext.jsx';
import { E } from '../constants/events.js';

export function useChatSocketEvents(socket, djSpeechUrlRef, speechTypeRef, setDjSpeechUrl, pendingSpeechRef) {
  const { addDJMessage, showDJMessage, appendDJStreamChunk, endDJStream } = useChat();
  const { setCrabState } = useCrab();
  const { isPlayingRef } = useRadio();
  const { setColdPhase } = useColdStart();

  useEffect(() => {
    if (!socket) return;

    socket.on(E.DJ_MESSAGE, (data) => {
      addDJMessage(data.text);
      showDJMessage(data.text);
    });

    socket.on(E.DJ_SPEECH_START, (data) => {
      speechTypeRef.current = data.type || 'transition';
      if (data.type === 'cold-start') {
        pendingSpeechRef.current = data.audioUrl;
        setColdPhase('exit');
      } else {
        djSpeechUrlRef.current = data.audioUrl;
        setDjSpeechUrl(data.audioUrl);
        setCrabState('talking');
      }
    });

    socket.on(E.DJ_SPEECH_END, () => {
      setDjSpeechUrl(null);
      djSpeechUrlRef.current = null;
      setCrabState(isPlayingRef.current ? 'listening' : 'idle');
    });

    socket.on(E.DJ_STREAM_CHUNK, (data) => {
      appendDJStreamChunk(data.messageId, data.token);
    });

    socket.on(E.DJ_STREAM_END, () => {
      endDJStream();
    });

    return () => {
      socket.off(E.DJ_MESSAGE);
      socket.off(E.DJ_SPEECH_START);
      socket.off(E.DJ_SPEECH_END);
      socket.off(E.DJ_STREAM_CHUNK);
      socket.off(E.DJ_STREAM_END);
    };
  }, [socket, addDJMessage, showDJMessage, appendDJStreamChunk, endDJStream,
      setCrabState, isPlayingRef, setColdPhase, djSpeechUrlRef, speechTypeRef,
      setDjSpeechUrl, pendingSpeechRef]);
}
