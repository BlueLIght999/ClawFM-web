import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  getCookie,
  setAuthRepository,
  setCookie,
} from '../infrastructure/netease/neteaseApi.js';
import { legacyAuthRepository } from '../infrastructure/persistence/repositories/LegacyAuthRepository.js';

describe('netease auth repository seam', () => {
  afterEach(() => {
    setAuthRepository(legacyAuthRepository);
  });

  it('getCookie_readsFromInjectedAuthRepositoryWhenCacheIsEmpty', () => {
    const auth = {
      currentCookie: vi.fn(() => 'MUSIC_U=injected'),
      saveSession: vi.fn(),
    };

    setAuthRepository(auth);

    expect(getCookie()).toBe('MUSIC_U=injected');
    expect(auth.currentCookie).toHaveBeenCalledOnce();
  });

  it('setCookie_savesThroughInjectedAuthRepository', () => {
    const auth = {
      currentCookie: vi.fn(() => ''),
      saveSession: vi.fn(),
    };

    setAuthRepository(auth);
    setCookie('MUSIC_U=new');

    expect(auth.saveSession).toHaveBeenCalledWith('MUSIC_U=new');
  });
});
