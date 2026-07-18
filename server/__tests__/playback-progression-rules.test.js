import { describe, it, expect } from 'vitest';
import {
  startSongPlayhead,
  transitionDelayForPlayback,
  skipOutcome,
} from '../domain/playback/playbackProgressionRules.js';

describe('startSongPlayhead', () => {
  it('creates playing playhead with song and normalized duration', () => {
    const now = 1700000000000;
    const song = { id: 's1', name: 'Test', dt: 180000 };
    const ph = startSongPlayhead(song, now);
    expect(ph.currentSong).toBe(song);
    expect(ph.startedAt).toBe(now);
    expect(ph.songDuration).toBe(180000);
    expect(ph.isPlaying).toBe(true);
    expect(ph._advancing).toBe(false);
  });

  it('normalizes duration from seconds when below 1000', () => {
    const song = { id: 's2', dt: 240 };
    const ph = startSongPlayhead(song, 0);
    expect(ph.songDuration).toBe(240000);
  });

  it('uses default duration when song has no duration fields', () => {
    const song = { id: 's3', name: 'No Duration' };
    const ph = startSongPlayhead(song, 0);
    expect(ph.songDuration).toBe(240000);
  });

  it('resets advancing flag to false', () => {
    const song = { id: 's4', dt: 100000 };
    const ph = startSongPlayhead(song, 0);
    expect(ph._advancing).toBe(false);
  });

  it('does not mutate the input song', () => {
    const song = { id: 's5', dt: 100000 };
    const original = { ...song };
    startSongPlayhead(song, 0);
    expect(song).toEqual(original);
  });
});

describe('transitionDelayForPlayback', () => {
  it('returns positive delay when song has enough remaining time', () => {
    const delay = transitionDelayForPlayback({ durationMs: 300000, elapsedMs: 0 });
    expect(delay).toBeGreaterThan(0);
    expect(delay).toBeLessThan(300000);
  });

  it('returns null when song is too short for transition', () => {
    const delay = transitionDelayForPlayback({ durationMs: 5000, elapsedMs: 0 });
    expect(delay).toBeNull();
  });

  it('returns null when elapsed exceeds duration', () => {
    const delay = transitionDelayForPlayback({ durationMs: 100000, elapsedMs: 100000 });
    expect(delay).toBeNull();
  });

  it('respects minimumDelayMs override for resume', () => {
    const delay = transitionDelayForPlayback({ durationMs: 300000, elapsedMs: 0, minimumDelayMs: 0 });
    // With minimumDelayMs=0, the delay can be smaller than the default 5s minimum
    const defaultDelay = transitionDelayForPlayback({ durationMs: 300000, elapsedMs: 0 });
    expect(delay).toBeLessThanOrEqual(defaultDelay);
  });

  it('subtracts crossfade and speech buffer from remaining', () => {
    // 300s song, 0 elapsed: remaining = 300000 - 0 - 2500 - 4000 = 293500
    // max(293500, 5000) = 293500
    const delay = transitionDelayForPlayback({ durationMs: 300000, elapsedMs: 0 });
    expect(delay).toBe(293500);
  });
});

describe('skipOutcome', () => {
  it('returns continue when queue has next song', () => {
    const result = skipOutcome({ queueHasNext: true });
    expect(result.shouldStop).toBe(false);
  });

  it('returns stop with empty playhead when queue is empty', () => {
    const result = skipOutcome({ queueHasNext: false });
    expect(result.shouldStop).toBe(true);
    expect(result.playhead.currentSong).toBeNull();
    expect(result.playhead.isPlaying).toBe(false);
  });

  it('preserves transitionTimer ref in stopped playhead for cleanup', () => {
    const result = skipOutcome({ queueHasNext: false });
    // The stopped playhead should not carry over stale timers
    expect(result.playhead.transitionTimer).toBeUndefined();
  });

  it('does not mutate any input', () => {
    const input = { queueHasNext: false };
    const original = { ...input };
    skipOutcome(input);
    expect(input).toEqual(original);
  });
});
