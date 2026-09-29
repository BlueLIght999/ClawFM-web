import { describe, test, expect, vi } from 'vitest';
import { ensureQueueDepth, queueNeedsRefill } from '../application/services/QueueDepthService.js';

describe('ensureQueueDepth', () => {
  /** 默认：队列见底、有缓存 plan */
  function makeDeps(overrides = {}) {
    return {
      queue: { needsMore: vi.fn(() => true), upcomingSongs: [] },
      recommender: { fillQueue: vi.fn().mockResolvedValue([]) },
      getPlan: vi.fn(() => ({ plan: { blocks: [{ id: 'b1' }] } })),
      ...overrides,
    };
  }

  test('队列充足时不补歌，返回 null', async () => {
    const deps = makeDeps({ queue: { needsMore: vi.fn(() => false), upcomingSongs: [] } });

    const result = await ensureQueueDepth(deps);

    expect(result).toBeNull();
    expect(deps.recommender.fillQueue).not.toHaveBeenCalled();
  });

  test('队列不足时按默认阈值与补充量补歌', async () => {
    const deps = makeDeps();

    await ensureQueueDepth(deps);

    expect(deps.queue.needsMore).toHaveBeenCalledWith(10);
    expect(deps.recommender.fillQueue).toHaveBeenCalledWith(12, [{ id: 'b1' }]);
  });

  test('阈值与补充量可覆盖', async () => {
    const deps = makeDeps();

    await ensureQueueDepth(deps, { min: 15, fill: 20 });

    expect(deps.queue.needsMore).toHaveBeenCalledWith(15);
    expect(deps.recommender.fillQueue).toHaveBeenCalledWith(20, expect.anything());
  });

  test('无缓存 plan 时传 null 而非 undefined', async () => {
    // fillQueue 的生产实现对 null 有分支，undefined 会走另一条；
    // 必须显式归一化成 null 才能保住原有行为。
    const deps = makeDeps({ getPlan: vi.fn(() => null) });

    await ensureQueueDepth(deps);

    expect(deps.recommender.fillQueue).toHaveBeenCalledWith(12, null);
  });

  test('plan 存在但缺 blocks 时同样归一化为 null', async () => {
    const deps = makeDeps({ getPlan: vi.fn(() => ({ plan: {} })) });

    await ensureQueueDepth(deps);

    expect(deps.recommender.fillQueue).toHaveBeenCalledWith(12, null);
  });

  test('plan 为空数组 blocks 时传空数组，不被当成缺失', async () => {
    // [] 是「有计划但没有区块」，与 null 语义不同，不能合并
    const deps = makeDeps({ getPlan: vi.fn(() => ({ plan: { blocks: [] } })) });

    await ensureQueueDepth(deps);

    expect(deps.recommender.fillQueue).toHaveBeenCalledWith(12, []);
  });

  test('补歌失败时向上抛出，不吞异常', async () => {
    // 调用方决定怎么处理：recurringTasks 记日志，
    // PlaybackService 让 skip() 的 refill promise 自行 reject。
    const deps = makeDeps({
      recommender: { fillQueue: vi.fn().mockRejectedValue(new Error('fill boom')) },
    });

    await expect(ensureQueueDepth(deps)).rejects.toThrow('fill boom');
  });

  test('队列充足时不读 plan（避免无谓的 plan 快照开销）', async () => {
    const deps = makeDeps({ queue: { needsMore: vi.fn(() => false), upcomingSongs: [] } });

    await ensureQueueDepth(deps);

    expect(deps.getPlan).not.toHaveBeenCalled();
  });

  test('返回 fillQueue 的结果，供调用方决定是否使用', async () => {
    const filled = [{ id: 's1' }, { id: 's2' }];
    const deps = makeDeps({ recommender: { fillQueue: vi.fn().mockResolvedValue(filled) } });

    await expect(ensureQueueDepth(deps)).resolves.toEqual(filled);
  });
});

describe('queueNeedsRefill', () => {
  test('把默认阈值 10 传给 needsMore', () => {
    const queue = { needsMore: vi.fn(() => true) };

    expect(queueNeedsRefill({ queue })).toBe(true);
    expect(queue.needsMore).toHaveBeenCalledWith(10);
  });

  test('阈值可覆盖', () => {
    const queue = { needsMore: vi.fn(() => false) };

    expect(queueNeedsRefill({ queue }, { min: 15 })).toBe(false);
    expect(queue.needsMore).toHaveBeenCalledWith(15);
  });

  test('是同步的，不返回 promise', () => {
    // PlaybackService.skip 依赖它同步决定 refill 字段是否保留 promise 形态；
    // 一旦变成 async，队列充足时 refill 就不再是 null。
    const queue = { needsMore: vi.fn(() => true) };

    const result = queueNeedsRefill({ queue });

    expect(result).not.toBeInstanceOf(Promise);
  });
});
