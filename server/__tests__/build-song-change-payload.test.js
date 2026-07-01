import { describe, it, expect } from 'vitest';
import { buildSongChangePayload } from '../domain/curation/buildSongChangePayload.js';

/**
 * 特征/契约测试 —— SONG_CHANGE 事件 payload 构建。
 * 内部用 toPlayableSong 规范化 song，使 SONG_CHANGE（第二条 song 路径，
 * 独立于 getState/RADIO_STATE）也带稳定 DTO 字段 + 兼容旧字段(方案B)。
 * 让"SONG_CHANGE 发规范化 song"成为被测保证。
 */
describe('buildSongChangePayload', () => {
  it('normalizesSong_withStableAndLegacyFields', () => {
    const payload = buildSongChangePayload(
      { id: 186016, name: '晴天', ar: [{ name: '周杰伦' }], dt: 269000 },
      1730000000000,
      '/audio/x.mp3'
    );
    // 稳定 DTO 字段
    expect(payload.song.title).toBe('晴天');
    expect(payload.song.artist).toBe('周杰伦');
    // 兼容旧字段
    expect(payload.song.name).toBe('晴天');
    // 其余 payload 字段透传
    expect(payload.startedAt).toBe(1730000000000);
    expect(payload.audioUrl).toBe('/audio/x.mp3');
  });

  it('nullSong_yieldsNullSongInPayload', () => {
    const payload = buildSongChangePayload(null, 123, null);
    expect(payload.song).toBeNull();
    expect(payload.startedAt).toBe(123);
    expect(payload.audioUrl).toBeNull();
  });
});
