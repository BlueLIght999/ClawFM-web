import { describe, it, expect } from 'vitest';
import {
  estimatedSpeechDurationSeconds,
  refillNoTtsDelayMs,
  shouldDropStaleSpeech,
  transitionNoTtsDelayMs,
} from '../domain/hosting/djSpeechRules.js';

describe('DJ speech rules', () => {
  it('estimatedSpeechDurationSeconds_usesTwelveCharsPerSecond', () => {
    // 48 chars / 12 = 4s (above minimum)
    expect(estimatedSpeechDurationSeconds('a'.repeat(48))).toBe(4);
    // 60 chars / 12 = 5s
    expect(estimatedSpeechDurationSeconds('a'.repeat(60))).toBe(5);
  });

  it('estimatedSpeechDurationSeconds_enforcesMinimumDuration', () => {
    expect(estimatedSpeechDurationSeconds('')).toBe(3);
    expect(estimatedSpeechDurationSeconds('hi')).toBe(3);
    // 12 chars = 1s raw, but minimum is 3s
    expect(estimatedSpeechDurationSeconds('a'.repeat(12))).toBe(3);
    // 35 chars = ~2.9s raw, still below minimum
    expect(estimatedSpeechDurationSeconds('a'.repeat(35))).toBe(3);
  });

  it('shouldDropStaleSpeech_whenTransitionChangedOrMusicStarted_returnsTrue', () => {
    expect(shouldDropStaleSpeech({
      expectedTransitionId: 'old',
      currentTransitionId: 'new',
      isPlaying: false,
    })).toBe(true);
    expect(shouldDropStaleSpeech({
      expectedTransitionId: 'same',
      currentTransitionId: 'same',
      isPlaying: true,
    })).toBe(true);
    expect(shouldDropStaleSpeech({
      expectedTransitionId: 'same',
      currentTransitionId: 'same',
      isPlaying: false,
    })).toBe(false);
  });

  it('transitionNoTtsDelayMs_preservesLegacyReadablePause', () => {
    expect(transitionNoTtsDelayMs()).toBe(3000);
  });

  it('refillNoTtsDelayMs_preservesLegacyReadablePause', () => {
    expect(refillNoTtsDelayMs()).toBe(2500);
  });
});
