/**
 * ClusterService — 跨用户聚类用例（F3）。
 *
 * 编排：拉所有成员画像 → crossUserCluster → 存快照 + 回写每成员 cluster_id → emit community:cluster-updated。
 * 依赖 CommunityRepository Port + domain crossUserCluster + eventPublisher（Port，adapter 接 socket）。
 * RC2：聚类失败不阻塞电台——此处 try/catch 降级返回上次快照。
 */
import { crossUserCluster } from '../../domain/community/clustering/CrossUserClusterAnalyzer.js';

/**
 * Deps are destructured directly and the bag itself is optional (defaults to
 * `{}`); the inline object form is the one tsc binds to a destructured parameter.
 *
 * @param {{communityRepository: import('../ports/repos/CommunityRepository.js').CommunityRepository, eventPublisher?: {emit?: (event:string, payload:object, targetUserId?:string)=>void}, logger?: {warn?:Function, info?:Function}}} [deps]
 */
// The `= {}` default is cast rather than the dependency being marked optional:
// communityRepository is genuinely required (every method dereferences it), so
// typing it optional would trade one honest error for ~100 false
// possibly-undefined ones. A caller that omits it fails at first use -- which is
// the existing behaviour -- and the cast keeps that contract documented.
export function createClusterService({communityRepository, eventPublisher, logger} = /** @type {any} */ ({})) {
  const repo = communityRepository;

  function runClustering() {
    let profiles;
    try {
      profiles = repo.listAllProfiles();
    } catch (e) {
      logger?.warn?.({ component: 'community', err: e?.message }, 'listAllProfiles failed');
      return { k: 0, clusters: [], memberAssignments: {}, degraded: true };
    }

    if (profiles.length === 0) {
      return { k: 0, clusters: [], memberAssignments: {}, degraded: false };
    }

    let result;
    try {
      result = crossUserCluster(profiles);
    } catch (e) {
      logger?.warn?.({ component: 'community', err: e?.message }, 'clustering failed, keeping last snapshot');
      return { k: 0, clusters: repo.getClusterSnapshot(), memberAssignments: {}, degraded: true };
    }

    // 快照 + 成员归属需原子写入：仓储提供 saveClusterResult（单事务），
    // 未实现该方法的适配器回落为两步写入（保持 port 向后兼容）。
    try {
      if (typeof repo.saveClusterResult === 'function') {
        repo.saveClusterResult(result.clusters, result.memberAssignments);
      } else {
        repo.saveClusterSnapshot(result.clusters);
        for (const [userId, clusterId] of Object.entries(result.memberAssignments)) {
          repo.setMemberCluster(userId, clusterId);
        }
      }
    } catch (e) {
      logger?.warn?.({ component: 'community', err: e?.message }, 'cluster snapshot persist failed');
      return { k: 0, clusters: repo.getClusterSnapshot(), memberAssignments: {}, degraded: true };
    }

    for (const c of result.clusters) {
      for (const uid of c.memberUserIds) {
        eventPublisher?.emit?.('community:cluster-updated', { userId: uid, clusterId: c.clusterId, label: c.label }, uid);
      }
    }

    return { ...result, degraded: false };
  }

  function getClusters() {
    return repo.getClusterSnapshot();
  }

  function getClusterMembers(clusterId) {
    return repo.listClusterMembers(Number(clusterId));
  }

  return { runClustering, getClusters, getClusterMembers };
}
