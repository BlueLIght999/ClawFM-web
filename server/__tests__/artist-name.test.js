import { describe, it, expect } from 'vitest';
import { artistName } from '../domain/hosting/artistName.js';

/**
 * 特征测试 —— 钉住 claude.js getArtistStr 的现有行为。
 * 统一多种歌曲对象形态的艺人字段 → 字符串，是纯逻辑。
 * 提炼后为将来 MusicSourcePort 的 DTO 映射(斩断 ar/al/dt 透传)备好内核。
 *
 * 现有行为(claude.js:206-212)优先级：
 *   1. song.ar[] (网易云原始) → 逗号连接 name
 *   2. song.artist (字符串)
 *   3. song.artists[] → 连接 name(或元素本身)
 *   4. 空/无 → ''
 */
describe('artistName', () => {
  it('neteaseArArray_joinsNames', () => {
    expect(artistName({ ar: [{ name: '周杰伦' }, { name: '方文山' }] })).toBe('周杰伦, 方文山');
  });

  it('artistString_returnedAsIs', () => {
    expect(artistName({ artist: 'Reol' })).toBe('Reol');
  });

  it('artistsArrayOfObjects_joinsNames', () => {
    expect(artistName({ artists: [{ name: 'A' }, { name: 'B' }] })).toBe('A, B');
  });

  it('artistsArrayOfStrings_joins', () => {
    expect(artistName({ artists: ['X', 'Y'] })).toBe('X, Y');
  });

  it('arTakesPriorityOverArtist', () => {
    expect(artistName({ ar: [{ name: '优先' }], artist: '次要' })).toBe('优先');
  });

  it('nullOrEmpty_returnsEmptyString', () => {
    expect(artistName(null)).toBe('');
    expect(artistName(undefined)).toBe('');
    expect(artistName({})).toBe('');
  });
});
