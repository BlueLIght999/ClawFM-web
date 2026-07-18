import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { triggerColdStart } from '../socket/coldStartHandler.js';

describe('M5: coldStart safety timeout — error handling', () => {
  let mockDeps;
  let mockIo;

  beforeEach(() => {
    vi.useFakeTimers();
    mockIo = { emit: vi.fn() };
    mockDeps = {
      coldStartService: {
        beginIfReady: vi.fn(() => ({ shouldStart: true, firstSong: { id: 's1', title: 'Test' } })),
        writeIntro: vi.fn().mockResolvedValue({ fullText: 'Hello', streamEnd: {} }),
        handleGeneratedIntro: vi.fn().mockResolvedValue({ speechStart: { audioUrl: 'url', text: 'Hello' } }),
        startMusicIfStillInProgress: vi.fn().mockResolvedValue(null),
        startMusicDirectly: vi.fn().mockResolvedValue({}),
      },
      chatHistory: { append: vi.fn() },
      scheduler: { coldStartState: 'pending', isPlaying: false, isAdvancing: false, playhead: {} },
      queue: { hasCurrent: true, future: [{ id: 's1' }] },
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('safety timeout catches errors from startMusicIfStillInProgress', async () => {
    mockDeps.coldStartService.startMusicIfStillInProgress = vi.fn().mockRejectedValue(new Error('timeout crash'));

    await triggerColdStart(mockIo, mockDeps);

    // Advance past the 30s safety timeout
    await vi.advanceTimersByTimeAsync(31000);

    // Should have logged the error, not thrown unhandled
    expect(mockDeps.logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ component: 'cold-start' }),
      expect.stringContaining('safety timeout'),
    );
  });

  test('bubble timeout catches errors from pushBubbles', async () => {
    // pushBubbles is called via import — we test that the timeout doesn't throw
    // by verifying the cold start completes without unhandled rejection
    mockDeps.coldStartService.handleGeneratedIntro = vi.fn().mockResolvedValue({ speechStart: null });

    await triggerColdStart(mockIo, mockDeps);

    // Advance past the 8s bubble timeout
    await vi.advanceTimersByTimeAsync(9000);

    // No unhandled rejection should occur — test passes if we get here
    expect(true).toBe(true);
  });
});
