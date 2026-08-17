import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';

vi.mock('../config.js', () => ({
  default: { netease: { cookieFile: 'C:/data/cookies.json' } },
}));

// 捕获 execute 调用，验证 SQL 契约与参数透传（不真正建库）
let capturedSql = null;
let capturedParams = null;
const executeMock = (sql, params = []) => { capturedSql = sql; capturedParams = params; };

vi.mock('../db/schema.js', () => ({
  execute: (...args) => executeMock(...args),
  queryOne: vi.fn(() => null),
}));

// fs 桩：不触碰真实 cookie 文件
vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
vi.spyOn(fs, 'existsSync').mockReturnValue(true);
vi.spyOn(fs, 'mkdirSync').mockImplementation(() => {});

const { saveCookie } = await import('../utils/cookie-store.js');

describe('cookie-store — COALESCE/NULLIF preserves existing profile fields on empty (regression)', () => {
  beforeEach(() => { capturedSql = null; capturedParams = null; });

  it('emits COALESCE/NULLIF guards for user_id/nickname/avatar_url', () => {
    saveCookie('new-cookie');
    expect(capturedSql).toContain("COALESCE(NULLIF(excluded.user_id, ''), netease_auth.user_id)");
    expect(capturedSql).toContain("COALESCE(NULLIF(excluded.nickname, ''), netease_auth.nickname)");
    expect(capturedSql).toContain("COALESCE(NULLIF(excluded.avatar_url, ''), netease_auth.avatar_url)");
  });

  it('passes empty strings when profile fields are empty (NULLIF keeps old value)', () => {
    saveCookie('c', { userId: '', nickname: '', avatarUrl: '' });
    expect(capturedParams).toEqual(['c', '', '', '']);
  });

  it('passes meaningful values when profile is provided', () => {
    saveCookie('c', { userId: '7', nickname: '阿七', avatarUrl: 'http://a' });
    expect(capturedParams).toEqual(['c', '7', '阿七', 'http://a']);
  });
});