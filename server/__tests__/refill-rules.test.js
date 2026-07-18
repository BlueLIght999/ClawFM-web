import { describe, it, expect } from 'vitest';
import {
  shouldTriggerRefill,
  refillOutcome,
  r1InvariantHolds,
} from '../domain/playback/refillRules.js';

describe('shouldTriggerRefill', () => {
  it('returns true when queue is empty and radio is playing', () => {
    expect(shouldTriggerRefill({ queueLength: 0, isPlaying: true })).toBe(true);
  });

  it('returns false when queue has songs', () => {
    expect(shouldTriggerRefill({ queueLength: 5, isPlaying: true })).toBe(false);
  });

  it('returns false when radio is not playing', () => {
    expect(shouldTriggerRefill({ queueLength: 0, isPlaying: false })).toBe(false);
  });

  it('returns false when queue is empty but no current song', () => {
    expect(shouldTriggerRefill({ queueLength: 0, isPlaying: true, hasCurrentSong: false })).toBe(false);
  });

  it('returns true when queue is empty and has current song', () => {
    expect(shouldTriggerRefill({ queueLength: 0, isPlaying: true, hasCurrentSong: true })).toBe(true);
  });
});

describe('refillOutcome', () => {
  it('returns playRefillSong when refill song is available', () => {
    const refillSong = { id: 'r1', name: 'Refill Song' };
    const result = refillOutcome({ queueHasNext: false, refillSong });
    expect(result.action).toBe('playRefillSong');
    expect(result.song).toBe(refillSong);
    expect(result.shouldStop).toBe(false);
  });

  it('returns playNext when queue already has next song', () => {
    const nextSong = { id: 'n1', name: 'Next Song' };
    const result = refillOutcome({ queueHasNext: true, refillSong: null, nextSong });
    expect(result.action).toBe('playNext');
    expect(result.song).toBe(nextSong);
  });

  it('returns triggerRefill when no song available and refill not yet attempted', () => {
    const result = refillOutcome({ queueHasNext: false, refillSong: null, refillAttempted: false });
    expect(result.action).toBe('triggerRefill');
    expect(result.shouldStop).toBe(false);
  });

  it('returns stopWithWarning when refill attempted but failed', () => {
    const result = refillOutcome({ queueHasNext: false, refillSong: null, refillAttempted: true });
    expect(result.action).toBe('stopWithWarning');
    expect(result.shouldStop).toBe(true);
    expect(result.reason).toContain('refill failed');
  });
});

describe('r1InvariantHolds', () => {
  it('returns true when radio is playing with a current song', () => {
    expect(r1InvariantHolds({
      isPlaying: true,
      currentSong: { id: 's1' },
      queueLength: 5,
    })).toBe(true);
  });

  it('returns true when radio is paused (not a silence violation)', () => {
    expect(r1InvariantHolds({
      isPlaying: false,
      currentSong: { id: 's1' },
      queueLength: 5,
    })).toBe(true);
  });

  it('returns false when radio is playing but no current song', () => {
    expect(r1InvariantHolds({
      isPlaying: true,
      currentSong: null,
      queueLength: 0,
    })).toBe(false);
  });

  it('returns true when radio is not playing and no current song (idle state)', () => {
    expect(r1InvariantHolds({
      isPlaying: false,
      currentSong: null,
      queueLength: 0,
    })).toBe(true);
  });

  it('returns false when playing with current song but queue empty and no refill in progress', () => {
    expect(r1InvariantHolds({
      isPlaying: true,
      currentSong: { id: 's1' },
      queueLength: 0,
      refillInProgress: false,
    })).toBe(false);
  });

  it('returns true when playing with current song, queue empty, but refill in progress', () => {
    expect(r1InvariantHolds({
      isPlaying: true,
      currentSong: { id: 's1' },
      queueLength: 0,
      refillInProgress: true,
    })).toBe(true);
  });
});
