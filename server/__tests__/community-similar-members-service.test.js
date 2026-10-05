import { describe, expect, it, vi } from 'vitest';
import {
  createSimilarMembersService,
  SIMILAR_MEMBERS_DEFAULT_LIMIT,
} from '../application/services/SimilarMembersService.js';
import { SIMILAR_MEMBERS_CACHE_TTL_MS } from '../application/services/TagIndexCache.js';

/**
 * 造一个只实现相似成员所需方法的仓储替身。
 * @param {object} opts
 * @param {Array<{userId:string, nickname?:string, avatarUrl?:string, tags:string[]}>} opts.members
 * @param {object|null} [opts.profile] getProfile 的返回值（服务不该读它，见同源用例）
 * @param {Error} [opts.throws] 让 listMembersWithTags 抛出
 */
function makeRepo({ members = [], profile = null, throws = null } = {}) {
  return {
    listMembersWithTags: () => {
      if (throws) throw throws;
      return members;
    },
    getProfile: () => profile,
    getMember: (userId) => {
      const row = members.find((m) => m.userId === userId);
      return row ? { userId, selfTags: row.tags } : null;
    },
  };
}

function makeService(repo, opts = {}) {
  return createSimilarMembersService({ communityRepository: repo, ...opts });
}

describe('SimilarMembersService.findSimilar', () => {
  it('ranks a narrow high-overlap member above a broad low-overlap one', () => {
    // 召回按共享个数召回，重排按比例——「2 里共享 2」必须排在「50 里共享 2」之前，
    // 这正是两段式存在的理由：只按 sharedCount 排会把后者排前面。
    const repo = makeRepo({
      members: [
        { userId: 'me', tags: ['后摇', '爵士'] },
        { userId: 'narrow', tags: ['后摇', '爵士'] },
        {
          userId: 'broad',
          tags: ['后摇', '爵士', ...Array.from({ length: 48 }, (_, i) => `填充${i}`)],
        },
      ],
    });
    const { candidates } = makeService(repo).findSimilar({ userId: 'me' });

    expect(candidates.map((c) => c.userId)).toEqual(['narrow', 'broad']);
    expect(candidates[0].score).toBe(1);
    expect(candidates[1].score).toBeCloseTo(2 / 50, 2);
  });

  it('excludes the caller from their own results', () => {
    const repo = makeRepo({
      members: [{ userId: 'me', tags: ['后摇'] }],
    });
    const res = makeService(repo).findSimilar({ userId: 'me' });
    expect(res.candidates).toEqual([]);
    expect(res.hasTags).toBe(true);
  });

  it('reports hasTags=false when the caller has no tags at all', () => {
    // false 与「有标签但没人相似」是不同的前端状态：前者引导去填标签，后者原样展示空列表
    const repo = makeRepo({ members: [{ userId: 'other', tags: ['后摇'] }] });
    const res = makeService(repo).findSimilar({ userId: 'me' });
    expect(res).toEqual({ userId: 'me', hasTags: false, candidates: [] });
  });

  it('reports hasTags=true with an empty list when nobody shares a tag', () => {
    const repo = makeRepo({
      members: [
        { userId: 'me', tags: ['后摇'] },
        { userId: 'other', tags: ['电音'] },
      ],
    });
    const res = makeService(repo).findSimilar({ userId: 'me' });
    expect(res.hasTags).toBe(true);
    expect(res.candidates).toEqual([]);
  });

  it('returns canonical keys as sharedTags', () => {
    const repo = makeRepo({
      members: [{ userId: 'me', tags: ['后摇'] }, { userId: 'other', tags: ['后摇'] }],
    });
    const { candidates } = makeService(repo).findSimilar({ userId: 'me' });
    expect(candidates).toHaveLength(1);
    // sharedTags 给的是归一键（召回层的桶键），不是用户原样写的写法
    expect(candidates[0].sharedTags).toEqual(['postrock']);
  });

  it('reads the caller tags from the same snapshot as the candidates, not from the profile', () => {
    // 查询侧与候选侧必须同源：此前查询侧优先读 profile.userTags，画像重建失败时
    // 它是旧标签，而候选侧读的是新 self_tags，两边按不同的标签集合算相似度。
    const repo = makeRepo({
      profile: { userTags: ['电音'] }, // 过时的画像标签：必须被忽略
      members: [
        { userId: 'me', tags: ['后摇'] },
        { userId: 'postrock-fan', tags: ['后摇'] },
        { userId: 'edm-fan', tags: ['电音'] },
      ],
    });
    const { candidates } = makeService(repo).findSimilar({ userId: 'me' });
    expect(candidates.map((c) => c.userId)).toEqual(['postrock-fan']);
  });

  it('does no per-request repository read once the index is cached', () => {
    // 查询方标签从快照取，不再每次请求读 getProfile/getMember
    const repo = makeRepo({
      members: [{ userId: 'me', tags: ['后摇'] }, { userId: 'o', tags: ['后摇'] }],
    });
    const getProfile = vi.fn(repo.getProfile);
    const getMember = vi.fn(repo.getMember);
    const svc = makeService({ ...repo, getProfile, getMember });
    svc.findSimilar({ userId: 'me' });
    svc.findSimilar({ userId: 'me' });
    expect(getProfile).not.toHaveBeenCalled();
    expect(getMember).not.toHaveBeenCalled();
  });

  it('matches through synonym folding, not literal string equality', () => {
    // 「爵士」与「Jazz」同桶：判等来源与召回层同源（都走 canonicalizeTags）
    const repo = makeRepo({
      members: [{ userId: 'me', tags: ['Jazz'] }, { userId: 'other', tags: ['爵士'] }],
    });
    const { candidates } = makeService(repo).findSimilar({ userId: 'me' });
    expect(candidates.map((c) => c.userId)).toEqual(['other']);
  });

  it('skips members with no usable tags', () => {
    const repo = makeRepo({
      members: [
        { userId: 'me', tags: ['后摇'] },
        { userId: 'empty', tags: ['   '] },
        { userId: 'good', tags: ['后摇'] },
      ],
    });
    const { candidates } = makeService(repo).findSimilar({ userId: 'me' });
    expect(candidates.map((c) => c.userId)).toEqual(['good']);
  });

  it('skips rows with an empty userId', () => {
    const repo = makeRepo({
      members: [{ userId: 'me', tags: ['后摇'] }, { userId: '', tags: ['后摇'] }, { userId: 'good', tags: ['后摇'] }],
    });
    const { candidates } = makeService(repo).findSimilar({ userId: 'me' });
    expect(candidates.map((c) => c.userId)).toEqual(['good']);
  });

  it('breaks score ties by userId so the order is stable across calls', () => {
    // 只按分数排时同分先后由 Map 插入序决定，会随仓储返回顺序抖动
    const members = [
      { userId: 'me', tags: ['后摇'] },
      { userId: 'zeta', tags: ['后摇'] },
      { userId: 'alpha', tags: ['后摇'] },
      { userId: 'mid', tags: ['后摇'] },
    ];
    const forward = makeService(makeRepo({ members })).findSimilar({ userId: 'me' });
    const reversed = makeService(makeRepo({ members: [...members].reverse() })).findSimilar({ userId: 'me' });

    expect(forward.candidates.map((c) => c.userId)).toEqual(['alpha', 'mid', 'zeta']);
    expect(reversed.candidates.map((c) => c.userId)).toEqual(['alpha', 'mid', 'zeta']);
  });

  it('degrades to an empty list when the repository read throws', () => {
    // 相似成员是增强功能，仓储读失败不该把整个社区页拖红
    const warn = vi.fn();
    // 快照不在场时回退读成员行，只为如实报告 hasTags
    const repo = {
      ...makeRepo({ throws: new Error('db is locked') }),
      getMember: () => ({ userId: 'me', selfTags: ['后摇'] }),
    };
    const res = makeService(repo, { logger: { warn } }).findSimilar({ userId: 'me' });

    expect(res).toEqual({ userId: 'me', hasTags: true, candidates: [] });
    expect(warn).toHaveBeenCalledOnce();
  });
});

