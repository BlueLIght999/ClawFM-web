/**
 * DistributionService — Agent 分发用例（F4）。
 *
 * 编排：取簇快照 → matchClustersForContent → collectRecipients → 逐成员去重(RC1) + 入 inbox + emit community:push。
 * shareWithClusterPeers 走同一条投递路径，收件人换成分享者的同簇成员。
 * 依赖 CommunityRepository Port + domain distributionRules + eventPublisher。
 */
import { matchClustersForContent, collectRecipients } from '../../domain/community/distributionRules.js';

/**
 * 成员 → 其所在的得分最高的匹配簇。
 *
 * 一次建表代替逐成员 matched.find(...memberUserIds.includes)：后者是
 * O(收件人 × 簇数 × 簇大小)，簇一大就在发帖路径上退化成平方级。
 * matched 已按得分降序，先到先得即「得分最高」，与原 find 语义一致。
 *
 * @param {Array<{clusterId:number, memberUserIds?:string[]}>} matched
 * @returns {Map<string, number>}
 */
function bestClusterByMember(matched) {
  const map = new Map();
  for (const m of matched) {
    for (const uid of m.memberUserIds || []) {
      if (!map.has(uid)) map.set(uid, m.clusterId);
    }
  }
  return map;
}

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
   * 逐收件人：去重(RC1) → 入 inbox → 定向 emit。作者本人跳过。
   *
   * @param {Iterable<string>} recipients
   * @param {(uid: string) => number|null} clusterOf 收件人归到哪个簇（写进 fromCluster）
   * @param {{targetType:string, targetId:string, fromUserId:string|null, reason:string|null, summary:string|null}} item
   * @returns {{pushed:number, skipped:number}}
   */
  function deliver(recipients, clusterOf, { targetType, targetId, fromUserId, reason, summary }) {
    const author = fromUserId === null ? null : String(fromUserId);
    let pushed = 0;
    let skipped = 0;

    for (const uid of recipients) {
      // 作者自己通常就在匹配簇里：把自己的内容推进自己的收件箱是噪音
      if (author !== null && String(uid) === author) continue;
      // RC1: 24h 去重
      try {
        if (repo.hasInboxRecently(uid, targetType, targetId)) {
          skipped += 1;
          continue;
        }
      } catch (e) {
        logger?.warn?.({ component: 'community', err: e?.message }, 'dedup check failed, proceeding');
      }

      const fromCluster = clusterOf(uid);

      try {
        repo.createInbox({ userId: uid, targetType, targetId, fromCluster, reason, summary });
        eventPublisher?.emit?.('community:push', { userId: uid, targetType, targetId, fromCluster, reason, summary, fromUserId }, uid);
        pushed += 1;
      } catch (e) {
        logger?.warn?.({ component: 'community', err: e?.message, uid }, 'inbox create failed');
      }
    }
    return { pushed, skipped };
  }

  /**
   * 按内容标签分发到匹配簇（发帖 / DJ 歌单两个触发点）。
   *
   * @param {object} params
   * @param {string} params.targetType    - post/playlist/song
   * @param {string} params.targetId
   * @param {string[]} [params.contentTags]
   * @param {string|null} [params.fromUserId]
   * @param {string|null} [params.reason]
   * @param {string|null} [params.summary] - 收件箱一行展示的摘要；inbox 只存引用时收件人看不出推的是什么
   * @returns {{pushedTo:number, matchedClusters:Array, skipped:number}}
   */
  function distribute({ targetType, targetId, contentTags, fromUserId = null, reason = null, summary = null }) {
    // fromUserId/reason default to null (not undefined), so their tags admit null:
    // a `string`-only tag made the null default itself the type error (TS2322 x2).
    const clusters = repo.getClusterSnapshot();
    const matched = matchClustersForContent({ contentTags, clusters });
    if (matched.length === 0) {
      return { pushedTo: 0, matchedClusters: [], skipped: 0 };
    }

    const clusterOf = bestClusterByMember(matched);
    const { pushed, skipped } = deliver(
      collectRecipients(matched),
      (uid) => clusterOf.get(uid) ?? null,
      { targetType, targetId, fromUserId, reason, summary },
    );

    return {
      pushedTo: pushed,
      skipped,
      matchedClusters: matched.map((m) => ({ clusterId: m.clusterId, score: m.score, label: m.label })),
    };
  }

  /**
   * 推给分享者所在簇的其他成员（PRD F4「成员点赞某歌 → 推给同簇其他人」）。
   *
   * 不走标签匹配：这里的依据是「和我同簇」，不是内容像不像。只读一个簇的成员，
   * 不取全量快照。尚未聚类的成员没有同簇的人，直接返回。
   *
   * @param {{userId:string, targetType:string, targetId:string, reason?:string|null, summary?:string|null}} params
   * @returns {{pushedTo:number, skipped:number, clusterId:number|null}}
   */
  function shareWithClusterPeers({ userId, targetType, targetId, reason = null, summary = null }) {
    const clusterId = repo.getMember(userId)?.clusterId ?? null;
    if (clusterId === null) return { pushedTo: 0, skipped: 0, clusterId: null };

    const peers = repo.listClusterMembers(clusterId).map((m) => String(m.userId));
    const { pushed, skipped } = deliver(peers, () => clusterId, {
      targetType, targetId, fromUserId: String(userId), reason, summary,
    });
    return { pushedTo: pushed, skipped, clusterId };
  }

  function getInbox(userId) {
    return repo.listInbox(userId);
  }

  return { distribute, shareWithClusterPeers, getInbox };
}
