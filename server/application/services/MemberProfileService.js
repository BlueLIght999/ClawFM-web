/**
 * MemberProfileService — P-B 个人画像构建用例（application 层）。
 *
 * 三路融合编排：网易云历史（路1）+ 本电台交互（路2）+ 自填标签（路3）→ 36 维 fused profile。
 * 依赖：CommunityRepository / NeteaseMemberHistoryPort / CookieCipherPort + domain fuseProfile/aggregateRadioSignals。
 * 网易云拉取失败 → 降级仅用路2+路3（PRD §10），返回 degraded=true。
 */
import { fuseProfile, aggregateRadioSignals } from '../../domain/community/profileFusionRules.js';

/**
 * @param {object} deps
 * @param {import('../ports/repos/CommunityRepository.js').CommunityRepository} deps.communityRepository
 * @param {import('../ports/services/NeteaseMemberHistoryPort.js').NeteaseMemberHistoryPort} deps.neteaseHistoryPort
 * @param {import('../ports/services/CookieCipherPort.js').CookieCipherPort} deps.cookieCipherPort
 * @param {{warn?: Function}} [deps.logger]
 */
export function createMemberProfileService({ communityRepository, neteaseHistoryPort, cookieCipherPort, logger }) {
  const repo = communityRepository;

  /**
   * 构建并缓存成员画像。
   * @returns {Promise<{ok:true, profile:object, degraded:boolean} | {ok:false, error:string}>}
   */
  async function buildProfile(userId) {
    const auth = repo.getMemberAuth(userId);
    if (!auth) return { ok: false, error: 'no_credentials' };

    let neteaseSignals;
    let degraded = false;
    try {
      const cookie = cookieCipherPort.decrypt(auth.cookieEncrypted);
      neteaseSignals = await neteaseHistoryPort.fetchMemberHistory(auth.neteaseUid, cookie);
    } catch (e) {
      degraded = true;
      logger?.warn?.({ component: 'community', userId, err: e?.message }, 'netease history fetch failed, degrading to radio-only');
      neteaseSignals = {};
    }

    const listens = repo.listListensByUser(userId, 500);
    const radioSignals = aggregateRadioSignals(listens);
    const member = repo.getMember(userId);
    const selfTags = member?.selfTags || [];

    const fused = fuseProfile({ neteaseSignals, radioSignals, selfTags });
    repo.saveProfile(userId, fused);
    return { ok: true, profile: fused, degraded };
  }

  function getProfile(userId) {
    return repo.getProfile(userId);
  }

  return { buildProfile, getProfile };
}
