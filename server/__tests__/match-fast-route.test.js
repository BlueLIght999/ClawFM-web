import { describe, it, expect } from 'vitest';
import { matchFastRoute } from '../domain/routing/matchFastRoute.js';

/**
 * 特征测试 —— 钉住 router.js fastRoutes 匹配行为。
 * 提炼 13 个正则的快速路由匹配循环为纯函数，返回首个匹配的
 * {route, action, params} 或 null。移出 routeIntent 主体的一大块分支，
 * 降其复杂度(52)。
 *
 * 关键不变量: reject 必须先于 recommend 匹配（优先级，R6 相关）。
 */
describe('matchFastRoute', () => {
  it('skip_matchesNcmSkip', () => {
    expect(matchFastRoute('切歌')).toEqual({ route: 'ncm', action: 'skip', params: {} });
    expect(matchFastRoute('skip')).toEqual({ route: 'ncm', action: 'skip', params: {} });
  });

  it('pause_matchesNcmPause', () => {
    expect(matchFastRoute('暂停').action).toBe('pause');
  });

  it('reject_matchesBeforeRecommend', () => {
    // "换一批" 同时出现在 reject 和 retry 模式；reject 在前须优先
    expect(matchFastRoute('不好听').action).toBe('reject_recommend');
    expect(matchFastRoute('不喜欢').action).toBe('reject_recommend');
  });

  it('personalized_recommend', () => {
    expect(matchFastRoute('推荐').action).toBe('play_personalized');
    expect(matchFastRoute('有什么好听的').action).toBe('play_personalized');
  });

  it('planRefresh', () => {
    expect(matchFastRoute('换个风格').action).toBe('plan_refresh');
  });

  it('noMatch_returnsNull', () => {
    expect(matchFastRoute('周杰伦的晴天')).toBeNull();
    expect(matchFastRoute('')).toBeNull();
  });
});
