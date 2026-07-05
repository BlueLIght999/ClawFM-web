import { describe, it, expect, vi } from 'vitest';
import { createLegacyAuthRepository } from '../infrastructure/persistence/repositories/LegacyAuthRepository.js';

describe('AuthRepository adapter', () => {
  it('currentCookie_whenLegacyEmpty_returnsEmptyString', () => {
    const repo = createLegacyAuthRepository({
      getStoredCookie: () => null,
      saveCookie: vi.fn(),
    });

    expect(repo.currentCookie()).toBe('');
  });

  it('saveSession_delegatesCookieAndCamelCaseProfile', () => {
    const saveCookie = vi.fn();
    const repo = createLegacyAuthRepository({
      getStoredCookie: () => '',
      saveCookie,
    });

    repo.saveSession('MUSIC_U=abc', {
      userId: '42',
      nickname: 'Listener',
      avatarUrl: 'https://example.test/avatar.jpg',
    });

    expect(saveCookie).toHaveBeenCalledWith('MUSIC_U=abc', {
      userId: '42',
      nickname: 'Listener',
      avatarUrl: 'https://example.test/avatar.jpg',
    });
  });
});
