/**
 * CrossUserClusterAnalyzer — 跨用户聚类（F3 核心）。
 *
 * 与 profile/analyzers/UserClusterAnalyzer（单用户时序聚类）不同：
 * 这里把 N 个成员的当前画像各自提向量，喂给 KMeansClusterStrategy，
 * 再把匿名向量映射回 userId，产出 { clusters, memberAssignments }。
 *
 * 纯函数，零 IO，遵循 D1/D2。聚类算法来自 domain/shared/ClusterStrategy（共享内核，非 profile 私有）。
 */
import { KMeansClusterStrategy } from '../../shared/ClusterStrategy.js';
import { extractFeatureVector, generateClusterLabel } from './FeatureExtractor.js';

/**
 * 稳定指纹：键名排序后序列化，使等值向量（无论是否为同一对象）得到同一字符串。
 * 键数固定为 40，成本可忽略。
 * @param {object} vector
 * @returns {string}
 */
function vectorFingerprint(vector) {
  const keys = Object.keys(vector || {}).sort();
  return keys.map((k) => `${k}=${vector[k]}`).join('|');
}

/**
 * @param {Array<{userId:string, profile:object}>} profiles
 * @param {object} [opts]
 * @param {import('../../shared/ClusterStrategy.js').ClusterStrategy} [opts.clusterStrategy]
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

  // 簇成员 -> userId 的映射不能依赖对象引用：DBSCAN 走 includes/indexOf（引用比较），
  // 但策略只需返回等值的向量副本就会让整簇静默退化为空。改用结构指纹做键，
  // 同时对同一指纹下的多个成员用队列按序消费，避免重复指纹互相覆盖。
  const byFingerprint = new Map();
  for (const e of entries) {
    const key = vectorFingerprint(e.vector);
    if (!byFingerprint.has(key)) byFingerprint.set(key, []);
    byFingerprint.get(key).push(e.userId);
  }

  const clusters = result.clusters.map((c) => {
    const memberUserIds = c.members
      .map((mv) => byFingerprint.get(vectorFingerprint(mv))?.shift())
      .filter((uid) => uid !== undefined);
    return {
      clusterId: c.clusterId,
      label: generateClusterLabel(c.centroid),
      memberCount: c.memberCount,
      memberUserIds,
      centroid: c.centroid,
    };
  });

  // 同上：动态键写入的后累加对象，tsc 只能推断 {}，需显式声明。
  /** @type {Record<string, number>} */
  const memberAssignments = {};
  for (const c of clusters) {
    for (const uid of c.memberUserIds) memberAssignments[uid] = c.clusterId;
  }

  return { k: result.k, clusters, memberAssignments };
}
