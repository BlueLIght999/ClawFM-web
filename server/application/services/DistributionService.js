/**
 * DistributionService — Agent 分发用例（F4）。
 *
 * 编排：取簇快照 → matchClustersForContent → collectRecipients → 逐成员去重(RC1) + 入 inbox + emit community:push。
 * 依赖 CommunityRepository Port + domain distributionRules + eventPublisher。
 */
import { matchClustersForContent, collectRecipients } from '../../domain/community/distributionRules.js';

/**
 * @param {{communityRepository: import('../ports/repos/CommunityRepository.js').CommunityRepository, eventPublisher?: {emit?: (event:string, payload:object, targetUserId?:string)=>void}, logger?: {warn?:Function}}} [deps]
 */
// The `= {}` default is cast rather than the dependency being marked optional:
// communityRepository is genuinely required (every method dereferences it), so
// typing it optional would trade one honest error for ~100 false
// possibly-undefined ones. A caller that omits it fails at first use -- which is
// the existing behaviour -- and the cast keeps that contract documented.
export function createDistributionService({communityRepository, eventPublisher, logger} = /** @type {any} */ ({})) {
  const repo = communityRepository;

  /**
   * @param {object} params
   * @param {string} params.targetType    - post/playlist/song
   * @param {string} params.targetId
   * @param {string[]} [params.contentTags]
   * @param {string|null} [params.fromUserId]
   * @param {string|null} [params.reason]
   * @returns {{pushedTo:number, matchedClusters:Array, skipped:number}}
   */
  function distribute({ targetType, targetId, contentTags, fromUserId = null, reason = null }) {
    // fromUserId/reason default to null (not undefined), so their tags admit null:
    // a `string`-only tag made the null default itself the type error (TS2322 x2).
    const clusters = repo.getClusterSnapshot();
    const matched = matchClustersForContent({ contentTags, clusters });
    if (matched.length === 0) {
      return { pushedTo: 0, matchedClusters: [], skipped: 0 };
    }

    const recipients = collectRecipients(matched);
    let pushed = 0;
    let skipped = 0;

    for (const uid of recipients) {
      // RC1: 24h 去重
      try {
        if (repo.hasInboxRecently(uid, targetType, targetId)) {
          skipped += 1;
          continue;
        }
      } catch (e) {
        logger?.warn?.({ component: 'community', err: e?.message }, 'dedup check failed, proceeding');
      }

      const matchedCluster = matched.find((m) => (m.memberUserIds || []).includes(uid));
      const fromCluster = matchedCluster ? matchedCluster.clusterId : null;

      try {
        repo.createInbox({ userId: uid, targetType, targetId, fromCluster, reason });
        eventPublisher?.emit?.('community:push', { userId: uid, targetType, targetId, fromCluster, reason, fromUserId }, uid);
        pushed += 1;
      } catch (e) {
        logger?.warn?.({ component: 'community', err: e?.message, uid }, 'inbox create failed');
      }
    }

    return {
      pushedTo: pushed,
      skipped,
      matchedClusters: matched.map((m) => ({ clusterId: m.clusterId, score: m.score, label: m.label })),
    };
  }

  function getInbox(userId) {
    return repo.listInbox(userId);
  }

  return { distribute, getInbox };
}
