import { describe, it, expect } from 'vitest';
import { fallbackTransitionScript } from '../domain/hosting/fallbackTransitionScript.js';

/**
 * 特征测试 —— 钉住 claude.js fallbackTransition 的现有行为。
 * LLM 不可用时的兜底过渡词构建，是纯逻辑（R1 永不静默的降级路径）。
 *
 * 现有行为(claude.js:195-204):
 *   say:   "And now, {nextTitle} by {nextArtist}."
 *   play:  [{id, name, artist}] 或 [] (next 为空时)
 *   reason:"fallback transition"
 *   segue: "Coming up: {nextTitle}"
 *   缺失字段回退: name||title||'this track'
 */
describe('fallbackTransitionScript', () => {
  it('withNextSong_buildsSayPlayReasonSegue', () => {
    const result = fallbackTransitionScript(null, { id: '1', name: '晴天', ar: [{ name: '周杰伦' }] });
    expect(result).toEqual({
      say: 'And now, 晴天 by 周杰伦.',
      play: [{ id: '1', name: '晴天', artist: '周杰伦' }],
      reason: 'fallback transition',
      segue: 'Coming up: 晴天',
    });
  });

  it('noNextSong_playIsEmptyArray', () => {
    const result = fallbackTransitionScript(null, null);
    expect(result.play).toEqual([]);
    expect(result.say).toBe('And now, this track by .');
  });

  it('nextUsesTitleFallbackWhenNoName', () => {
    const result = fallbackTransitionScript(null, { id: '2', title: 'Night', artist: 'Reol' });
    expect(result.say).toBe('And now, Night by Reol.');
    expect(result.segue).toBe('Coming up: Night');
  });
});
