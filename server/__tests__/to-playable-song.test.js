import { describe, it, expect } from 'vitest';
import { toPlayableSong } from '../domain/curation/toPlayableSong.js';

/**
 * 特征/契约测试 —— toPlayableSong: 向后兼容的 song 输出形态(方案B)。
 * 在 toSongDTO 稳定字段(title/artist/album/durationMs/coverUrl)基础上，
 * 兼带旧的网易云字段(name/ar/al/dt/id)，使旧前端(读 song.name/ar)不改仍可用，
 * 同时提供新前端可迁移的稳定字段(API-CONTRACT 只增不删/向后兼容)。
 */
describe('toPlayableSong', () => {
  it('mergesStableDTOFieldsWithLegacyFields', () => {
    const raw = {
      id: 186016,
      name: '晴天',
      ar: [{ name: '周杰伦' }],
      al: { name: '叶惠美', picUrl: 'http://p/cover.jpg' },
      dt: 269000,
    };
    const out = toPlayableSong(raw);
    // 稳定 DTO 字段
    expect(out.title).toBe('晴天');
    expect(out.artist).toBe('周杰伦');
    expect(out.album).toBe('叶惠美');
    expect(out.durationMs).toBe(269000);
    expect(out.coverUrl).toBe('http://p/cover.jpg');
    // 兼容旧字段（前端不改仍能读）
    expect(out.name).toBe('晴天');
    expect(out.ar).toEqual([{ name: '周杰伦' }]);
    expect(out.dt).toBe(269000);
  });

  it('nullSong_returnsNull', () => {
    expect(toPlayableSong(null)).toBeNull();
    expect(toPlayableSong(undefined)).toBeNull();
  });

  it('preservesUnknownLegacyFields', () => {
    const raw = { id: 1, name: 'x', customField: 'keep-me' };
    const out = toPlayableSong(raw);
    expect(out.customField).toBe('keep-me');
    expect(out.title).toBe('x');
  });
});
