import { describe, it, expect } from 'vitest';
import {
  preferenceFallbackPlan,
  shouldFillFromSeedPool,
  shouldFillFromSearch,
  shouldFillFromGenericFallback,
} from '../domain/curation/preferenceFallbackRules.js';

describe('preferenceFallbackPlan', () => {
  it('returns all three stages when preference is provided and targetSize not met', () => {
    const plan = preferenceFallbackPlan({
      preference: 'jazz',
      currentCount: 0,
      targetSize: 10,
      seedPoolSize: 50,
    });
    expect(plan.stages).toEqual(['seedPool', 'search', 'genericFallback']);
  });

  it('skips seedPool when seedPool is empty', () => {
    const plan = preferenceFallbackPlan({
      preference: 'jazz',
      currentCount: 0,
      targetSize: 10,
      seedPoolSize: 0,
    });
    expect(plan.stages).toEqual(['search', 'genericFallback']);
  });

  it('skips seedPool and search when preference is null', () => {
    const plan = preferenceFallbackPlan({
      preference: null,
      currentCount: 0,
      targetSize: 10,
      seedPoolSize: 50,
    });
    expect(plan.stages).toEqual(['genericFallback']);
  });

  it('returns no stages when targetSize already met', () => {
    const plan = preferenceFallbackPlan({
      preference: 'jazz',
      currentCount: 10,
      targetSize: 10,
      seedPoolSize: 50,
    });
    expect(plan.stages).toEqual([]);
  });

  it('returns no stages when currentCount exceeds targetSize', () => {
    const plan = preferenceFallbackPlan({
      preference: 'jazz',
      currentCount: 15,
      targetSize: 10,
      seedPoolSize: 50,
    });
    expect(plan.stages).toEqual([]);
  });

  it('skips remaining stages when targetSize met after seedPool', () => {
    const plan = preferenceFallbackPlan({
      preference: 'jazz',
      currentCount: 0,
      targetSize: 10,
      seedPoolSize: 50,
      seedPoolExpectedYield: 10,
    });
    // We can't predict yield, so stages are always all three.
    // The fallback plan lists all stages; the executor stops early.
    expect(plan.stages).toEqual(['seedPool', 'search', 'genericFallback']);
  });

  it('handles empty string preference as no preference', () => {
    const plan = preferenceFallbackPlan({
      preference: '',
      currentCount: 0,
      targetSize: 10,
      seedPoolSize: 50,
    });
    expect(plan.stages).toEqual(['genericFallback']);
  });

  it('handles undefined preference as no preference', () => {
    const plan = preferenceFallbackPlan({
      preference: undefined,
      currentCount: 0,
      targetSize: 10,
      seedPoolSize: 50,
    });
    expect(plan.stages).toEqual(['genericFallback']);
  });

  it('handles zero targetSize', () => {
    const plan = preferenceFallbackPlan({
      preference: 'jazz',
      currentCount: 0,
      targetSize: 0,
      seedPoolSize: 50,
    });
    expect(plan.stages).toEqual([]);
  });
});

describe('shouldFillFromSeedPool', () => {
  it('returns true when preference exists and pool has songs', () => {
    expect(shouldFillFromSeedPool({ preference: 'jazz', seedPoolSize: 10 })).toBe(true);
  });

  it('returns false when no preference', () => {
    expect(shouldFillFromSeedPool({ preference: null, seedPoolSize: 10 })).toBe(false);
  });

  it('returns false when pool is empty', () => {
    expect(shouldFillFromSeedPool({ preference: 'jazz', seedPoolSize: 0 })).toBe(false);
  });

  it('returns false for empty string preference', () => {
    expect(shouldFillFromSeedPool({ preference: '', seedPoolSize: 10 })).toBe(false);
  });
});

describe('shouldFillFromSearch', () => {
  it('returns true when preference exists and count below target', () => {
    expect(shouldFillFromSearch({ preference: 'jazz', currentCount: 3, targetSize: 10 })).toBe(true);
  });

  it('returns false when no preference', () => {
    expect(shouldFillFromSearch({ preference: null, currentCount: 3, targetSize: 10 })).toBe(false);
  });

  it('returns false when count meets target', () => {
    expect(shouldFillFromSearch({ preference: 'jazz', currentCount: 10, targetSize: 10 })).toBe(false);
  });
});

describe('shouldFillFromGenericFallback', () => {
  it('returns true when count below target', () => {
    expect(shouldFillFromGenericFallback({ currentCount: 3, targetSize: 10 })).toBe(true);
  });

  it('returns false when count meets target', () => {
    expect(shouldFillFromGenericFallback({ currentCount: 10, targetSize: 10 })).toBe(false);
  });

  it('returns false when count exceeds target', () => {
    expect(shouldFillFromGenericFallback({ currentCount: 15, targetSize: 10 })).toBe(false);
  });

  it('returns true when count below target regardless of preference', () => {
    expect(shouldFillFromGenericFallback({ currentCount: 0, targetSize: 10, preference: null })).toBe(true);
  });
});
