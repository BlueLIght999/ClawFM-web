/**
 * CrossUserClusterAnalyzer — 跨用户聚类（F3 核心）。
 *
 * 与 profile/analyzers/UserClusterAnalyzer（单用户时序聚类）不同：
 * 这里把 N 个成员的当前画像各自提向量，喂给 KMeansClusterStrategy，
 * 再把匿名向量映射回 userId，产出 { clusters, memberAssignments }。
 *
 * 纯函数，零 IO，遵循 D1/D2。复用 profile/analyzers/ClusterStrategy（domain→domain 允许）。
 */
import { KMeansClusterStrategy } from '../../profile/analyzers/ClusterStrategy.js';
import { extractFeatureVector, generateClusterLabel } from './FeatureExtractor.js';

/**
 * @param {Array<{userId:string, profile:object}>} profiles
 * @param {object} [opts]
 * @param {import('../../profile/analyzers/ClusterStrategy.js').ClusterStrategy} [opts.clusterStrategy]
 * @returns {{k:number, clusters:Array, memberAssignments:Record<string,number>}}
 */
export function crossUserCluster(profiles, opts = {}) {
  const list = Array.isArray(profiles) ? profiles : [];
  const entries = list
    .filter((p) => p && p.userId)
    .map((p) => ({ userId: String(p.userId), vector: extractFeatureVector(p.profile) }));

  if (entries.length === 0) {
    return { k: 0, clusters: [], memberAssignments: {} };
  }

  // 单成员：KMeans 无意义，直接归一簇
  if (entries.length === 1) {
    const solo = entries[0];
    return {
      k: 1,
      clusters: [
        {
          clusterId: 0,
          label: generateClusterLabel(solo.vector) || 'solo',
          memberCount: 1,
          memberUserIds: [solo.userId],
          centroid: solo.vector,
        },
      ],
      memberAssignments: { [solo.userId]: 0 },
    };
  }

  const strategy = opts.clusterStrategy || new KMeansClusterStrategy({ minK: 2, maxK: 8 });
  const vectors = entries.map((e) => e.vector);
  const result = strategy.cluster(vectors);

  const clusters = result.clusters.map((c) => {
    // members 是向量对象引用，按引用找回 userId
    const memberUserIds = c.members
      .map((mv) => entries.find((e) => e.vector === mv)?.userId)
      .filter((uid) => uid !== undefined);
    return {
      clusterId: c.clusterId,
      label: generateClusterLabel(c.centroid),
      memberCount: c.memberCount,
      memberUserIds,
      centroid: c.centroid,
    };
  });

  const memberAssignments = {};
  for (const c of clusters) {
    for (const uid of c.memberUserIds) memberAssignments[uid] = c.clusterId;
  }

  return { k: result.k, clusters, memberAssignments };
}
