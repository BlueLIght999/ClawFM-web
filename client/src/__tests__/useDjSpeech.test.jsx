import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Mock all sub-hooks so we test only useDjSpeech orchestration
vi.mock('../hooks/useRadioSocketEvents.js', () => ({
  useRadioSocketEvents: vi.fn(() => ({ pendingSongChangeRef: { current: null } })),
}));
vi.mock('../hooks/useChatSocketEvents.js', () => ({
  useChatSocketEvents: vi.fn(),
}));
vi.mock('../hooks/useSpeechPlayback.js', () => ({
  useSpeechPlayback: vi.fn(),
}));

import { useDjSpeech } from '../hooks/useDjSpeech.js';
import { useRadioSocketEvents } from '../hooks/useRadioSocketEvents.js';
import { useChatSocketEvents } from '../hooks/useChatSocketEvents.js';
import { useSpeechPlayback } from '../hooks/useSpeechPlayback.js';

describe('useDjSpeech', () => {
  let mockSocket, mockMusicAudioRef, mockSpeechAudioRef, mockUpdateRadioState, mockPendingSpeechRef;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSocket = { emit: vi.fn(), on: vi.fn() };
    mockMusicAudioRef = { current: null };
    mockSpeechAudioRef = { current: null };
    mockUpdateRadioState = vi.fn();
    mockPendingSpeechRef = { current: null };
  });

  it('initializesDjSpeechUrl_asNull', () => {
    const { result } = renderHook(() => useDjSpeech({
      socket: mockSocket,
      musicAudioRef: mockMusicAudioRef,
      speechAudioRef: mockSpeechAudioRef,
      isPlaying: false,
      updateRadioState: mockUpdateRadioState,
      pendingSpeechRef: mockPendingSpeechRef,
    }));
    expect(result.current.djSpeechUrl).toBeNull();
  });

  it('exposesSetDjSpeechUrl_forExternalUse', () => {
    const { result } = renderHook(() => useDjSpeech({
      socket: mockSocket,
      musicAudioRef: mockMusicAudioRef,
      speechAudioRef: mockSpeechAudioRef,
      isPlaying: false,
      updateRadioState: mockUpdateRadioState,
      pendingSpeechRef: mockPendingSpeechRef,
    }));
    act(() => result.current.setDjSpeechUrl('http://speech.mp3'));
    expect(result.current.djSpeechUrl).toBe('http://speech.mp3');
  });

  it('exposesDjSpeechUrlRef_andSpeechTypeRef', () => {
    const { result } = renderHook(() => useDjSpeech({
      socket: mockSocket,
      musicAudioRef: mockMusicAudioRef,
      speechAudioRef: mockSpeechAudioRef,
      isPlaying: false,
      updateRadioState: mockUpdateRadioState,
      pendingSpeechRef: mockPendingSpeechRef,
    }));
    expect(result.current.djSpeechUrlRef).toBeDefined();
    expect(result.current.djSpeechUrlRef.current).toBeNull();
    expect(result.current.speechTypeRef).toBeDefined();
    expect(result.current.speechTypeRef.current).toBe('transition');
  });

  it('exposesPendingSongChangeRef_fromRadioSocketEvents', () => {
    const mockPendingRef = { current: null };
    useRadioSocketEvents.mockReturnValue({ pendingSongChangeRef: mockPendingRef });
    const { result } = renderHook(() => useDjSpeech({
      socket: mockSocket,
      musicAudioRef: mockMusicAudioRef,
      speechAudioRef: mockSpeechAudioRef,
      isPlaying: false,
      updateRadioState: mockUpdateRadioState,
      pendingSpeechRef: mockPendingSpeechRef,
    }));
    expect(result.current.pendingSongChangeRef).toBe(mockPendingRef);
  });

  it('callsRadioSocketEvents_withSocketAndDjSpeechUrlRef', () => {
    renderHook(() => useDjSpeech({
      socket: mockSocket,
      musicAudioRef: mockMusicAudioRef,
      speechAudioRef: mockSpeechAudioRef,
      isPlaying: false,
      updateRadioState: mockUpdateRadioState,
      pendingSpeechRef: mockPendingSpeechRef,
    }));
    expect(useRadioSocketEvents).toHaveBeenCalledWith(
      mockSocket,
      expect.objectContaining({ current: null }),
    );
  });

  it('callsChatSocketEvents_withAllRefs', () => {
    renderHook(() => useDjSpeech({
      socket: mockSocket,
      musicAudioRef: mockMusicAudioRef,
      speechAudioRef: mockSpeechAudioRef,
      isPlaying: false,
      updateRadioState: mockUpdateRadioState,
      pendingSpeechRef: mockPendingSpeechRef,
    }));
    expect(useChatSocketEvents).toHaveBeenCalledWith(
      mockSocket,
      expect.objectContaining({ current: null }),
      expect.objectContaining({ current: 'transition' }),
      expect.any(Function),
      mockPendingSpeechRef,
    );
  });

  it('callsSpeechPlayback_withCorrectParams', () => {
    renderHook(() => useDjSpeech({
      socket: mockSocket,
      musicAudioRef: mockMusicAudioRef,
      speechAudioRef: mockSpeechAudioRef,
      isPlaying: true,
      updateRadioState: mockUpdateRadioState,
      pendingSpeechRef: mockPendingSpeechRef,
    }));
    expect(useSpeechPlayback).toHaveBeenCalledWith(
      expect.objectContaining({
        speechAudioRef: mockSpeechAudioRef,
        musicAudioRef: mockMusicAudioRef,
        socket: mockSocket,
        isPlaying: true,
      }),
    );
  });

  it('onSpeechEnd_clearsDjSpeechUrl', () => {
    const { result } = renderHook(() => useDjSpeech({
      socket: mockSocket,
      musicAudioRef: mockMusicAudioRef,
      speechAudioRef: mockSpeechAudioRef,
      isPlaying: false,
      updateRadioState: mockUpdateRadioState,
      pendingSpeechRef: mockPendingSpeechRef,
    }));
    act(() => result.current.setDjSpeechUrl('http://speech.mp3'));
    expect(result.current.djSpeechUrl).toBe('http://speech.mp3');

    // Get the onSpeechEnd callback from useSpeechPlayback call
    const playbackCall = useSpeechPlayback.mock.calls[0][0];
    act(() => playbackCall.onSpeechEnd());

    expect(result.current.djSpeechUrl).toBeNull();
    expect(result.current.djSpeechUrlRef.current).toBeNull();
  });

  it('onDeferredSongChange_appliesPendingSongChange', () => {
    const mockPendingRef = { current: { audioUrl: 'http://new.mp3', currentSong: { id: 's2' } } };
    useRadioSocketEvents.mockReturnValue({ pendingSongChangeRef: mockPendingRef });
    renderHook(() => useDjSpeech({
      socket: mockSocket,
      musicAudioRef: mockMusicAudioRef,
      speechAudioRef: mockSpeechAudioRef,
      isPlaying: false,
      updateRadioState: mockUpdateRadioState,
      pendingSpeechRef: mockPendingSpeechRef,
    }));

    const playbackCall = useSpeechPlayback.mock.calls[0][0];
    playbackCall.onDeferredSongChange();

    expect(mockUpdateRadioState).toHaveBeenCalledWith({ audioUrl: 'http://new.mp3', currentSong: { id: 's2' } });
    expect(mockPendingRef.current).toBeNull();
  });

  it('onDeferredSongChange_doesNothing_whenNoPendingChange', () => {
    const mockPendingRef = { current: null };
    useRadioSocketEvents.mockReturnValue({ pendingSongChangeRef: mockPendingRef });
    renderHook(() => useDjSpeech({
      socket: mockSocket,
      musicAudioRef: mockMusicAudioRef,
      speechAudioRef: mockSpeechAudioRef,
      isPlaying: false,
      updateRadioState: mockUpdateRadioState,
      pendingSpeechRef: mockPendingSpeechRef,
    }));

    const playbackCall = useSpeechPlayback.mock.calls[0][0];
    playbackCall.onDeferredSongChange();

    expect(mockUpdateRadioState).not.toHaveBeenCalled();
  });
});
