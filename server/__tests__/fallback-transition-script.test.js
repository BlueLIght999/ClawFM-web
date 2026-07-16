import { describe, it, expect } from 'vitest';
import { fallbackTransitionScript } from '../domain/hosting/fallbackTransitionScript.js';

/**
 * 特征测试 —— 钉住 fallbackTransitionScript 的中文输出行为。
 * LLM 不可用时的兜底过渡词构建，是纯逻辑（R1 永不静默的降级路径）。
 *
 * 现有行为:
 *   say:   "接下来，让我们听听{nextArtist}的《{nextTitle}》。"
 *   play:  [{id, name, artist}] 或 [] (next 为空时)
 *   reason:"fallback transition"
 *   segue: "即将播放：{nextArtist}的《{nextTitle}》"
 *   缺失字段回退: name||title||'这首歌'
 */
describe('fallbackTransitionScript', () => {
  it('withNextSong_buildsSayPlayReasonSegue', () => {
    const result = fallbackTransitionScript(null, { id: '1', name: '晴天', ar: [{ name: '周杰伦' }] });
    expect(result).toEqual({
      say: '接下来，让我们听听周杰伦的《晴天》。',
      play: [{ id: '1', name: '晴天', artist: '周杰伦' }],
      reason: 'fallback transition',
      segue: '即将播放：周杰伦的《晴天》',
    });
  });

  it('noNextSong_playIsEmptyArray', () => {
    const result = fallbackTransitionScript(null, null);
    expect(result.play).toEqual([]);
    expect(result.say).toBe('接下来，让我们听听的《这首歌》。');
  });

  it('nextUsesTitleFallbackWhenNoName', () => {
    const result = fallbackTransitionScript(null, { id: '2', title: 'Night', artist: 'Reol' });
    expect(result.say).toBe('接下来，让我们听听Reol的《Night》。');
    expect(result.segue).toBe('即将播放：Reol的《Night》');
  });
});
