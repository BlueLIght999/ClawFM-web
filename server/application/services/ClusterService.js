/**
 * ClusterService — 跨用户聚类用例（F3）。
 *
 * 编排：拉所有成员画像 → crossUserCluster → 存快照 + 回写每成员 cluster_id → emit community:cluster-updated。
 * 依赖 CommunityRepository Port + domain crossUserCluster + eventPublisher（Port，adapter 接 socket）。
 * RC2：聚类失败不阻塞电台——此处 try/catch 降级返回上次快照。
 */
import { crossUserCluster } from '../../domain/community/clustering/CrossUserClusterAnalyzer.js';

/**
 * @param {object} deps
 * @param {import('../ports/repos/CommunityRepository.js').CommunityRepository} deps.communityRepository
 * @param {{emit?: (event:string, payload:object, targetUserId?:string)=>void}} [deps.eventPublisher]
 * @param {{warn?:Function, info?:Function}} [deps.logger]
 */
export function createClusterService({ communityRepository, eventPublisher, logger } = {}) {
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

    try {
      repo.saveClusterSnapshot(result.clusters);
      for (const [userId, clusterId] of Object.entries(result.memberAssignments)) {
        repo.setMemberCluster(userId, clusterId);
      }
    } catch (e) {
      logger?.warn?.({ component: 'community', err: e?.message }, 'cluster snapshot persist failed');
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
