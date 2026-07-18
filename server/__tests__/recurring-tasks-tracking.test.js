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
});
