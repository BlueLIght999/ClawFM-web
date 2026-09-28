/**
 * selfTagRules — 自填兴趣标签的纯校验/归一规则（domain，零 IO）。
 *
 * 自填标签是画像融合的第三条输入通路（P-B 路 3）：它不像听歌历史需要反推，
 * 而是用户唯一一次显式声明偏好，因此质量必须守住——脏标签会直接进入
 * profile.userTags，进而污染 persona 文案与跨用户相似度计算。
 *
 * 约束（PRD F1「成员可补填/修改兴趣标签」）：
 *   - 单标签长度 ≤ MAX_TAG_LENGTH
 *   - 标签总数 ≤ MAX_SELF_TAGS
 *   - 去空、去重（大小写不敏感，保留用户首次书写形式）
 *   - 不排序：保留用户书写顺序，供前端回显时稳定展示
 *
 * 本模块只做校验与归一，不碰存储（D1/D2）；错误以 {ok, error} 返回而非抛异常，
 * 由 route 层决定 HTTP 状态码（与 communityRoutes 既有风格一致）。
 */

/** 单个标签最大长度（字符）。12 字足够覆盖「深夜后摇」「爵士小号」这类词组。 */
export const MAX_TAG_LENGTH = 12;
/** 单个成员最多自填标签数。超过此数标签不再具备区分度，反而稀释相似度信号。 */
export const MAX_SELF_TAGS = 20;

/** 校验失败原因（供 route 层映射为 error 字段，前端可据此提示）。 */
export const SELF_TAG_ERRORS = {
  NOT_ARRAY: 'self_tags_not_array',
  TOO_MANY: 'self_tags_too_many',
  INVALID_ENTRY: 'self_tag_invalid',
  TOO_LONG: 'self_tag_too_long',
};

/**
 * 归一化标签列表：去空、去重（大小写不敏感）、保持书写顺序。
 * @param {unknown} input 任意输入，非数组视为空列表
 * @returns {string[]} 归一后的标签（可能为空数组）
 * 约束：纯函数，不修改入参；返回新数组。
 */
export function normalizeTagList(input) {
  const list = Array.isArray(input) ? input : [];
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    if (typeof raw !== 'string') continue;
    const tag = raw.trim();
    if (tag.length === 0) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

/**
 * 校验并归一自填标签。
 * @param {unknown} input 请求体中的 selfTags
 * @returns {{ok: true, tags: string[]} | {ok: false, error: string}}
 *   ok=true 时 tags 为可直接落库的归一列表；
 *   ok=false 时 error 取 SELF_TAG_ERRORS 之一。
 * 约束：非数组直接判错（而非静默当空），避免前端字段名写错却得到 200。
 */
export function validateSelfTags(input) {
  if (!Array.isArray(input)) {
    return { ok: false, error: SELF_TAG_ERRORS.NOT_ARRAY };
  }
  for (const raw of input) {
    if (typeof raw !== 'string') {
      return { ok: false, error: SELF_TAG_ERRORS.INVALID_ENTRY };
    }
    if (raw.trim().length > MAX_TAG_LENGTH) {
      return { ok: false, error: SELF_TAG_ERRORS.TOO_LONG };
    }
  }
  // 先判长度上限再归一：用户填 30 个里有 10 个重复时，仍应视为超限而非放宽
  if (input.length > MAX_SELF_TAGS) {
    return { ok: false, error: SELF_TAG_ERRORS.TOO_MANY };
  }
  return { ok: true, tags: normalizeTagList(input) };
}

/**
 * 计算两组标签的 Jaccard 相似度（交集/并集，大小写不敏感）。
 * @param {string[]} a
 * @param {string[]} b
 * @returns {number} 0..1；任一方为空返回 0
 * 用途：跨用户相似度重排的显式标签分项，可解释性来源。
 */
export function tagJaccard(a, b) {
  const setA = new Set(normalizeTagList(a).map((t) => t.toLowerCase()));
  const setB = new Set(normalizeTagList(b).map((t) => t.toLowerCase()));
  if (setA.size === 0 || setB.size === 0) return 0;
  let inter = 0;
  for (const t of setA) {
    if (setB.has(t)) inter += 1;
  }
  const union = setA.size + setB.size - inter;
  return union === 0 ? 0 : inter / union;
}
