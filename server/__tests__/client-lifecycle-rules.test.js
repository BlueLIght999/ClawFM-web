import { describe, it, expect } from 'vitest';
import { shouldStopMusicForNextSession } from '../domain/playback/clientLifecycleRules.js';

describe('client lifecycle rules', () => {
  it('shouldStopMusic_zeroClients_returnsTrue', () => {
    expect(shouldStopMusicForNextSession(0)).toBe(true);
  });

  it('shouldStopMusic_oneClient_returnsFalse', () => {
    expect(shouldStopMusicForNextSession(1)).toBe(false);
  });

  it('shouldStopMusic_negativeClients_returnsTrue', () => {
    expect(shouldStopMusicForNextSession(-1)).toBe(true);
  });
});
