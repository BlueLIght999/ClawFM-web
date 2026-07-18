import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAudioErrorHandler } from '../hooks/useAudioErrorHandler.js';

describe('useAudioErrorHandler', () => {
  let audioMock;
  let socketMock;
  let retryRef;

  beforeEach(() => {
    vi.useFakeTimers();
    audioMock = {
      src: 'http://example.com/song.mp3',
      load: vi.fn(),
      play: vi.fn().mockResolvedValue(undefined),
    };
    socketMock = { emit: vi.fn() };
    retryRef = { current: 0 };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function renderHandler(overrides = {}) {
    const { result } = renderHook(() => useAudioErrorHandler({
      audioRef: overrides.audioRef ?? { current: audioMock },
      audioUrl: overrides.audioUrl === undefined ? 'http://example.com/song.mp3' : overrides.audioUrl,
      connected: overrides.connected ?? true,
      socket: overrides.socket ?? socketMock,
      retryRef: overrides.retryRef ?? retryRef,
    }));
    return result.current;
  }

  it('doesNothing_whenAudioIsNull', () => {
    const handler = renderHandler({ audioRef: { current: null } });
    handler();
    expect(socketMock.emit).not.toHaveBeenCalled();
  });

  it('doesNothing_whenAudioUrlIsEmpty', () => {
    const handler = renderHandler({ audioUrl: null });
    handler();
    expect(socketMock.emit).not.toHaveBeenCalled();
    expect(retryRef.current).toBe(0);
  });

  it('doesNothing_whenNotConnected', () => {
    const handler = renderHandler({ connected: false });
    handler();
    expect(socketMock.emit).not.toHaveBeenCalled();
    expect(retryRef.current).toBe(0);
  });

  it('emitsPlayerEnded_whenRetriesExhausted', () => {
    retryRef.current = 2;
    const handler = renderHandler({});
    handler();
    expect(socketMock.emit).toHaveBeenCalledWith('player:ended');
    expect(retryRef.current).toBe(0);
  });

  it('incrementsRetryAndSchedulesTimeout_onFirstError', () => {
    const handler = renderHandler({});
    handler();
    expect(retryRef.current).toBe(1);
    expect(audioMock.load).not.toHaveBeenCalled();
    vi.advanceTimersByTime(800);
    expect(audioMock.load).toHaveBeenCalled();
    expect(audioMock.play).toHaveBeenCalled();
  });

  it('uses800msDelayOnFirstRetry_1600msOnSecond', () => {
    const handler = renderHandler({});
    handler();
    expect(retryRef.current).toBe(1);
    vi.advanceTimersByTime(799);
    expect(audioMock.load).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(audioMock.load).toHaveBeenCalled();

    // Second retry
    audioMock.load.mockClear();
    audioMock.play.mockClear();
    handler();
    expect(retryRef.current).toBe(2);
    vi.advanceTimersByTime(1599);
    expect(audioMock.load).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(audioMock.load).toHaveBeenCalled();
  });

  it('skipsRetry_whenSongChangedDuringDelay', () => {
    const handler = renderHandler({});
    handler();
    expect(retryRef.current).toBe(1);
    // Simulate song change
    audioMock.src = 'http://example.com/different-song.mp3';
    vi.advanceTimersByTime(800);
    expect(audioMock.load).not.toHaveBeenCalled();
  });

  it('emitsPlayerEnded_whenPlayRejectsAndRetriesExhausted', () => {
    audioMock.play.mockRejectedValueOnce(new Error('play failed'));
    retryRef.current = 1;
    const handler = renderHandler({});
    handler();
    expect(retryRef.current).toBe(2);
    vi.advanceTimersByTime(1600);
    // play() rejection should trigger player:ended since retries >= 2
    return vi.waitFor(() => {
      expect(socketMock.emit).toHaveBeenCalledWith('player:ended');
    });
  });
});
