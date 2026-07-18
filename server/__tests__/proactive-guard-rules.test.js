import { describe, it, expect } from 'vitest';
import { canAttemptProactiveSpeech } from '../domain/hosting/proactiveGuardRules.js';

const baseScheduler = {
  coldStartState: 'done',
  isPlaying: true,
  isAdvancing: false,
  songsSinceLastSpeech: 3,
  currentSong: { id: 's1' },
};

const baseTiming = {
  enabled: true,
  nowMs: 1700000000000,
  lastSpeechMs: 1700000000000 - 120000, // 120s ago
};

describe('canAttemptProactiveSpeech', () => {
  it('returns true when all guards pass', () => {
    expect(canAttemptProactiveSpeech(baseScheduler, baseTiming)).toBe(true);
  });

  it('returns false when disabled', () => {
    expect(canAttemptProactiveSpeech(baseScheduler, { ...baseTiming, enabled: false })).toBe(false);
  });

  it('returns false when coldStartState is pending', () => {
    expect(canAttemptProactiveSpeech(
      { ...baseScheduler, coldStartState: 'pending' }, baseTiming,
    )).toBe(false);
  });

  it('returns false when coldStartState is in-progress', () => {
    expect(canAttemptProactiveSpeech(
      { ...baseScheduler, coldStartState: 'in-progress' }, baseTiming,
    )).toBe(false);
  });

  it('returns false when not playing', () => {
    expect(canAttemptProactiveSpeech(
      { ...baseScheduler, isPlaying: false }, baseTiming,
    )).toBe(false);
  });

  it('returns false when advancing', () => {
    expect(canAttemptProactiveSpeech(
      { ...baseScheduler, isAdvancing: true }, baseTiming,
    )).toBe(false);
  });

  it('returns false when songsSinceLastSpeech < 2', () => {
    expect(canAttemptProactiveSpeech(
      { ...baseScheduler, songsSinceLastSpeech: 1 }, baseTiming,
    )).toBe(false);
  });

  it('returns true when songsSinceLastSpeech = 2 (boundary)', () => {
    expect(canAttemptProactiveSpeech(
      { ...baseScheduler, songsSinceLastSpeech: 2 }, baseTiming,
    )).toBe(true);
  });

  it('returns false when songsSinceLastSpeech is 0', () => {
    expect(canAttemptProactiveSpeech(
      { ...baseScheduler, songsSinceLastSpeech: 0 }, baseTiming,
    )).toBe(false);
  });

  it('returns false when within 90s of last speech', () => {
    expect(canAttemptProactiveSpeech(baseScheduler, {
      ...baseTiming,
      lastSpeechMs: baseTiming.nowMs - 30000, // 30s ago
    })).toBe(false);
  });

  it('returns true at exactly 90s boundary', () => {
    expect(canAttemptProactiveSpeech(baseScheduler, {
      ...baseTiming,
      lastSpeechMs: baseTiming.nowMs - 90000, // exactly 90s ago
    })).toBe(true);
  });

  it('returns false when no current song', () => {
    expect(canAttemptProactiveSpeech(
      { ...baseScheduler, currentSong: null }, baseTiming,
    )).toBe(false);
  });

  it('handles undefined songsSinceLastSpeech as 0', () => {
    expect(canAttemptProactiveSpeech(
      { ...baseScheduler, songsSinceLastSpeech: undefined }, baseTiming,
    )).toBe(false);
  });

  it('handles null songsSinceLastSpeech as 0', () => {
    expect(canAttemptProactiveSpeech(
      { ...baseScheduler, songsSinceLastSpeech: null }, baseTiming,
    )).toBe(false);
  });

  it('does not mutate scheduler or timing', () => {
    const schedCopy = { ...baseScheduler };
    const timingCopy = { ...baseTiming };
    canAttemptProactiveSpeech(baseScheduler, baseTiming);
    expect(baseScheduler).toEqual(schedCopy);
    expect(baseTiming).toEqual(timingCopy);
  });
});
