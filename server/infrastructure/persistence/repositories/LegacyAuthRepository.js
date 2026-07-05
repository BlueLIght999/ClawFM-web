import { getStoredCookie, saveCookie } from '../../../utils/cookie-store.js';

/**
 * Wraps legacy cookie-store helpers behind AuthRepository.
 *
 * @param {{getStoredCookie: () => string|null, saveCookie: (cookie: string, profile?: object) => void}=} legacy
 */
export function createLegacyAuthRepository(legacy = {
  getStoredCookie,
  saveCookie,
}) {
  return {
    currentCookie() {
      return legacy.getStoredCookie() || '';
    },
    saveSession(cookie, profile = {}) {
      legacy.saveCookie(cookie || '', profile || {});
    },
  };
}

export const legacyAuthRepository = createLegacyAuthRepository();
