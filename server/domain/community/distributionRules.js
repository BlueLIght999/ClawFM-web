/**
 * distributionRules — 内容→簇匹配规则（F4 分发策略，domain 纯逻辑）。
 *
 * 给定内容标签 + 簇列表（含 label/centroid），按标签与簇特征的交集打分，
 * 选出匹配的簇。纯函数，零 IO，遵循 D1/D2。
 */
import { generateClusterLabel } from './clustering/FeatureExtractor.js';

const TOP_FEATURES_PER_CLUSTER = 5;

/**
 * 从质心向量提取 top-N 关键词（特征名去前缀）。
 */
export function clusterKeywords(centroid, n = TOP_FEATURES_PER_CLUSTER) {
  const entries = Object.entries(centroid || {})
    .filter(([, val]) => Number(val) > 0)
    .sort(([, a], [, b]) => Number(b) - Number(a))
    .slice(0, n);
  const label = generateClusterLabel(centroid); // top-3
  const labelParts = label === 'unknown' ? [] : label.split('·');
  // 合并 top-N 特征与 label，去重
  const seen = new Set();
  const out = [];
  for (const part of labelParts) {
    if (part && !seen.has(part)) { seen.add(part); out.push(part); }
  }
  for (const [k] of entries) {
    const stripped = stripPrefix(k);
    if (stripped && !seen.has(stripped)) { seen.add(stripped); out.push(stripped); }
  }
  return out;
}

function stripPrefix(key) {
  if (!key) return '';
  if (key === 'artist_top') return 'artist';
  if (key === 'user_tags_count') return 'tags';
  return key.replace(/^(genre|mood|region|behavior|chat|ts)_/, '');
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  return tags.map((t) => String(t || '').trim().toLowerCase()).filter(Boolean);
}

/**
 * 给内容标签匹配最合适的簇。
 *
 * 参数直接解构，没有 params 包装对象——JSDoc 必须按真实形参名写，否则
 * tsc 认为实参一个都没提供（TS2739）。
 *
 * @param {object} opts
 * @param {string[]} [opts.contentTags] - 内容标签（如帖子 autoTags）
 * @param {Array} [opts.clusters] - crossUserCluster 的 clusters
 * @param {number} [opts.maxClusters=3] - 最多返回几个簇
 * @returns {Array} 按 score 降序的匹配簇 [{clusterId, score, memberUserIds}]
 */
export function matchClustersForContent({ contentTags, clusters, maxClusters = 3 } = {}) {
  const list = Array.isArray(clusters) ? clusters : [];
  const tags = normalizeTags(contentTags);
  if (tags.length === 0 || list.length === 0) return [];

  const scored = list.map((c) => {
    const keywords = clusterKeywords(c.centroid).map((k) => k.toLowerCase());
    const score = tags.reduce((s, t) => (keywords.includes(t) ? s + 1 : s), 0);
    return { clusterId: c.clusterId, score, memberUserIds: c.memberUserIds || [], label: c.label };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(Number(maxClusters) || 3, 1));
}

/**
 * 收集一次分发应推送的所有去重 userId。
 * @returns {string[]} userIds
 */
export function collectRecipients(matchedClusters) {
  const set = new Set();
  for (const c of Array.isArray(matchedClusters) ? matchedClusters : []) {
    for (const uid of c.memberUserIds || []) set.add(String(uid));
  }
  return [...set];
}
