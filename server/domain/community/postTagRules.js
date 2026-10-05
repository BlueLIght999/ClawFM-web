/**
 * postTagRules — 帖子自动标签的规则关键词实现（F2，domain 纯逻辑）。
 *
 * PRD F2 要求发帖时给帖子打 1-3 个标签（曲风/情绪），供 F4 分发与 F9 发现流
 * 加权使用；PRD §10 把「规则关键词」定为 LLM 打标签失败时的兜底。此前两条都没
 * 接上，帖子 autoTags 恒为空，下游两个消费者对所有帖子都打 0 分。
 *
 * 先落规则路径而不是 LLM 路径：它同步、零外部依赖，可以留在发帖的请求内；
 * LLM 打标签若以后接上，也该是异步回填，不该把发帖延迟绑在一次模型调用上。
 *
 * 词表直接取 tagRecall.SYNONYM_GROUPS，不另立一份：输出必须是召回层的归一键，
 * 两份词表迟早漂移，漂移后帖子标签与成员标签就落不进同一个桶。
 *
 * 纯函数，零 IO，遵循 D1/D2。
 */
import { SYNONYM_GROUPS } from './tagRecall.js';

/** PRD F2：「打 1-3 个标签」。 */
export const POST_TAG_LIMIT = 3;

/**
 * 在自由文本里过于常见、单独出现时多半不是在说音乐风格的写法。
 * 它们仍留在 SYNONYM_GROUPS 里——成员把「独立」写进自填标签时意思是明确的；
 * 只是不从正文里认（「独立思考」「电子邮件」「氛围很好」）。
 */
const AMBIGUOUS_IN_PROSE = new Set(['独立', '电子', '氛围', 'classic']);

const ASCII_ONLY_RE = /^[\x20-\x7e]+$/;

/** @param {string} s */
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 写法（小写）→ 代表键，与匹配用的正则一起在模块加载时建一次。
 *
 * 一条交替正则扫一遍正文：成本是 O(正文长度)，与词表大小基本无关，且
 * matchAll 天然按出现位置给结果，不需要再排序。写法按长度降序排，同一
 * 位置上长写法先赢（「后摇」不会被拆成别的、「k-pop」不会只认出「pop」）。
 * 纯 ASCII 写法两侧要求不是字母数字，避免从「popcorn」里认出「pop」。
 */
const { SURFACE_TO_KEY, SURFACE_RE } = (() => {
  const map = new Map();
  for (const group of SYNONYM_GROUPS) {
    for (const surface of [group.canonical, ...group.members]) {
      const lower = surface.toLowerCase();
      if (!AMBIGUOUS_IN_PROSE.has(lower)) map.set(lower, group.canonical);
    }
  }
  const alternatives = [...map.keys()]
    .sort((a, b) => b.length - a.length)
    .map((s) => (ASCII_ONLY_RE.test(s)
      ? `(?<![a-z0-9])${escapeRegExp(s)}(?![a-z0-9])`
      : escapeRegExp(s)));
  return { SURFACE_TO_KEY: map, SURFACE_RE: new RegExp(alternatives.join('|'), 'giu') };
})();

/**
 * 从帖子正文里认出曲风/情绪标签。
 *
 * 调用方应传未转义的原文：postRules.sanitizeContent 会把「R&B」变成「R&amp;B」。
 *
 * @param {unknown} text
 * @param {{limit?: number}} [opts]
 * @returns {string[]} 归一键，按首次出现顺序，去重，至多 limit 个
 */
export function extractPostTags(text, { limit = POST_TAG_LIMIT } = {}) {
  if (typeof text !== 'string' || text.length === 0) return [];
  const max = Math.max(Math.floor(Number(limit)) || POST_TAG_LIMIT, 1);
  const out = [];
  for (const match of text.matchAll(SURFACE_RE)) {
    const key = SURFACE_TO_KEY.get(match[0].toLowerCase());
    if (key && !out.includes(key)) {
      out.push(key);
      if (out.length >= max) break;
    }
  }
  return out;
}
