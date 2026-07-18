import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAudioExpose } from '../hooks/useAudioExpose.js';

describe('useAudioExpose', () => {
  let musicAudioRef;
  let speechAudioRef;

  beforeEach(() => {
    musicAudioRef = {
      current: {
        crossOrigin: null,
        play: vi.fn(),
        pause: vi.fn(),
      },
    };
    speechAudioRef = { current: { pause: vi.fn() } };
  });

  it('returnsAudioEl_state', () => {
    const { result } = renderHook(() => useAudioExpose({
      musicAudioRef,
      speechAudioRef,
      loggedIn: true,
      connected: true,
    }));
    expect(result.current.audioEl).toBeDefined();
  });

  it('setsCrossOrigin_whenAudioElementExists', () => {
    musicAudioRef.current.crossOrigin = null;
    renderHook(() => useAudioExpose({
      musicAudioRef,
      speechAudioRef,
      loggedIn: true,
      connected: true,
    }));
    expect(musicAudioRef.current.crossOrigin).toBe('anonymous');
  });

  it('doesNothing_whenMusicAudioRefIsNull', () => {
    const { result } = renderHook(() => useAudioExpose({
      musicAudioRef: { current: null },
      speechAudioRef,
      loggedIn: true,
      connected: true,
    }));
    expect(result.current.audioEl).toBeNull();
  });

  it('pausesSpeechAudio_whenDisconnected', () => {
    renderHook(() => useAudioExpose({
      musicAudioRef,
      speechAudioRef,
      loggedIn: true,
      connected: false,
    }));
    expect(speechAudioRef.current.pause).toHaveBeenCalled();
  });

  it('doesNotPauseSpeechAudio_whenConnected', () => {
    renderHook(() => useAudioExpose({
      musicAudioRef,
      speechAudioRef,
      loggedIn: true,
      connected: true,
    }));
    expect(speechAudioRef.current.pause).not.toHaveBeenCalled();
  });

  it('doesNotCrash_whenSpeechAudioRefIsNull', () => {
    expect(() => renderHook(() => useAudioExpose({
      musicAudioRef,
      speechAudioRef: { current: null },
      loggedIn: true,
      connected: false,
    }))).not.toThrow();
  });
});
