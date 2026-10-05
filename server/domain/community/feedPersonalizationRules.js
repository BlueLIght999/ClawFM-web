/**
 * feedPersonalizationRules — F9 发现流个性化（被邀请方画像加权 feed 排序）。
 *
 * 当存在 active 的 feed 类邀请时，邀请方看到的 feed 按被邀请方品味关键词加权：
 * 帖子 autoTags 与关键词重叠越多排越前（稳定排序，不丢帖）。
 * 判等经 tagRecall.normalizeTagKey，与召回层同源：帖子 autoTags 是归一键
 * （'postrock'），被邀请方自填标签是原样写法（'后摇'），按字面比永远对不上。
 *
 * 纯函数，零 IO，遵循 D1/D2。
 */
import { normalizeTagKey } from './tagRecall.js';

const TOP_N = 5;

/**
 * 从 fused profile 提取 top-N 品味关键词（genre/mood/behavior + 歌手 + 自填标签）。
 * @returns {string[]} 关键词小写数组
 */
export function topTasteKeywords(profile, n = TOP_N) {
  const p = profile || {};
  const tags = p.tags || {};
  const entries = [];

  for (const cat of ['genre', 'mood', 'behavior']) {
    const obj = tags[cat] || {};
    for (const [k, w] of Object.entries(obj)) {
      if (Number(w) > 0) entries.push({ keyword: String(k), weight: Number(w) });
    }
  }
  for (const a of Array.isArray(p.artistAffinity) ? p.artistAffinity : []) {
    if (a?.artist) entries.push({ keyword: String(a.artist), weight: Number(a.weight) || 0 });
  }
  for (const t of Array.isArray(p.userTags) ? p.userTags : []) {
    if (t?.tag) entries.push({ keyword: String(t.tag), weight: Number(t.weight) || 0 });
  }

  return entries
    .sort((a, b) => b.weight - a.weight)
    .slice(0, Math.max(Number(n) || TOP_N, 1))
    .map((e) => e.keyword.toLowerCase());
}

/**
 * 把关键词折成归一键集合。空键（纯标点等）丢弃，否则它会和同样折成空的帖子标签相撞。
 * @param {unknown} keywords
 * @returns {Set<string>}
 */
function toKeySet(keywords) {
  const set = new Set();
  for (const k of Array.isArray(keywords) ? keywords : []) {
    const key = normalizeTagKey(k);
    if (key.length > 0) set.add(key);
  }
  return set;
}

/**
 * @param {object} post
 * @param {Set<string>} keySet 已归一
 * @returns {number}
 */
function scoreAgainstKeys(post, keySet) {
  const tags = Array.isArray(post?.autoTags) ? post.autoTags : [];
  let score = 0;
  for (const t of tags) if (keySet.has(normalizeTagKey(t))) score += 1;
  return score;
}

/**
 * 计算帖子对一组品味关键词的匹配分（autoTags 与关键词按归一键的重叠数）。
 */
export function scorePostForTaste(post, keywords) {
  return scoreAgainstKeys(post, toKeySet(keywords));
}

/**
 * 个性化 feed：按被邀请方画像加权重排帖子（稳定，得分高在前，0 分保持原序）。
 * @param {Array} posts - 帖子数组（含 autoTags）
 * @param {Array<object>} inviteeProfiles - 被邀请方 fused profile 数组
 * @returns {Array} 重排后的帖子数组（新数组，不改原序的相对顺序）
 */
export function personalizeFeed(posts, inviteeProfiles) {
  const list = Array.isArray(posts) ? posts : [];
  if (list.length === 0) return [];
  const profiles = Array.isArray(inviteeProfiles) ? inviteeProfiles : [];
  if (profiles.length === 0) return [...list];

  // 合并所有被邀请方关键词，归一一次：逐帖重建集合会把成本放大成「帖数 × 关键词数」
  const keySet = toKeySet(profiles.flatMap((p) => topTasteKeywords(p)));
  if (keySet.size === 0) return [...list];

  // 稳定排序：按 score desc，同分保持原索引顺序
  const indexed = list.map((post, idx) => ({ post, idx, score: scoreAgainstKeys(post, keySet) }));
  indexed.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.idx - b.idx;
  });
  return indexed.map((x) => x.post);
}
