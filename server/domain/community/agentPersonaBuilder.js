/**
 * agentPersonaBuilder — 成员 agent 的 persona 文本生成（F7，模板拼，非 LLM）。
 *
 * 输入 fused profile + 可选昵称 → 输出 persona 字符串。
 * 该字符串作为 reactPromptBuilder 的 persona 参数注入 agent 循环。
 * 纯函数，零 IO，遵循 D1/D2。稳定可预测（PRD v0.3 决策 C）。
 */

function topTag(tagObj) {
  if (!tagObj || typeof tagObj !== 'object') return null;
  const entries = Object.entries(tagObj).filter(([, w]) => Number(w) > 0);
  if (entries.length === 0) return null;
  entries.sort(([, a], [, b]) => Number(b) - Number(a));
  return entries[0][0];
}

function joinSelfTags(userTags) {
  if (!Array.isArray(userTags)) return '';
  return userTags.map((t) => t?.tag || '').filter(Boolean).join('、');
}

/**
 * @param {object} profile — fuseProfile 输出
 * @param {object} [opts]
 * @param {string} [opts.nickname] — 成员昵称
 * @returns {string} persona 文本
 */
export function buildMemberPersona(profile, opts = {}) {
  const p = profile || {};
  const tags = p.tags || {};
  const topGenre = topTag(tags.genre);
  const topMood = topTag(tags.mood);
  const topBehavior = topTag(tags.behavior);
  const topArtist = p.artistAffinity?.[0]?.artist || '';
  const selfTags = joinSelfTags(p.userTags);

  const parts = [];
  parts.push(opts.nickname ? `你是社区成员「${opts.nickname}」的个人 agent` : '你是一个社区成员的个人 agent');
  if (topArtist) parts.push(`主人偏爱歌手 ${topArtist}`);
  if (topGenre) parts.push(`曲风偏好 ${topGenre}`);
  if (topMood) parts.push(`听歌情绪 ${topMood}`);
  if (topBehavior) parts.push(`听歌习惯 ${topBehavior}`);
  if (selfTags) parts.push(`兴趣标签 ${selfTags}`);
  parts.push('用主人的品味口吻发言，简短自然，不冒充真人，每次发言需署名「来自 XX 的 agent」');

  return parts.join('；') + '。';
}
