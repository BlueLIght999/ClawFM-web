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

  // --- New regex patterns ---

  it('replay_matchesRepeatAndReplay', () => {
    expect(matchFastRoute('重复').action).toBe('replay');
    expect(matchFastRoute('再放一遍').action).toBe('replay');
    expect(matchFastRoute('repeat').action).toBe('replay');
  });

  it('greeting_matchesCommonGreetings', () => {
    expect(matchFastRoute('你好')).toEqual({ route: 'claude', action: 'chat', params: { subtype: 'greeting' } });
    expect(matchFastRoute('早上好').params.subtype).toBe('greeting');
    expect(matchFastRoute('hi').params.subtype).toBe('greeting');
    expect(matchFastRoute('晚安').params.subtype).toBe('greeting');
  });

  it('greeting_doesNotMatchWithSuffix', () => {
    expect(matchFastRoute('你好啊')).toBeNull();
    expect(matchFastRoute('早安呀')).toBeNull();
  });

  it('thanks_matchesCommonThanks', () => {
    expect(matchFastRoute('谢谢')).toEqual({ route: 'claude', action: 'chat', params: { subtype: 'thanks' } });
    expect(matchFastRoute('好听').params.subtype).toBe('thanks');
    expect(matchFastRoute('thanks').params.subtype).toBe('thanks');
  });

  it('identity_matchesIdentityQuestions', () => {
    expect(matchFastRoute('你是谁')).toEqual({ route: 'claude', action: 'chat', params: { subtype: 'identity' } });
    expect(matchFastRoute('你能做什么').params.subtype).toBe('identity');
  });

  it('mood_happy_matchesHappyKeywords', () => {
    expect(matchFastRoute('我开心')).toEqual({ route: 'hybrid', action: 'play_mood', params: { mood: 'happy' } });
    expect(matchFastRoute('来点欢快的').params.mood).toBe('happy');
  });

  it('mood_sad_matchesSadKeywords', () => {
    expect(matchFastRoute('心情不好').params.mood).toBe('sad');
    expect(matchFastRoute('emo').params.mood).toBe('sad');
  });

  it('mood_chill_matchesChillKeywords', () => {
    expect(matchFastRoute('放松一下').params.mood).toBe('chill');
    expect(matchFastRoute('chill').params.mood).toBe('chill');
  });

  it('mood_energetic_matchesEnergeticKeywords', () => {
    expect(matchFastRoute('来点嗨的').params.mood).toBe('energetic');
    expect(matchFastRoute('燃').params.mood).toBe('energetic');
  });

  it('mood_focus_matchesFocusKeywords', () => {
    expect(matchFastRoute('来点适合学习的').params.mood).toBe('focus');
    expect(matchFastRoute('写代码').params.mood).toBe('focus');
  });

  it('mood_romantic_matchesRomanticKeywords', () => {
    expect(matchFastRoute('来点浪漫的').params.mood).toBe('romantic');
  });

  it('mood_nostalgic_matchesNostalgicKeywords', () => {
    expect(matchFastRoute('来点老歌').params.mood).toBe('nostalgic');
    expect(matchFastRoute('怀旧').params.mood).toBe('nostalgic');
  });

  it('rejectPriority_stillWorks', () => {
    // "换一批" should still match reject_recommend, not recommend_retry
    expect(matchFastRoute('换一批').action).toBe('reject_recommend');
  });
});