describe('SimilarMembersService limit handling', () => {
  const members = [
    { userId: 'me', tags: ['后摇'] },
    ...Array.from({ length: 5 }, (_, i) => ({ userId: `u${i}`, tags: ['后摇'] })),
  ];

  /** @param {unknown} limit @returns {number} 候选数 */
  function withLimit(limit) {
    const repo = makeRepo({ members });
    return makeService(repo).findSimilar({ userId: 'me', limit }).candidates.length;
  }

  it('applies an explicit limit', () => {
    expect(withLimit(2)).toBe(2);
  });

  it('caps the limit at the default instead of trusting the query string', () => {
    // 响应体大小是硬上限，不随查询串放大：候选数超过默认值时也要被截回默认值
    const many = Array.from({ length: SIMILAR_MEMBERS_DEFAULT_LIMIT + 10 }, (_, i) => ({
      userId: `x${i}`, tags: ['后摇'],
    }));
    const repo = makeRepo({
      members: [{ userId: 'me', tags: ['后摇'] }, ...many],
    });
    const svc = makeService(repo);
    expect(svc.findSimilar({ userId: 'me' }).candidates).toHaveLength(SIMILAR_MEMBERS_DEFAULT_LIMIT);
    expect(svc.findSimilar({ userId: 'me', limit: 9999 }).candidates).toHaveLength(SIMILAR_MEMBERS_DEFAULT_LIMIT);
  });

  it('falls back to the default for garbage limits rather than erroring', () => {
    // limit 来自查询串，写错一个字符不该把整页打成错误
    expect(withLimit('abc')).toBe(5);
    expect(withLimit(-1)).toBe(5);
    expect(withLimit(undefined)).toBe(5);
    expect(withLimit(NaN)).toBe(5);
  });

  it('treats limit=0 as an explicit empty page', () => {
    expect(withLimit(0)).toBe(0);
  });

  it('floors a fractional limit', () => {
    expect(withLimit(2.9)).toBe(2);
  });
});

