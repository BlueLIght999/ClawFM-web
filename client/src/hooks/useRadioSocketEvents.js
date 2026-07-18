import { useEffect, useRef } from 'react';
import { useRadio } from '../contexts/RadioContext.jsx';
import { useColdStart } from '../contexts/ColdStartContext.jsx';
import { useCrab } from '../contexts/CrabContext.jsx';
import { E } from '../constants/events.js';

export function useRadioSocketEvents(socket, djSpeechUrlRef) {
  const { setRadioState, updateRadioState, isPlayingRef } = useRadio();
  const { coldPhaseRef, setColdPhase } = useColdStart();
  const { setCrabState } = useCrab();
  const pendingSongChangeRef = useRef(null);

  useEffect(() => {
    if (!socket) return;

    socket.on(E.RADIO_STATE, (state) => updateRadioState(state));

    socket.on(E.SONG_CHANGE, (data) => {
      const newSongState = { currentSong: data.song, startedAt: data.startedAt, isPlaying: true, audioUrl: data.audioUrl || null };
      if (djSpeechUrlRef.current) {
        pendingSongChangeRef.current = newSongState;
        updateRadioState({ currentSong: data.song, startedAt: data.startedAt, isPlaying: true });
      } else {
        updateRadioState(newSongState);
      }
      setCrabState('bouncing');
      setTimeout(() => setCrabState(isPlayingRef.current ? 'listening' : 'idle'), 3000);
      if (coldPhaseRef.current === 'loading') setColdPhase('exit');
      else setColdPhase('done');
    });

    socket.on(E.QUEUE_UPDATE, (data) => setRadioState(prev => ({ ...prev, upcomingSongs: data.upcomingSongs, queueMode: data.mode || prev.queueMode })));

    socket.on(E.PLAYBACK_POSITION, (pos) => updateRadioState({ elapsed: pos.elapsed, duration: pos.duration }));

    socket.on(E.PAUSE, () => { updateRadioState({ isPlaying: false }); setCrabState('idle'); });

    socket.on(E.RESUME, (data) => updateRadioState({ isPlaying: true, startedAt: data.startedAt }));

    return () => {
      socket.off(E.RADIO_STATE);
      socket.off(E.SONG_CHANGE);
      socket.off(E.QUEUE_UPDATE);
      socket.off(E.PLAYBACK_POSITION);
      socket.off(E.PAUSE);
      socket.off(E.RESUME);
    };
  }, [socket, setRadioState, updateRadioState, isPlayingRef, coldPhaseRef, setColdPhase, setCrabState, djSpeechUrlRef]);

  return { pendingSongChangeRef };
}
