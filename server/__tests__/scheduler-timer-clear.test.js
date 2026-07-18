import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../services/queue.js', () => ({
  queue: {
    isEmpty: false, hasCurrent: true, current: null,
    upcomingSongs: [], length: 0, mode: 'normal',
    advance: vi.fn(() => null), goBack: vi.fn(() => null), persist: vi.fn(),
  },
}));

import { queue } from '../services/queue.js';
import { RadioScheduler } from '../services/scheduler.js';

describe('H3: transitionTimer cleared before overwrite in _startSong', () => {
  let scheduler;
  let mockMusic;
  let mockListenHistory;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});

    mockMusic = {
      scrobble: vi.fn().mockResolvedValue(undefined),
      songUrl: vi.fn().mockResolvedValue('http://audio.mp3'),
    };
    mockListenHistory = { record: vi.fn() };

    scheduler = new RadioScheduler({ music: mockMusic, listenHistory: mockListenHistory });
    scheduler.onStateChange = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('clears existing transitionTimer before setting new one', async () => {
    // Start first song (sets a transition timer)
    const song1 = { id: 's1', dt: 180000 };
    await scheduler._startSong(song1);
    const firstTimer = scheduler.playhead.transitionTimer;
    expect(firstTimer).not.toBeNull();

    // Spy on clearTimeout
    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');

    // Start second song (should clear first timer before setting new one)
    const song2 = { id: 's2', dt: 200000 };
    await scheduler._startSong(song2);

    expect(clearTimeoutSpy).toHaveBeenCalledWith(firstTimer);
  });

  it('does not fire old transition timer after _startSong overwrite', async () => {
    const onSongEndingSpy = vi.spyOn(scheduler, '_onSongEnding');

    // Start first song with short duration
    const song1 = { id: 's1', dt: 10000 }; // 10s, transition at ~3.5s
    await scheduler._startSong(song1);

    // Start second song with longer duration
    const song2 = { id: 's2', dt: 300000 };
    await scheduler._startSong(song2);

    // Advance past the first song's transition point
    vi.advanceTimersByTime(4000);

    // The old timer should NOT have fired
    // _onSongEnding would have been called once for the active timer at ~293.5s, not 3.5s
    expect(onSongEndingSpy).not.toHaveBeenCalled();
  });

  it('handles null transitionTimer gracefully when starting song', async () => {
    scheduler.playhead.transitionTimer = null;
    const song = { id: 's1', dt: 180000 };
    await expect(scheduler._startSong(song)).resolves.toBeUndefined();
    expect(scheduler.playhead.transitionTimer).not.toBeNull();
  });
});
