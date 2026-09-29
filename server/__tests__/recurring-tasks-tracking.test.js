import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { startRecurringTasks } from '../socket/recurringTasks.js';

describe('M3: recurringTasks — interval tracking + error handling', () => {
  let mockDeps;

  beforeEach(() => {
    vi.useFakeTimers();
    mockDeps = {
      scheduler: { getPlaybackPosition: vi.fn(() => ({ elapsed: 0, duration: 0, isPlaying: false })) },
      queue: { needsMore: vi.fn(() => false), upcomingSongs: [] },
      recommender: { fillQueue: vi.fn().mockResolvedValue([]), setPlanBlocks: vi.fn() },
      getPlan: vi.fn(() => null),
      generatePlan: vi.fn().mockResolvedValue({ blocks: [] }),
      getTimeOfDayMood: vi.fn(() => 'morning'),
      maybeProactiveSpeech: vi.fn().mockResolvedValue(null),
      eventPublisher: {},
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('returns an object with stop() method', () => {
    const tasks = startRecurringTasks({ emit: vi.fn() }, mockDeps);

    expect(tasks).toBeDefined();
    expect(typeof tasks.stop).toBe('function');
  });

  test('stop() clears all intervals — no more callbacks fire', () => {
    const io = { emit: vi.fn() };
    const tasks = startRecurringTasks(io, mockDeps);

    // Advance to trigger callbacks
    vi.advanceTimersByTime(5000);
    expect(io.emit).toHaveBeenCalled();

    // Stop and verify no more callbacks
    const callCountBefore = io.emit.mock.calls.length;
    tasks.stop();

    vi.advanceTimersByTime(120000);
    expect(io.emit.mock.calls.length).toBe(callCountBefore);
  });

  test('playback position error does not crash — caught and logged', () => {
    mockDeps.scheduler.getPlaybackPosition = vi.fn(() => { throw new Error('playback error'); });
    const io = { emit: vi.fn() };

    startRecurringTasks(io, mockDeps);

    // Should not throw unhandled
    expect(() => vi.advanceTimersByTime(5000)).not.toThrow();
    expect(mockDeps.logger.error).toHaveBeenCalled();
  });

  test('queue refill error does not crash — caught and logged', async () => {
    mockDeps.queue.needsMore = vi.fn(() => true);
    mockDeps.recommender.fillQueue = vi.fn().mockRejectedValue(new Error('refill error'));
    const io = { emit: vi.fn() };

    startRecurringTasks(io, mockDeps);

    // Advance and flush async
    await vi.advanceTimersByTimeAsync(30000);

    expect(mockDeps.logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ component: 'recurring' }),
      expect.any(String),
    );
  });

  test('F3: clusterService.runClustering runs once at startup (RC2: failure degrades, never throws)', async () => {
    mockDeps.clusterService = { runClustering: vi.fn(() => ({ k: 2, degraded: false })) };
    const io = { emit: vi.fn() };

    startRecurringTasks(io, mockDeps);
    // 启动时是 Promise.resolve().then(...) — 需要flush微任务
    await vi.advanceTimersByTimeAsync(0);

    expect(mockDeps.clusterService.runClustering).toHaveBeenCalledTimes(1);
    expect(mockDeps.logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ component: 'cluster' }),
      'startup clustering done',
    );
  });

  test('F3: clusterService runs every 6h', async () => {
    mockDeps.clusterService = { runClustering: vi.fn(() => ({ k: 0, degraded: false })) };
    const io = { emit: vi.fn() };

    startRecurringTasks(io, mockDeps);
    await vi.advanceTimersByTimeAsync(0);
    const startupCalls = mockDeps.clusterService.runClustering.mock.calls.length;

    // 推进 6h 应触发一次
    await vi.advanceTimersByTimeAsync(6 * 60 * 60 * 1000);
    expect(mockDeps.clusterService.runClustering.mock.calls.length).toBe(startupCalls + 1);

    // 再推进 6h 又一次
    await vi.advanceTimersByTimeAsync(6 * 60 * 60 * 1000);
    expect(mockDeps.clusterService.runClustering.mock.calls.length).toBe(startupCalls + 2);
  });

  test('F3: clusterService missing — recurringTasks still works (no crash)', () => {
    const io = { emit: vi.fn() };
    expect(() => startRecurringTasks(io, mockDeps)).not.toThrow();
    vi.advanceTimersByTime(5000);
    expect(io.emit).toHaveBeenCalled();
  });

  test('F3: clusterService.runClustering throws — caught and logged, radio keeps running', async () => {
    mockDeps.clusterService = { runClustering: vi.fn(() => { throw new Error('cluster boom'); }) };
    const io = { emit: vi.fn() };

    startRecurringTasks(io, mockDeps);
    await vi.advanceTimersByTimeAsync(0);

    expect(mockDeps.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ component: 'cluster' }),
      'startup clustering failed',
    );
    // Radio recurring tasks still fire
    vi.advanceTimersByTime(5000);
    expect(io.emit).toHaveBeenCalled();
  });

  // ── 60s 巡检合并后的隔离性 ─────────────────────────────────────
  // 情绪刷新与主动播报原是两个独立的 60s interval，合并成一个 tick 后
  // 它们共用一个回调。两条路径必须仍各自 try/catch：任一条抛错都不能
  // 让另一条静默停摆——那正是合并最容易引入的回归。
  describe('60s tick 内部隔离', () => {
    test('情绪刷新失败时主动播报仍然执行', async () => {
      mockDeps.getTimeOfDayMood = vi.fn(() => { throw new Error('mood boom'); });
      const io = { emit: vi.fn() };

      startRecurringTasks(io, mockDeps);
      await vi.advanceTimersByTimeAsync(60000);

      expect(mockDeps.logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ component: 'scheduler' }),
        'mood refresh failed',
      );
      expect(mockDeps.maybeProactiveSpeech).toHaveBeenCalledTimes(1);
    });

    test('主动播报失败时情绪刷新仍然执行', async () => {
      // 让情绪刷新真正进入分支：7 点 + 情绪变化
      vi.setSystemTime(new Date(2026, 0, 1, 7, 0, 0));
      mockDeps.maybeProactiveSpeech = vi.fn().mockRejectedValue(new Error('speech boom'));
      const io = { emit: vi.fn() };

      startRecurringTasks(io, mockDeps);
      await vi.advanceTimersByTimeAsync(60000);

      expect(mockDeps.logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ component: 'proactive' }),
        'error',
      );
      // 情绪刷新先于播报执行，其日志必须已经打出
      expect(mockDeps.logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ component: 'scheduler' }),
        'mood shift, refreshing',
      );
    });

    test('两条路径都不抛错时，60s 只触发一次播报（未合并成两次）', async () => {
      const io = { emit: vi.fn() };

      startRecurringTasks(io, mockDeps);
      await vi.advanceTimersByTimeAsync(60000);

      expect(mockDeps.maybeProactiveSpeech).toHaveBeenCalledTimes(1);
    });

    test('60s tick 不会在 30s 时提前触发播报', async () => {
      const io = { emit: vi.fn() };

      startRecurringTasks(io, mockDeps);
      await vi.advanceTimersByTimeAsync(30000);

      expect(mockDeps.maybeProactiveSpeech).not.toHaveBeenCalled();
    });

    test('stop() 之后 60s tick 不再触发任何一条路径', async () => {
      const io = { emit: vi.fn() };
      const tasks = startRecurringTasks(io, mockDeps);

      await vi.advanceTimersByTimeAsync(60000);
      const speechCalls = mockDeps.maybeProactiveSpeech.mock.calls.length;

      tasks.stop();
      await vi.advanceTimersByTimeAsync(600000);

      expect(mockDeps.maybeProactiveSpeech.mock.calls.length).toBe(speechCalls);
    });

    test('情绪刷新日志的 from 是变化前的值，不是变化后的', async () => {
      // 重构时曾把 lastMood = currentMood 写在 log 之前，
      // 于是 from 与 to 永远相同，日志失去全部诊断价值。
      vi.setSystemTime(new Date(2026, 0, 1, 7, 0, 0));
      const io = { emit: vi.fn() };

      startRecurringTasks(io, mockDeps);
      await vi.advanceTimersByTimeAsync(60000);

      expect(mockDeps.logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ component: 'scheduler', from: '', to: 'morning' }),
        'mood shift, refreshing',
      );
    });

    test('同一情绪在 7 点只刷新一次，不会每个 tick 重刷', async () => {
      vi.setSystemTime(new Date(2026, 0, 1, 7, 0, 0));
      const io = { emit: vi.fn() };

      startRecurringTasks(io, mockDeps);
      await vi.advanceTimersByTimeAsync(300000); // 7:00 → 7:05，五个 tick

      expect(mockDeps.generatePlan).toHaveBeenCalledTimes(1);
    });

    test('generatePlan 失败时不发 PLAN_UPDATE，也不影响播报', async () => {
      vi.setSystemTime(new Date(2026, 0, 1, 7, 0, 0));
      mockDeps.generatePlan = vi.fn().mockRejectedValue(new Error('plan boom'));
      const io = { emit: vi.fn() };

      startRecurringTasks(io, mockDeps);
      await vi.advanceTimersByTimeAsync(60000);

      expect(io.emit).not.toHaveBeenCalledWith('plan:update', expect.anything());
      expect(mockDeps.recommender.setPlanBlocks).not.toHaveBeenCalled();
      expect(mockDeps.maybeProactiveSpeech).toHaveBeenCalledTimes(1);
    });

    test('plan 生成成功但通知失败，日志标注为 notify failed', async () => {
      vi.setSystemTime(new Date(2026, 0, 1, 7, 0, 0));
      mockDeps.recommender.setPlanBlocks = vi.fn(() => { throw new Error('notify boom'); });
      const io = { emit: vi.fn() };

      startRecurringTasks(io, mockDeps);
      await vi.advanceTimersByTimeAsync(60000);

      expect(mockDeps.logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ component: 'scheduler' }),
        'mood refresh notify failed',
      );
      // 播报不受影响
      expect(mockDeps.maybeProactiveSpeech).toHaveBeenCalledTimes(1);
    });

    test('情绪读取抛错时播报不被吞掉（外层兜底）', async () => {
      // refreshMoodIfDue 的取情绪一步在任何 try 之外，
      // 合并后它挡在播报前面，必须由 tick 外层兜住。
      mockDeps.getTimeOfDayMood = vi.fn(() => { throw new Error('mood read boom'); });
      const io = { emit: vi.fn() };

      startRecurringTasks(io, mockDeps);
      await vi.advanceTimersByTimeAsync(60000);

      expect(mockDeps.maybeProactiveSpeech).toHaveBeenCalledTimes(1);
    });
  });
});
