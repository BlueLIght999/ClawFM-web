import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAudioController } from '../hooks/useAudioController.js';

describe('useAudioController', () => {
  it('does not play audio when not logged in', () => {
    const audio = { src: '', play: vi.fn().mockResolvedValue(undefined), load: vi.fn(), pause: vi.fn() };
    renderHook(() => useAudioController({
      audioRef: { current: audio }, audioUrl: 'http://example.com/song.mp3',
      isPlaying: true, loggedIn: false, connected: true,
    }));
    expect(audio.play).not.toHaveBeenCalled();
  });

  it('loads and plays audio when audioUrl arrives and logged in', () => {
    const audio = { src: '', play: vi.fn().mockResolvedValue(undefined), load: vi.fn(), pause: vi.fn() };
    renderHook(() => useAudioController({
      audioRef: { current: audio }, audioUrl: 'http://example.com/song.mp3',
      isPlaying: true, loggedIn: true, connected: true,
    }));
    expect(audio.src).toBe('http://example.com/song.mp3');
    expect(audio.load).toHaveBeenCalled();
    expect(audio.play).toHaveBeenCalled();
  });

  it('does not reload audio if src already matches', () => {
    const audio = { src: 'http://example.com/song.mp3', play: vi.fn().mockResolvedValue(undefined), load: vi.fn(), pause: vi.fn() };
    renderHook(() => useAudioController({
      audioRef: { current: audio }, audioUrl: 'http://example.com/song.mp3',
      isPlaying: true, loggedIn: true, connected: true,
    }));
    expect(audio.load).not.toHaveBeenCalled();
  });

  it('pauses audio when disconnected', () => {
    const audio = { src: '', play: vi.fn().mockResolvedValue(undefined), load: vi.fn(), pause: vi.fn() };
    const { rerender } = renderHook(
      ({ connected }) => useAudioController({
        audioRef: { current: audio }, audioUrl: 'http://example.com/song.mp3',
        isPlaying: true, loggedIn: true, connected,
      }),
      { initialProps: { connected: true } }
    );
    rerender({ connected: false });
    expect(audio.pause).toHaveBeenCalled();
  });
});
