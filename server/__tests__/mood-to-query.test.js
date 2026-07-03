import { describe, it, expect } from 'vitest';
import { moodToQuery } from '../domain/routing/moodToQuery.js';

/**
 * 特征测试 —— 钉住 router.js play_mood 的 moodMap 映射行为。
 * mood 关键词 → 中文搜索词；未知 mood 回退到原 mood，空则 '热门'。
 * 提炼纯查表逻辑，移出 routeIntent 的 switch，降复杂度。
 *
 * 现有行为(router.js play_mood case):
 *   moodKey = (params.mood || 'chill').toLowerCase()
 *   query = moodMap[moodKey] || params.mood || '热门'
 */
describe('moodToQuery', () => {
  it('knownMood_mapsToChineseQuery', () => {
    expect(moodToQuery('happy')).toBe('欢快 流行');
    expect(moodToQuery('sad')).toBe('伤感 情歌');
    expect(moodToQuery('focus')).toBe('学习 专注 钢琴');
  });

  it('caseInsensitive', () => {
    expect(moodToQuery('HAPPY')).toBe('欢快 流行');
  });

  it('unknownMood_fallsBackToMoodItself', () => {
    expect(moodToQuery('王菲')).toBe('王菲');
  });

  it('emptyMood_defaultsToChillMapping', () => {
    // (undefined||'chill') → moodMap['chill'] = '轻音乐 放松'
    expect(moodToQuery(undefined)).toBe('轻音乐 放松');
    expect(moodToQuery('')).toBe('轻音乐 放松');
  });
});
