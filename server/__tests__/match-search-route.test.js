import { describe, it, expect } from 'vitest';
import { matchSearchRoute } from '../domain/routing/matchSearchRoute.js';

/**
 * F1: matchSearchRoute — extracted from router.js:62 searchMatch regex.
 * Pure function (no IO) so preFlightCheck can detect search intents without
 * triggering music.search. The full routing (music.search, genre detection,
 * filterLiveVersions) is still done by AgentTurnService → intentRouter.route().
 *
 * Note: matchSearchRoute is a regex extractor only. It does NOT need to avoid
 * matching FAST_ROUTES words — preFlightCheck runs matchFastRoute FIRST, so
 * "播放" (resume) is captured before matchSearchRoute is ever consulted.
 */
describe('matchSearchRoute', () => {
  it('matchesChineseNoSpace_playPrefix', () => {
    expect(matchSearchRoute('播周杰伦')).toEqual({ query: '周杰伦' });
    expect(matchSearchRoute('放晴天')).toEqual({ query: '晴天' });
  });

  it('matchesChineseNoSpace_laiDianPrefix', () => {
    expect(matchSearchRoute('来点爵士')).toEqual({ query: '爵士' });
    expect(matchSearchRoute('来一首夜曲')).toEqual({ query: '夜曲' });
  });

  it('matchesChineseNoSpace_woXiangTing', () => {
    expect(matchSearchRoute('我想听晴天')).toEqual({ query: '晴天' });
  });

  it('matchesEnglish_play', () => {
    expect(matchSearchRoute('play jay chou')).toEqual({ query: 'jay chou' });
  });

  it('matchesWithSpace_backwardCompat', () => {
    expect(matchSearchRoute('放 爵士')).toEqual({ query: '爵士' });
  });

  it('matchesBoFang_asQueryFang_dueToRegexPrefixBo', () => {
    // "播放" alone matches the "播" prefix with query="放".
    // This is the regex's real behavior. In production, preFlightCheck runs
    // matchFastRoute FIRST — "播放" is captured as resume before reaching here.
    // This test documents the behavior so the ordering contract is explicit.
    expect(matchSearchRoute('播放')).toEqual({ query: '放' });
  });

  it('doesNotMatch_fastRouteWordsWithoutSearchPrefix', () => {
    // Words that share no prefix with the search alternation — truly no match.
    expect(matchSearchRoute('继续')).toBeNull();
    expect(matchSearchRoute('暂停')).toBeNull();
    expect(matchSearchRoute('切歌')).toBeNull();
  });

  it('doesNotMatch_emptyOrPrefixOnly', () => {
    expect(matchSearchRoute('')).toBeNull();
    expect(matchSearchRoute('播')).toBeNull(); // prefix but no query (.+ requires 1+ char)
    expect(matchSearchRoute('放')).toBeNull();
    expect(matchSearchRoute('来点')).toBeNull();
  });

  it('doesNotMatch_greetingOrThanks', () => {
    expect(matchSearchRoute('你好')).toBeNull();
    expect(matchSearchRoute('谢谢')).toBeNull();
  });

  it('doesNotMatch_nullOrUndefined', () => {
    expect(matchSearchRoute(null)).toBeNull();
    expect(matchSearchRoute(undefined)).toBeNull();
  });
});
