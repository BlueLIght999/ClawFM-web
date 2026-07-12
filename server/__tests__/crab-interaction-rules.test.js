import { describe, it, expect } from 'vitest';
import {
  crabAnimationForInteraction,
  crabIdleResetForInteraction,
  isCrabSkipInteraction,
} from '../domain/hosting/crabInteractionRules.js';

describe('crab interaction rules', () => {
  it('isCrabSkipInteraction_skip_returnsTrue', () => {
    expect(isCrabSkipInteraction('skip')).toBe(true);
    expect(isCrabSkipInteraction('chat')).toBe(false);
  });

  it('crabAnimationForInteraction_chat_returnsTalkingAnimation', () => {
    expect(crabAnimationForInteraction('chat')).toEqual({ state: 'talking' });
  });

  it('crabAnimationForInteraction_boopAndUnknown_returnBouncingAnimation', () => {
    expect(crabAnimationForInteraction('boop')).toEqual({ state: 'bouncing' });
    expect(crabAnimationForInteraction('surprise')).toEqual({ state: 'bouncing' });
  });

  it('crabAnimationForInteraction_skip_returnsNull', () => {
    expect(crabAnimationForInteraction('skip')).toBeNull();
  });

  it('crabIdleResetForInteraction_boop_returnsDelayedIdleAnimation', () => {
    expect(crabIdleResetForInteraction('boop')).toEqual({
      delayMs: 2000,
      animation: { state: 'idle' },
    });
  });

  it('crabIdleResetForInteraction_nonBoop_returnsNull', () => {
    expect(crabIdleResetForInteraction('chat')).toBeNull();
    expect(crabIdleResetForInteraction('surprise')).toBeNull();
  });
});
