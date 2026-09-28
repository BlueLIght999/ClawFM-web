/**
 * FeatureExtractor — 把 fused profile 转成定长数值向量（供 KMeans 聚类）。
 *
 * 向量维度（40 维，固定）：
 *   - genre(10) + mood(8) + region(5) + behavior(6) + chat(4) = 33（复用 profileFusionRules 标签表）
 *   - ts_morning/afternoon/evening/night/late_night = 5（时段）
 *   - artist_top = 1（top 歌手权重，0-1）
 *   - user_tags_count = 1（自填标签数 / 10，上限 1）
 *
 * 纯函数，零 IO，遵循 D1/D2。标签表从 profileFusionRules 复用，避免重复定义。
 */
import {
  GENRE_TAGS,
  MOOD_TAGS,
  REGION_TAGS,
  BEHAVIOR_TAGS,
  CHAT_TAGS,
  TIME_SLOTS,
} from '../profileFusionRules.js';

const USER_TAGS_MAX = 10;

/**
 * 从 fused profile 提取定长数值向量。
 * @param {object} profile - fuseProfile 的输出
 * @returns {Record<string, number>} 40 维向量
 */
export function extractFeatureVector(profile) {
  const p = profile || {};
  const tags = p.tags || {};
  // 累加器显式标成 Record<string, number>：按模板字符串下标逐项赋值时，
  // tsc 只能推断出 {}，与声明的返回类型 Record<string, number> 冲突。
  /** @type {Record<string, number>} */
  const v = {};

  for (const t of GENRE_TAGS) v[`genre_${t}`] = Number(tags.genre?.[t]) || 0;
  for (const t of MOOD_TAGS) v[`mood_${t}`] = Number(tags.mood?.[t]) || 0;
  for (const t of REGION_TAGS) v[`region_${t}`] = Number(tags.region?.[t]) || 0;
  for (const t of BEHAVIOR_TAGS) v[`behavior_${t}`] = Number(tags.behavior?.[t]) || 0;
  for (const t of CHAT_TAGS) v[`chat_${t}`] = Number(tags.chat?.[t]) || 0;
  for (const t of TIME_SLOTS) v[`ts_${t}`] = Number(p.timeSlot?.[t]) || 0;

  v.artist_top = Number(p.artistAffinity?.[0]?.weight) || 0;
  v.user_tags_count = Math.min((Array.isArray(p.userTags) ? p.userTags.length : 0) / USER_TAGS_MAX, 1);

  return v;
}

const LABEL_PREFIX_RE = /^(genre|mood|region|behavior|chat|ts)_/;
const LABEL_SPECIAL = { artist_top: 'artist', user_tags_count: 'tags' };

function featureToLabelPart(key) {
  if (LABEL_SPECIAL[key]) return LABEL_SPECIAL[key];
  return key.replace(LABEL_PREFIX_RE, '');
}

/**
 * 从质心向量生成人类可读簇标签（top-3 非零特征，用 · 连接）。
 */
export function generateClusterLabel(centroid) {
  const entries = Object.entries(centroid || {})
    .filter(([, val]) => Number(val) > 0)
    .sort(([, a], [, b]) => Number(b) - Number(a))
    .slice(0, 3);
  if (entries.length === 0) return 'unknown';
  return entries.map(([k]) => featureToLabelPart(k)).join('·');
}

/**
 * 返回向量维度名清单（测试/调试用）。
 */
export function featureDimensionNames() {
  const names = [];
  for (const t of GENRE_TAGS) names.push(`genre_${t}`);
  for (const t of MOOD_TAGS) names.push(`mood_${t}`);
  for (const t of REGION_TAGS) names.push(`region_${t}`);
  for (const t of BEHAVIOR_TAGS) names.push(`behavior_${t}`);
  for (const t of CHAT_TAGS) names.push(`chat_${t}`);
  for (const t of TIME_SLOTS) names.push(`ts_${t}`);
  names.push('artist_top');
  names.push('user_tags_count');
  return names;
}
