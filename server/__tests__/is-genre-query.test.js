import { describe, it, expect } from 'vitest';
import { isGenreQuery } from '../domain/routing/isGenreQuery.js';

/**
 * 特征测试 —— 钉住 router.js hasGenreKeyword 行为。
 * 判断文本是否含流派/乐器/风格关键词（中英，大小写不敏感）。
 * 提炼到 domain/routing，移出 routeIntent 的内联 GENRE_KEYWORDS + 函数，
 * 降 routeIntent 复杂度(52)。
 */
describe('isGenreQuery', () => {
  it('chineseGenre_matches', () => {
    expect(isGenreQuery('来点爵士')).toBe(true);
    expect(isGenreQuery('钢琴曲')).toBe(true);
    expect(isGenreQuery('二胡')).toBe(true);
  });

  it('englishGenre_caseInsensitive', () => {
    expect(isGenreQuery('some JAZZ please')).toBe(true);
    expect(isGenreQuery('Lo-Fi beats')).toBe(true);
  });

  it('nonGenreText_noMatch', () => {
    expect(isGenreQuery('周杰伦')).toBe(false);
    expect(isGenreQuery('晴天')).toBe(false);
  });

  it('emptyString_noMatch', () => {
    expect(isGenreQuery('')).toBe(false);
  });
});
