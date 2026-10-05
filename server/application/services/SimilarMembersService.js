/**
 * SimilarMembersService — 「和我兴趣相同的成员」用例（application）。
 *
 * 把 domain/community/tagRecall.js 的召回层接成一条真实读路径。此前这层的
 * 实现与测试都完整（tag-recall.test.js 47 例），但生产调用者为零——本服务就是
 * 那个缺失的调用者。
 *
 * 索引的构建与缓存不在本文件：见 ./TagIndexCache.js。拆开是因为两者的变更
 * 原因不同（行形状与失效时机 vs 打分与排序），不是为了行数。
 *
 * 依赖 CommunityRepository Port；不认识 socket / http（D3/D4）。
 */
import { canonicalizeTags, recallByTags } from '../../domain/community/tagRecall.js';
import { createTagIndexCache } from './TagIndexCache.js';

/** 返回候选数上限，同时也是召回的候选上限。取 domain 侧 RECALL_LIMITS.MAX_CANDIDATES 的量级。 */
export const SIMILAR_MEMBERS_DEFAULT_LIMIT = 50;

/**
 * 解析调用方给的 limit。非法值回落默认值（而不是抛或当成 0）：
 * limit 来自查询串，写错一个字符不该把整页打成错误，这与召回层
 * 「负 limit 视为不设上限而非报错」的宽松取向一致。
 * 上界钉在默认值上——这是响应体大小的硬上限，不随查询串放大。
 * @param {unknown} limit
 * @returns {number}
 */
function resolveLimit(limit) {
  const n = Number(limit);
  if (!Number.isFinite(n) || n < 0) return SIMILAR_MEMBERS_DEFAULT_LIMIT;
  return Math.min(Math.floor(n), SIMILAR_MEMBERS_DEFAULT_LIMIT);
}

/**
 * Jaccard 打分：交集 / 并集，只做集合求交（两边的 Set 建缓存时已归一）。
 *
 * 不走 selfTagRules.tagJaccard：后者接收原始标签、内部重新 canonicalize，
 * 在这个位置等于每次请求把候选的标签再归一一遍（实测重排耗时因此是 15 倍，
 * 数据见 TagIndexCache 文件头）。判等规则仍与它同源——两边都只经过
 * tagRecall.canonicalizeTags。
 *
 * @param {Set<string>} queryKeys
 * @param {Set<string>} candidateKeys
 * @returns {number} 0..1
 */
function scoreAgainst(queryKeys, candidateKeys) {
  let inter = 0;
  for (const key of queryKeys) if (candidateKeys.has(key)) inter += 1;
  const union = queryKeys.size + candidateKeys.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * 分数降序、同分按 userId 升序。
 * 二级序不可省：只按分数排时同分候选的先后由 Map 插入序决定，会随仓储返回
 * 顺序抖动，在用户可见的列表上表现为「刷新一次换一批」（与召回层同因）。
 */
function compareByScore(a, b) {
  if (b.score !== a.score) return b.score - a.score;
  if (a.userId === b.userId) return 0;
  return a.userId < b.userId ? -1 : 1;
}

/**
 * 把召回候选折成响应 DTO 并打分。
 * @param {Array<{memberId:string, sharedTags:string[]}>} recalled
 * @param {Map<string, object>} members
 * @param {Set<string>} queryKeys
 */
function rankCandidates(recalled, members, queryKeys) {
  const out = [];
  for (const hit of recalled) {
    const member = members.get(hit.memberId);
    if (!member) continue; // 索引与成员表同源构建，理论上不可达；防御以免抛
    // 三位小数：够排序，又不让响应体被浮点尾巴撑大
    const score = Math.round(scoreAgainst(queryKeys, member.canonical) * 1000) / 1000;
    if (score === 0) continue; // 召回层已保证至少共享一个标签，0 分说明形状不符，当作不可用
    out.push({
      userId: member.userId,
      nickname: member.nickname,
      avatarUrl: member.avatarUrl,
      score,
      sharedTags: hit.sharedTags,
    });
  }
  out.sort(compareByScore);
  return out;
}

/**
 * @param {object} deps
 * @param {{listMembersWithTags?: () => Array<object>, getMember?: (userId:string) => object|null}} deps.communityRepository
 * @param {{warn?: Function}} [deps.logger]
 * @param {number} [deps.ttlMs]
 */
export function createSimilarMembersService({ communityRepository, logger, ttlMs } = /** @type {any} */ ({})) {
  const repo = communityRepository;
  const cache = createTagIndexCache({ communityRepository, logger, ttlMs });

  /**
   * 取查询方自己的归一标签键。
   *
   * 与候选同源：都取自同一份快照里的 self_tags。此前这里优先读 profile.userTags，
   * 画像重建失败时它是旧标签，而候选用的是新 self_tags——两边按不同的标签集合
   * 算相似度。从快照取还顺带省掉每次请求一次读库：快照已在缓存里，且已归一。
   *
   * 快照不在场（仓储读失败）时才回退读成员行，只为如实报告 hasTags；
   * 那种情况下候选本来就为空，这次读库不在热路径上。
   *
   * 不在快照里 ≡ 没有可用标签：toIndexEntry 只把有可用标签的成员放进 members。
   *
   * @param {string} uid
   * @param {{members: Map<string, {canonical: Set<string>}>}|null} snap
   * @returns {Set<string>}
   */
  function ownKeys(uid, snap) {
    if (uid.length === 0) return new Set();
    if (snap !== null) return snap.members.get(uid)?.canonical ?? new Set();
    const member = typeof repo.getMember === 'function' ? repo.getMember(uid) : null;
    return new Set(canonicalizeTags(Array.isArray(member?.selfTags) ? member.selfTags : []));
  }

  /**
   * 找出与 userId 兴趣标签重合度最高的其他成员。
   *
   * 两段式：召回层按倒排索引取「至少共享一个标签」的候选（与成员总数无关），
   * 重排层按 Jaccard 打分——召回给的是共享标签的**个数**，重排给的是**比例**，
   * 于是「2 个里共享 2 个」稳定排在「50 个里共享 2 个」之前。
   *
   * @param {object} input
   * @param {string} input.userId
   * @param {number} [input.limit]
   * @returns {{userId: string, hasTags: boolean, candidates: Array<{userId:string, nickname:string, avatarUrl:string, score:number, sharedTags:string[]}>}}
   */
  function findSimilar({ userId, limit } = /** @type {any} */ ({})) {
    const uid = String(userId ?? '');
    const snap = cache.snapshot();
    const queryKeys = ownKeys(uid, snap);

    // 空结果里区分「自己没有标签」与「有标签但没人相似」——前者前端该引导去填标签，
    // 后者该原样展示空列表。合成一个空数组会把两种状态压成同一种。
    if (queryKeys.size === 0) return { userId: uid, hasTags: false, candidates: [] };
    if (snap === null) return { userId: uid, hasTags: true, candidates: [] };

    // 召回上限固定取 default：Jaccard 按比例排序，先按「共享个数」砍到 limit
    // 会砍掉「共享 1 个但分母很小」的高分候选。
    const recalled = recallByTags({
      tags: [...queryKeys],
      index: snap.index,
      selfId: uid,
      limit: SIMILAR_MEMBERS_DEFAULT_LIMIT,
    });
    const candidates = rankCandidates(recalled, snap.members, queryKeys);
    return { userId: uid, hasTags: true, candidates: candidates.slice(0, resolveLimit(limit)) };
  }

  return { findSimilar, invalidate: cache.invalidate };
}
