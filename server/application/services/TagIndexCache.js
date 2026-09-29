/**
 * TagIndexCache — 自填标签倒排索引的构建与缓存（application/infrastructure 接缝旁的辅助）。
 *
 * 从 SimilarMembersService 里拆出来的理由不是行数，是**变更原因不同**：
 * 这个文件的全部内容是「索引怎么建、什么时候重建」；服务那个文件的全部内容是
 * 「给定一个人的标签，怎么排出相似的人」。前者关心仓储行的形状与失效时机，
 * 后者关心打分与排序。混在一个工厂函数里时，任何一边的改动都会让另一边的
 * 行号漂移，而仓库的 max-lines-per-function 上限本身就是在提示这件事。
 *
 * ── 缓存里存「预归一后的键集合」，不是原始标签 ─────────────────────
 * 实测 2000 成员、50 候选（探针数据见 SimilarMembersService 文件末）：
 *   建索引              11.80 ms  ← 贵，必须缓存
 *   单次召回             0.546 ms  ← 便宜，与候选数成正比
 *   重排 @ 每候选重归一    0.244 ms ← 归一化占了重排的 94%
 *   重排 @ 预计算 Set     0.016 ms ← 15×
 * 所以缓存条目里放 canonicalizeTags 的结果，重排只做集合求交。
 * 若缓存原始标签、每次重排再归一，缓存只省下 11.8 ms，却把 0.244 ms 的
 * 归一化成本留在每次请求里——那才是热路径上的那一块。
 *
 * ── 失效策略：写入显式失效 + TTL 兜底 ─────────────────────────────
 * 主路径是 invalidate()，由路由在改自填标签 / 重建画像后调用。但它依赖调用方
 * 记得调用，漏一处就会长期返回陈旧相似度；因此叠加 TTL 兜底，把最坏情况从
 * 「永久陈旧」降级为「最多陈旧 TTL」。
 *
 * 反过来也成立：不能只靠 TTL。用户写完标签立刻看相似成员，应当在 TTL 窗口内
 * 就看到新标签生效，而不是等窗口滑过去——所以显式失效是主路径。
 *
 * 只依赖 CommunityRepository Port；不认识 socket / http（D3/D4）。
 */
import { buildTagIndex, canonicalizeTags } from '../../domain/community/tagRecall.js';

/** 缓存 TTL（毫秒）。兜底而非主路径，见文件头。 */
export const SIMILAR_MEMBERS_CACHE_TTL_MS = 60 * 1000;

/**
 * 把一行仓储结果折成索引条目；不可用返回 null 由调用方跳过。
 *
 * 字段防御（userId 非空、标签可用）是数据形状的事，与「建两次索引」的编排
 * 无关；抽出来后索引构建的复杂度只剩装配。
 *
 * @param {object} row
 * @returns {{userId:string, nickname:string, avatarUrl:string, tags:string[], canonical:Set<string>}|null}
 */
function toIndexEntry(row) {
  const userId = String(row?.userId ?? '');
  if (userId.length === 0) return null;

  const canonical = new Set(canonicalizeTags(row?.tags));
  // 无可用标签的成员不进索引：召回层按共享标签建桶，它也召不到这种人
  if (canonical.size === 0) return null;

  return {
    userId,
    nickname: typeof row.nickname === 'string' ? row.nickname : '',
    avatarUrl: typeof row.avatarUrl === 'string' ? row.avatarUrl : '',
    tags: [...canonical],
    canonical,
  };
}

/**
 * @param {object} deps
 * @param {{listMembersWithTags?: () => Array<object>}} deps.communityRepository
 * @param {{warn?: Function}} [deps.logger]
 * @param {number} [deps.ttlMs]
 */
export function createTagIndexCache({ communityRepository, logger, ttlMs } = /** @type {any} */ ({})) {
  const repo = communityRepository;
  // 先做 typeof 收窄再比较：ttlMs 可能是 undefined，直接 Number.isFinite(ttlMs) 在
  // tsc 下不构成窄化（它接受 unknown，但入参声明是 number|undefined）
  const ttl = typeof ttlMs === 'number' && Number.isFinite(ttlMs) && ttlMs >= 0
    ? ttlMs
    : SIMILAR_MEMBERS_CACHE_TTL_MS;

  /**
   * @type {{index: Map<string, string[]>, members: Map<string, {userId:string, nickname:string, avatarUrl:string, tags:string[], canonical:Set<string>}>, builtAt: number, size: number}|null}
   */
  let cache = null;

  /**
   * 重建缓存。仓储读失败不抛出：相似成员是增强功能，读不到就返回空，
   * 不该让一个附带查询把整个社区页拖红（与 ClusterService 的 RC2 降级同调）。
   * @returns {typeof cache}
   */
  function rebuild() {
    let rows;
    try {
      rows = typeof repo.listMembersWithTags === 'function' ? repo.listMembersWithTags() : [];
    } catch (e) {
      logger?.warn?.({ component: 'community', err: e?.message }, 'listMembersWithTags failed, similarity degraded');
      return null;
    }

    /** @type {Map<string, any>} */
    const members = new Map();
    const indexInput = [];
    for (const row of Array.isArray(rows) ? rows : []) {
      const entry = toIndexEntry(row);
      if (entry === null) continue;
      members.set(entry.userId, entry);
      // 只喂键：标签已在 toIndexEntry 里归一过，索引层再归一一次是无谓的重复
      indexInput.push({ id: entry.userId, tags: entry.tags });
    }

    return { index: buildTagIndex(indexInput), members, builtAt: Date.now(), size: members.size };
  }

  /** 惰性取缓存：无缓存或已过 TTL 则重建。 */
  function snapshot() {
    if (cache === null || Date.now() - cache.builtAt > ttl) cache = rebuild();
    return cache;
  }

  /**
   * 显式失效。改自填标签 / 重建画像后必须调用——见文件头「失效策略」。
   * 幂等：连续调用只是把缓存置空。
   */
  function invalidate() {
    cache = null;
  }

  return { snapshot, invalidate };
}
