/**
 * distributionRules — 内容→簇匹配规则（F4 分发策略，domain 纯逻辑）。
 *
 * 给定内容标签 + 簇列表（含 label/centroid），按标签与簇特征的交集打分，
 * 选出匹配的簇。纯函数，零 IO，遵循 D1/D2。
 */
import { generateClusterLabel } from './clustering/FeatureExtractor.js';
import { extractPostTags } from './postTagRules.js';

const TOP_FEATURES_PER_CLUSTER = 5;

/** 收件箱一行的摘要上限（码点）。只是让收件人认出是什么，不是正文。 */
export const SUMMARY_MAX = 80;

/** 一个歌单块最多带几个标签进匹配：块的 genreHints 通常 2-3 个，留一点余量给主题词。 */
const PLAYLIST_TAG_LIMIT = 5;

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

/**
 * 把任意文本收成一行收件箱摘要：折叠空白，超长按码点截断加省略号。
 *
 * 按码点而不是 UTF-16 单元截：切在代理对中间，收件人那边会渲染出一个乱码字符。
 *
 * @param {unknown} text
 * @param {number} [max=SUMMARY_MAX]
 * @returns {string}
 */
export function clipSummary(text, max = SUMMARY_MAX) {
  if (typeof text !== 'string') return '';
  const chars = [...text.replace(/\s+/g, ' ').trim()];
  if (chars.length <= max) return chars.join('');
  return `${chars.slice(0, Math.max(max - 1, 0)).join('')}…`;
}

/**
 * DJ 切到某个歌单块 → 一次 playlist 分发的参数（PRD F4「DJ 播到某歌单 → 推给曲风匹配的簇」）。
 *
 * contentTags 不直接用 genreHints：簇关键词是 genre_rnb / genre_postrock 这类归一键，
 * 原样的「R&B」「post-rock」「indie pop」一个都配不上。这里走发帖同一套正文认标签，
 * 输出与召回层、簇特征同一份词表。
 *
 * targetId 决定 24h 去重（RC1）的粒度：同一计划的同一块一天只推一次。部分换计划
 * 路径不带 planId，退回按主题去重。
 *
 * @param {{planId?: string|null, blockIndex?: number, block?: {theme?: string, genreHints?: string[]}|null}} [activation]
 * @returns {{targetType:'playlist', targetId:string, contentTags:string[], summary:string}|null}
 *   null：缺块、无可用标识、或认不出任何标签（匹配不到簇，不必进分发）
 */
export function planBlockDistribution(activation) {
  const block = activation?.block;
  if (!block) return null;
  const theme = typeof block.theme === 'string' ? block.theme.trim() : '';
  const hints = Array.isArray(block.genreHints) ? block.genreHints.filter((h) => typeof h === 'string' && h.trim()) : [];

  const targetId = blockTargetId(activation, theme);
  if (!targetId) return null;

  // 换行分隔，避免相邻两个 hint 拼出一个本不存在的写法
  const contentTags = extractPostTags([...hints, theme].join('\n'), { limit: PLAYLIST_TAG_LIMIT });
  if (contentTags.length === 0) return null;

  const summary = clipSummary(hints.length > 0 ? `${theme} · ${hints.join(' / ')}` : theme);
  return { targetType: 'playlist', targetId, contentTags, summary };
}

/**
 * 歌单块的去重标识：有计划就按「计划#块序号」，没有就退回按主题；两者都没有给空串。
 * @param {{planId?: string|null, blockIndex?: number}} activation
 * @param {string} theme
 */
function blockTargetId({ planId, blockIndex }, theme) {
  if (planId) return `${planId}#${Number(blockIndex) || 0}`;
  return theme ? `theme:${theme}` : '';
}
