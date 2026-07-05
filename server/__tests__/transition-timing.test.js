import { describe, it, expect } from 'vitest';
import {
  normalizePlaybackDurationMs,
  nextTransitionDelayMs,
} from '../domain/playback/transitionTiming.js';

describe('transition timing rules', () => {
  it('normalizePlaybackDurationMs_prefersStableAndLegacyDurationFields', () => {
    expect(normalizePlaybackDurationMs({ durationMs: 181000 })).toBe(181000);
    expect(normalizePlaybackDurationMs({ dt: 269000 })).toBe(269000);
    expect(normalizePlaybackDurationMs({ duration: 240 })).toBe(240000);
    expect(normalizePlaybackDurationMs({ duration: 180000 })).toBe(180000);
  });

  it('normalizePlaybackDurationMs_missingDuration_usesLegacyFallback', () => {
    expect(normalizePlaybackDurationMs({ title: 'Untimed track' })).toBe(240000);
    expect(normalizePlaybackDurationMs(null)).toBe(240000);
  });

  it('nextTransitionDelayMs_longTrack_subtractsCrossfadeAndSpeechBuffer', () => {
    expect(nextTransitionDelayMs({ durationMs: 240000 })).toBe(233500);
  });

  it('nextTransitionDelayMs_afterSeek_subtractsElapsedPosition', () => {
    expect(nextTransitionDelayMs({ durationMs: 240000, elapsedMs: 100000 })).toBe(133500);
  });

  it('nextTransitionDelayMs_shortButValidTrack_usesMinimumDelay', () => {
    expect(nextTransitionDelayMs({ durationMs: 8000 })).toBe(5000);
  });

  it('nextTransitionDelayMs_whenMinimumDisabled_returnsRawPositiveDelay', () => {
    expect(nextTransitionDelayMs({ durationMs: 8000, minimumDelayMs: 0 })).toBe(1500);
  });

  it('nextTransitionDelayMs_tooShortTrack_returnsNull', () => {
    expect(nextTransitionDelayMs({ durationMs: 6000 })).toBeNull();
  });
});
