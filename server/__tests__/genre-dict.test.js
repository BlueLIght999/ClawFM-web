import { describe, it, expect } from 'vitest';
import { matchGenre, getGenreEntry, allGenreKeywords } from '../domain/routing/genreDict.js';

/**
 * 特征测试 —— 钉住 genreDict 风格词典匹配行为。
 * genreDict 替代 isGenreQuery 的平面关键词列表，
 * 支持别名匹配、种子歌手、歌单搜索词、网易云风格ID。
 */
describe('genreDict', () => {
  describe('matchGenre', () => {
    it('exactMatch_jpop', () => {
      const result = matchGenre('jpop');
      expect(result).not.toBeNull();
      expect(result.key).toBe('jpop');
      expect(result.matchScore).toBe(1.0);
    });

    it('aliasMatch_jPop_hyphen', () => {
      const result = matchGenre('j-pop');
      expect(result).not.toBeNull();
      expect(result.key).toBe('jpop');
      expect(result.matchScore).toBe(0.9);
    });

    it('aliasMatch_chinese_japanesePop', () => {
      const result = matchGenre('日流');
      expect(result).not.toBeNull();
      expect(result.key).toBe('jpop');
    });

    it('exactMatch_kpop', () => {
      const result = matchGenre('kpop');
      expect(result).not.toBeNull();
      expect(result.key).toBe('kpop');
      expect(result.entry.seedArtists).toContain('BTS');
    });

    it('exactMatch_citypop', () => {
      const result = matchGenre('citypop');
      expect(result).not.toBeNull();
      expect(result.key).toBe('citypop');
      expect(result.entry.seedArtists.length).toBeGreaterThan(0);
    });

    it('partialMatch_lofi', () => {
      const result = matchGenre('来点lo-fi');
      expect(result).not.toBeNull();
      expect(result.key).toBe('lofi');
    });

    it('partialMatch_jazz', () => {
      const result = matchGenre('来点爵士');
      expect(result).not.toBeNull();
      expect(result.key).toBe('jazz');
    });

    it('noMatch_artistName', () => {
      expect(matchGenre('周杰伦')).toBeNull();
      expect(matchGenre('YOASOBI')).toBeNull();
    });

    it('noMatch_empty', () => {
      expect(matchGenre('')).toBeNull();
      expect(matchGenre('   ')).toBeNull();
    });

    it('caseInsensitive', () => {
      expect(matchGenre('JPOP').key).toBe('jpop');
      expect(matchGenre('JPop').key).toBe('jpop');
      expect(matchGenre('LOFI').key).toBe('lofi');
    });

    it('entryHasRequiredFields', () => {
      const result = matchGenre('jpop');
      expect(result.entry.playlistQuery).toBeTruthy();
      expect(result.entry.seedArtists).toBeInstanceOf(Array);
      expect(result.entry.seedArtists.length).toBeGreaterThan(0);
      expect(result.entry.enhancedQuery).toBeTruthy();
    });

    it('synthwave_hasSeedArtists', () => {
      const result = matchGenre('synthwave');
      expect(result).not.toBeNull();
      expect(result.entry.seedArtists.length).toBeGreaterThan(0);
    });
  });

  describe('getGenreEntry', () => {
    it('returnsEntry_byKey', () => {
      const entry = getGenreEntry('jpop');
      expect(entry).not.toBeNull();
      expect(entry.playlistQuery).toBeTruthy();
    });

    it('returnsNull_unknown', () => {
      expect(getGenreEntry('nonexistent')).toBeNull();
    });
  });

  describe('allGenreKeywords', () => {
    it('includes_jpop_kpop', () => {
      const keywords = allGenreKeywords();
      expect(keywords).toContain('jpop');
      expect(keywords).toContain('kpop');
      expect(keywords).toContain('爵士');
      expect(keywords).toContain('jazz');
    });

    it('isNotEmpty', () => {
      expect(allGenreKeywords().length).toBeGreaterThan(20);
    });
  });
});
