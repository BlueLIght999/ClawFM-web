import { describe, it, expect } from 'vitest';
import {
  estimatedSpeechDurationSeconds,
  refillNoTtsDelayMs,
  shouldDropStaleSpeech,
  transitionNoTtsDelayMs,
} from '../domain/hosting/djSpeechRules.js';

describe('DJ speech rules', () => {
  it('estimatedSpeechDurationSeconds_usesFifteenCharsPerSecond', () => {
    expect(estimatedSpeechDurationSeconds('123456789012345')).toBe(1);
    expect(estimatedSpeechDurationSeconds('')).toBe(0);
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
