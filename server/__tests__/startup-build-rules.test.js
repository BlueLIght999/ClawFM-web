import { describe, expect, it } from 'vitest';
import { shouldBuildClient } from '../../bin/startup/buildRules.js';

describe('shouldBuildClient', () => {
  it('shouldBuildClient_whenDistMissing_returnsTrue', () => {
    expect(shouldBuildClient({
      distExists: false,
      currentFingerprint: 'a',
      previousFingerprint: 'a',
    })).toBe(true);
  });

  it('shouldBuildClient_whenFingerprintChanged_returnsTrue', () => {
    expect(shouldBuildClient({
      distExists: true,
      currentFingerprint: 'new',
      previousFingerprint: 'old',
    })).toBe(true);
  });

  it('shouldBuildClient_whenFingerprintMatches_returnsFalse', () => {
    expect(shouldBuildClient({
      distExists: true,
      currentFingerprint: 'same',
      previousFingerprint: 'same',
    })).toBe(false);
  });

  it('shouldBuildClient_whenForced_returnsTrue', () => {
    expect(shouldBuildClient({
      forceBuild: true,
      distExists: true,
      currentFingerprint: 'same',
      previousFingerprint: 'same',
    })).toBe(true);
  });
});
