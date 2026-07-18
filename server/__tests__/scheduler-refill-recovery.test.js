import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../services/queue.js', () => ({
  queue: {
    isEmpty: false,
    hasCurrent: true,
    current: null,
    upcomingSongs: [],
    length: 0,
    mode: 'normal',
    advance: vi.fn(() => null),
    goBack: vi.fn(() => null),
    persist: vi.fn(),
    peek: vi.fn(() => null),
  },
}));

import { queue } from '../services/queue.js';
import { RadioScheduler } from '../services/scheduler.js';

describe('C1: _advanceToNext triggers refill when queue exhausted', () => {
  let scheduler;
  let mockMusic;
  let mockListenHistory;
  let refillProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});

    mockMusic = {
      scrobble: vi.fn().mockResolvedValue(undefined),
      songUrl: vi.fn().mockResolvedValue('http://audio.mp3'),
    };
    mockListenHistory = { record: vi.fn() };
    refillProvider = vi.fn().mockResolvedValue([{ id: 'refill1' }, { id: 'refill2' }]);

    scheduler = new RadioScheduler({ music: mockMusic, listenHistory: mockListenHistory });
    scheduler.onStateChange = vi.fn();
    scheduler.onSongChange = vi.fn().mockResolvedValue(undefined);
    scheduler.refillProvider = refillProvider;
  });

  it('triggers refillProvider when queue.advance returns null', async () => {
    const song = { id: 's1', dt: 180000 };
    await scheduler._startSong(song);

    queue.advance.mockReturnValueOnce(null);
    queue.length = 0;

    await scheduler._advanceToNext();

    expect(refillProvider).toHaveBeenCalled();
  });

  it('starts playing first refilled song after refill', async () => {
    const song = { id: 's1', dt: 180000 };
    await scheduler._startSong(song);

    queue.advance.mockReturnValueOnce(null);
    queue.length = 0;
    // After refill, queue.advance returns the refilled song
    queue.advance.mockReturnValueOnce({ id: 'refill1', dt: 200000 });

    await scheduler._advanceToNext();

    expect(scheduler.currentSong).toEqual({ id: 'refill1', dt: 200000 });
    expect(scheduler.isPlaying).toBe(true);
  });

  it('stops gracefully when refill returns empty array', async () => {
    const song = { id: 's1', dt: 180000 };
    await scheduler._startSong(song);

    queue.advance.mockReturnValueOnce(null);
    queue.length = 0;
    refillProvider.mockResolvedValueOnce([]);

    await scheduler._advanceToNext();

    // Should not crash, should notify state
    expect(scheduler.onStateChange).toHaveBeenCalled();
  });

  it('logs R1 warning when refill returns empty', async () => {
    const warnSpy = vi.spyOn(console, 'warn');
    const song = { id: 's1', dt: 180000 };
    await scheduler._startSong(song);

    queue.advance.mockReturnValueOnce(null);
    queue.length = 0;
    refillProvider.mockResolvedValueOnce([]);

    await scheduler._advanceToNext();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('refill'),
    );
  });
});

describe('C2: skip with empty queue triggers refill before stopping', () => {
  let scheduler;
  let mockMusic;
  let mockListenHistory;
  let refillProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});

    mockMusic = {
      scrobble: vi.fn().mockResolvedValue(undefined),
      songUrl: vi.fn().mockResolvedValue('http://audio.mp3'),
    };
    mockListenHistory = { record: vi.fn() };
    refillProvider = vi.fn().mockResolvedValue([{ id: 'refill1', dt: 200000 }]);

    scheduler = new RadioScheduler({ music: mockMusic, listenHistory: mockListenHistory });
    scheduler.onStateChange = vi.fn();
    scheduler.onSongChange = vi.fn().mockResolvedValue(undefined);
    scheduler.refillProvider = refillProvider;
  });

  it('triggers refill when skip exhausts queue', async () => {
    const song = { id: 's1', dt: 180000 };
    await scheduler._startSong(song);

    queue.advance.mockReturnValueOnce(null);
    queue.length = 0;
    // After refill
    queue.advance.mockReturnValueOnce({ id: 'refill1', dt: 200000 });

    await scheduler.skip();

    expect(refillProvider).toHaveBeenCalled();
    expect(scheduler.currentSong).toEqual({ id: 'refill1', dt: 200000 });
    expect(scheduler.isPlaying).toBe(true);
  });

  it('stops when refill also returns empty', async () => {
    const song = { id: 's1', dt: 180000 };
    await scheduler._startSong(song);

    queue.advance.mockReturnValueOnce(null);
    queue.length = 0;
    refillProvider.mockResolvedValueOnce([]);

    await scheduler.skip();

    expect(scheduler.currentSong).toBeNull();
    expect(scheduler.isPlaying).toBe(false);
  });
});