describe('SimilarMembersService caching', () => {
  it('serves repeat calls from the cached index', () => {
    // 建索引是这条路径上最贵的一步（实测 2000 成员 11.8ms vs 单次召回 0.5ms）
    const repo = makeRepo({
      members: [{ userId: 'me', tags: ['后摇'] }, { userId: 'o', tags: ['后摇'] }],
    });
    let reads = 0;
    const counting = { ...repo, listMembersWithTags: () => { reads += 1; return repo.listMembersWithTags(); } };
    const svc = makeService(counting);

    svc.findSimilar({ userId: 'me' });
    svc.findSimilar({ userId: 'me' });
    svc.findSimilar({ userId: 'me' });

    expect(reads).toBe(1);
  });

  it('rebuilds after invalidate so a fresh tag write takes effect immediately', () => {
    // 显式失效是主路径：TTL 是兜底，不能让用户等 60s 才看到自己刚写的标签
    const repo = makeRepo({
      members: [{ userId: 'me', tags: ['后摇'] }, { userId: 'o', tags: ['后摇'] }],
    });
    const svc = makeService(repo);
    expect(svc.findSimilar({ userId: 'me' }).candidates).toHaveLength(1);

    // 模拟写入后缓存失效 + 索引内容变化
    repo.listMembersWithTags = () => [{ userId: 'me', tags: ['后摇'] }, { userId: 'o', tags: ['后摇'] }, { userId: 'p', tags: ['后摇'] }];
    svc.invalidate();

    expect(svc.findSimilar({ userId: 'me' }).candidates).toHaveLength(2);
  });

  it('invalidate is idempotent', () => {
    const repo = makeRepo({ members: [{ userId: 'me', tags: ['后摇'] }] });
    const svc = makeService(repo);
    svc.invalidate();
    svc.invalidate();
    expect(svc.findSimilar({ userId: 'me' }).hasTags).toBe(true);
  });

  it('rebuilds once the ttl has elapsed', () => {
    // 推进假时钟而不是依赖真实等待：ttlMs=0 时两次调用可能落在同一毫秒内，
    // 那样过期判定靠的是挂钟巧合，测试会随机地过或不过。
    vi.useFakeTimers();
    try {
      const repo = makeRepo({
          members: [{ userId: 'me', tags: ['后摇'] }, { userId: 'o', tags: ['后摇'] }],
      });
      let reads = 0;
      const counting = { ...repo, listMembersWithTags: () => { reads += 1; return repo.listMembersWithTags(); } };
      const svc = makeService(counting, { ttlMs: 1000 });

      svc.findSimilar({ userId: 'me' });
      expect(reads).toBe(1);
      vi.advanceTimersByTime(999);
      svc.findSimilar({ userId: 'me' });
      expect(reads).toBe(1); // 窗口内仍走缓存
      vi.advanceTimersByTime(2); // 越过 TTL
      svc.findSimilar({ userId: 'me' });
      expect(reads).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('honours a custom ttl over the module default', () => {
    expect(SIMILAR_MEMBERS_CACHE_TTL_MS).toBe(60 * 1000);
    const repo = makeRepo({ members: [{ userId: 'me', tags: ['后摇'] }] });
    const svc = makeService(repo, { ttlMs: 5 });
    expect(svc.findSimilar({ userId: 'me' }).hasTags).toBe(true);
  });
});
