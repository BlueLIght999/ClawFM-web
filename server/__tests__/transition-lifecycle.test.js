import { describe, it, expect } from 'vitest';
import {
  beginTransitionIfIdle,
  shouldHonorTransition,
  transitionSpeechPlan,
} from '../domain/playback/transitionLifecycle.js';

function playhead(overrides = {}) {
  return {
    currentSong: { id: 'current', title: 'Current' },
    _advancing: false,
    ...overrides,
  };
}

describe('transition lifecycle rules', () => {
  it('beginTransitionIfIdle_whenAlreadyAdvancing_ignoresDuplicateTransition', () => {
    const current = playhead({ _advancing: true });

    const result = beginTransitionIfIdle(current, 7);

    expect(result).toEqual({
      shouldStart: false,
      transitionId: 7,
      playhead: current,
    });
  });

  it('beginTransitionIfIdle_whenIdle_marksPlayheadAdvancing', () => {
    const current = playhead();

    const result = beginTransitionIfIdle(current, 7);

    expect(result).toEqual({
      shouldStart: true,
      transitionId: 7,
      playhead: {
        ...current,
        _advancing: true,
      },
    });
    expect(current._advancing).toBe(false);
  });

  it('transitionSpeechPlan_withNextSong_usesNormalSpeechTimeout', () => {
    const nextSong = { id: 'next', title: 'Next' };

    expect(transitionSpeechPlan(nextSong)).toEqual({
      kind: 'normal',
      nextSong,
      generationTimeoutMs: 15000,
    });
  });

  it('transitionSpeechPlan_withoutNextSong_usesRefillSpeechTimeout', () => {
    expect(transitionSpeechPlan(null)).toEqual({
      kind: 'refill',
      nextSong: null,
      generationTimeoutMs: 60000,
    });
  });

  it('shouldHonorTransition_onlyAllowsCurrentTransitionId', () => {
    expect(shouldHonorTransition({
      currentTransitionId: 4,
      expectedTransitionId: 4,
    })).toBe(true);
    expect(shouldHonorTransition({
      currentTransitionId: 5,
      expectedTransitionId: 4,
    })).toBe(false);
  });
});
