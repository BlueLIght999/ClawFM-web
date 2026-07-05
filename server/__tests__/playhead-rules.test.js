import { describe, it, expect } from 'vitest';
import {
  pausePlayhead,
  playheadElapsedMs,
  resumePlayhead,
  seekPlayhead,
} from '../domain/playback/playheadRules.js';

function playing(overrides = {}) {
  return {
    currentSong: { id: 'song-1', title: 'Song 1' },
    startedAt: 1000,
    songDuration: 10000,
    isPlaying: true,
    transitionTimer: 'timer-ref',
    ...overrides,
  };
}

describe('playhead rules', () => {
  it('playheadElapsedMs_notPlayingOrMissingStart_returnsZero', () => {
    expect(playheadElapsedMs({ ...playing(), isPlaying: false }, 5000)).toBe(0);
    expect(playheadElapsedMs({ ...playing(), startedAt: null }, 5000)).toBe(0);
  });

  it('playheadElapsedMs_playing_capsAtSongDuration', () => {
    expect(playheadElapsedMs(playing(), 4000)).toBe(3000);
    expect(playheadElapsedMs(playing(), 20000)).toBe(10000);
  });

  it('pausePlayhead_playing_returnsPausedStateWithRemainingDuration', () => {
    const current = playing();

    const next = pausePlayhead(current, 4000);

    expect(next).toEqual({
      ...current,
      isPlaying: false,
      remainingAtPause: 7000,
    });
    expect(current.isPlaying).toBe(true);
  });

  it('pausePlayhead_notPlaying_returnsOriginalState', () => {
    const current = playing({ isPlaying: false });

    expect(pausePlayhead(current, 4000)).toBe(current);
  });

  it('resumePlayhead_pausedSong_returnsPlayingStateFromNow', () => {
    const current = playing({
      isPlaying: false,
      remainingAtPause: 7000,
    });

    const next = resumePlayhead(current, 9000);

    expect(next).toEqual({
      ...current,
      startedAt: 9000,
      songDuration: 7000,
      isPlaying: true,
    });
  });

  it('resumePlayhead_withoutSongOrAlreadyPlaying_returnsOriginalState', () => {
    const withoutSong = playing({ currentSong: null, isPlaying: false });
    const alreadyPlaying = playing();

    expect(resumePlayhead(withoutSong, 9000)).toBe(withoutSong);
    expect(resumePlayhead(alreadyPlaying, 9000)).toBe(alreadyPlaying);
  });

  it('seekPlayhead_setsStartedAtSoElapsedMatchesPosition', () => {
    const current = playing();

    const next = seekPlayhead(current, { positionMs: 3000, nowMs: 9000 });

    expect(next).toEqual({
      ...current,
      startedAt: 6000,
    });
    expect(current.startedAt).toBe(1000);
  });
});
