import { describe, it, expect } from 'vitest';
import { pickStartSong } from '../domain/routing/pickStartSong.js';

/**
 * 特征测试 —— 钉住 router.js play_artist 的 startSong 排序纯逻辑。
 * 用户指定起始歌名时，把标题包含该名的歌移到列表首位；找不到则原序。
 * 提炼纯逻辑（大小写不敏感的 find + filter/unshift），IO(searchSongs)留在 case。
 *
 * 现有行为(router.js play_artist):
 *   bestMatch = songs.find(标题(name||title)含 startSong, 忽略大小写)
 *   若找到: songs.filter(去掉它).unshift(它) —— 移到首位
 */
describe('pickStartSong', () => {
  const songs = [
    { id: 1, name: '稻香' },
    { id: 2, name: '晴天' },
    { id: 3, name: '七里香' },
  ];

  it('matchByName_movesToFront', () => {
    const out = pickStartSong(songs, '晴天');
    expect(out[0].id).toBe(2);
    expect(out.map(s => s.id)).toEqual([2, 1, 3]);
  });

  it('caseInsensitiveMatch', () => {
    const en = [{ id: 1, name: 'Hello' }, { id: 2, name: 'World' }];
    expect(pickStartSong(en, 'world')[0].id).toBe(2);
  });

  it('noMatch_keepsOriginalOrder', () => {
    const out = pickStartSong(songs, '不存在的歌');
    expect(out.map(s => s.id)).toEqual([1, 2, 3]);
  });

  it('emptyStartSong_keepsOriginalOrder', () => {
    expect(pickStartSong(songs, '').map(s => s.id)).toEqual([1, 2, 3]);
  });

  it('emptySongs_returnsEmpty', () => {
    expect(pickStartSong([], '晴天')).toEqual([]);
  });

  it('titleFallbackField', () => {
    const withTitle = [{ id: 1, title: 'A' }, { id: 2, title: 'B' }];
    expect(pickStartSong(withTitle, 'b')[0].id).toBe(2);
  });
});
