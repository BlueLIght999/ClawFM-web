import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { startRecurringTasks } from '../socket/recurringTasks.js';

describe('M3: recurringTasks — interval tracking + error handling', () => {
  let mockDeps;

  beforeEach(() => {
    vi.useFakeTimers();
    mockDeps = {
      scheduler: { getPlaybackPosition: vi.fn(() => ({ elapsed: 0, duration: 0, isPlaying: false })) },
      queue: { needsMore: vi.fn(() => false), upcomingSongs: [] },
      recommender: { fillQueue: vi.fn().mockResolvedValue([]) },
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
});
