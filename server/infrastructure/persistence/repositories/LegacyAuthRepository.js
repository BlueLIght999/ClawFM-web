import { getStoredCookie, saveCookie } from '../../../utils/cookie-store.js';
import { queryOne } from '../../../db/schema.js';

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
    /**
     * 当前登录网易云 uid（来自 netease_auth 表，saveCookie 时写入）。
     * 供社区鉴权中间件校验"当前登录态"与请求的 userId 一致。
     * @returns {string} uid，未登录返回空串
     */
    currentUid() {
      const row = queryOne('SELECT user_id FROM netease_auth WHERE id = 1');
      return row?.user_id || '';
    },
    saveSession(cookie, profile = {}) {
      legacy.saveCookie(cookie || '', profile || {});
    },
  };
}

export const legacyAuthRepository = createLegacyAuthRepository();
