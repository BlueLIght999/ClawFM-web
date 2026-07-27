/**
 * feedPersonalizationRules — F9 发现流个性化（被邀请方画像加权 feed 排序）。
 *
 * 当存在 active 的 feed 类邀请时，邀请方看到的 feed 按被邀请方品味关键词加权：
 * 帖子 autoTags 与关键词重叠越多排越前（稳定排序，不丢帖）。
 * 纯函数，零 IO，遵循 D1/D2。
 */

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
 * 计算帖子对一组品味关键词的匹配分（autoTags 重叠数）。
 */
export function scorePostForTaste(post, keywords) {
  const tags = Array.isArray(post?.autoTags) ? post.autoTags.map((t) => String(t).toLowerCase()) : [];
  if (tags.length === 0) return 0;
  const kwSet = new Set(Array.isArray(keywords) ? keywords : []);
  let score = 0;
  for (const t of tags) if (kwSet.has(t)) score += 1;
  return score;
}

/**
 * 个性化 feed：按被邀请方画像加权重排帖子（稳定，得分高在前，0 分保持原序）。
 * @param {Array} posts — 帖子数组（含 autoTags）
 * @param {Array<object>} inviteeProfiles — 被邀请方 fused profile 数组
 * @returns {Array} 重排后的帖子数组（新数组，不改原序的相对顺序）
 */
export function personalizeFeed(posts, inviteeProfiles) {
  const list = Array.isArray(posts) ? posts : [];
  if (list.length === 0) return [];
  const profiles = Array.isArray(inviteeProfiles) ? inviteeProfiles : [];
  if (profiles.length === 0) return [...list];

  // 合并所有被邀请方关键词
  const kwSet = new Set();
  for (const p of profiles) {
    for (const k of topTasteKeywords(p)) kwSet.add(k);
  }
  const keywords = [...kwSet];
  if (keywords.length === 0) return [...list];

  // 稳定排序：按 score desc，同分保持原索引顺序
  const indexed = list.map((post, idx) => ({ post, idx, score: scorePostForTaste(post, keywords) }));
  indexed.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.idx - b.idx;
  });
  return indexed.map((x) => x.post);
}
