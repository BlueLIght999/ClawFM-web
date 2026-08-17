import fs from 'fs';
import { dirname } from 'path';
import { queryOne, execute } from '../db/schema.js';
import config from '../config.js';

export function loadCookie() {
  try {
    if (fs.existsSync(config.netease.cookieFile)) {
      const data = JSON.parse(fs.readFileSync(config.netease.cookieFile, 'utf-8'));
      return data.cookie || '';
    }
  } catch { /* ignore */ }

  return queryOne('SELECT cookie FROM netease_auth WHERE id = 1')?.cookie || '';
}

export function saveCookie(cookie, profile = {}) {
  const dir = dirname(config.netease.cookieFile);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(config.netease.cookieFile, JSON.stringify({ cookie, updatedAt: new Date().toISOString() }));

  // COALESCE(NULLIF(..., ''), existing) 保留旧值：profile 字段为空时不覆盖已有 user_id/nickname/avatar_url
  execute(
    `INSERT INTO netease_auth (id, cookie, user_id, nickname, avatar_url, updated_at)
     VALUES (1, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(id) DO UPDATE SET
       cookie=excluded.cookie,
       user_id=COALESCE(NULLIF(excluded.user_id, ''), netease_auth.user_id),
       nickname=COALESCE(NULLIF(excluded.nickname, ''), netease_auth.nickname),
       avatar_url=COALESCE(NULLIF(excluded.avatar_url, ''), netease_auth.avatar_url),
       updated_at=CURRENT_TIMESTAMP`,
    [cookie || '', profile.userId || '', profile.nickname || '', profile.avatarUrl || '']
  );
}

export function getStoredCookie() {
  return loadCookie();
}
