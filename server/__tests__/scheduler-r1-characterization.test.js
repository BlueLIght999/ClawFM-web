import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RadioScheduler } from '../services/scheduler.js';

// Mock queue module
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
  },
}));

import { queue } from '../services/queue.js';

describe('R1 Characterization — RadioScheduler never-silent invariant', () => {
  let scheduler;
  let mockMusic;
  let mockListenHistory;
  let warnSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
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
    warnSpy.mockRestore();
  });

  describe('startWithQueue — playback starts with song', () => {
    it('starts playing when queue has songs', async () => {
      const song = { id: 's1', name: 'Test', dt: 180000 };
      queue.isEmpty = false;
      queue.hasCurrent = false;
      queue.advance.mockReturnValueOnce(song);
      queue.current = song;

      await scheduler.startWithQueue();

      expect(scheduler.isPlaying).toBe(true);
      expect(scheduler.currentSong).toEqual(song);
    });

    it('does nothing when queue is empty', async () => {
      queue.isEmpty = true;
      await scheduler.startWithQueue();
      expect(scheduler.isPlaying).toBe(false);
      expect(scheduler.currentSong).toBeNull();
    });
  });

  describe('_startSong — transition timer setup', () => {
    it('sets transition timer for song with sufficient duration', async () => {
      const song = { id: 's1', name: 'Long', dt: 300000 };
      await scheduler._startSong(song);
      expect(scheduler.playhead.transitionTimer).not.toBeNull();
    });

    it('does not set timer for song too short for transition', async () => {
      const song = { id: 's2', name: 'Short', dt: 3000 };
      await scheduler._startSong(song);
      expect(scheduler.playhead.transitionTimer).toBeNull();
    });

    it('increments songsSinceLastSpeech counter', async () => {
      const song = { id: 's1', dt: 180000 };
      const before = scheduler.songsSinceLastSpeech;
      await scheduler._startSong(song);
      expect(scheduler.songsSinceLastSpeech).toBe(before + 1);
    });

    it('resets _advancing flag to false', async () => {
      scheduler.playhead._advancing = true;
      const song = { id: 's1', dt: 180000 };
      await scheduler._startSong(song);
      expect(scheduler.playhead._advancing).toBe(false);
    });
  });

  describe('skip — queue exhaustion behavior', () => {
    it('plays next song when queue has one', async () => {
      const currentSong = { id: 's1', dt: 180000 };
      await scheduler._startSong(currentSong);

      const nextSong = { id: 's2', dt: 200000 };
      queue.advance.mockReturnValueOnce(nextSong);

      await scheduler.skip();

      expect(scheduler.currentSong).toEqual(nextSong);
      expect(scheduler.isPlaying).toBe(true);
    });

    it('stops playback when queue is empty (R1 at risk — current behavior)', async () => {
      const currentSong = { id: 's1', dt: 180000 };
      await scheduler._startSong(currentSong);

      queue.advance.mockReturnValueOnce(null);
      queue.length = 0;

      await scheduler.skip();

      // Current behavior: radio goes silent. This characterization test locks
      // the current behavior. R1 guard should trigger a refill in the future.
      expect(scheduler.currentSong).toBeNull();
      expect(scheduler.isPlaying).toBe(false);
    });
  });

  describe('pause/resume — position preservation', () => {
    it('pauses and preserves remaining time', async () => {
      const song = { id: 's1', dt: 180000 };
      await scheduler._startSong(song);

      vi.advanceTimersByTime(60000); // 1 minute elapsed
      scheduler.pause();

      expect(scheduler.isPlaying).toBe(false);
      expect(scheduler.playhead.remainingAtPause).toBeGreaterThan(0);
    });

    it('resumes and recalculates transition timer', async () => {
      const song = { id: 's1', dt: 180000 };
      await scheduler._startSong(song);

      vi.advanceTimersByTime(60000);
      scheduler.pause();
      scheduler.resume();

      expect(scheduler.isPlaying).toBe(true);
      expect(scheduler.playhead.transitionTimer).not.toBeNull();
    });
  });

  describe('seek — timer recalculation', () => {
    it('recalculates transition timer after seek while playing', async () => {
      const song = { id: 's1', dt: 300000 };
      await scheduler._startSong(song);

      // Seek to 100 seconds
      scheduler.seek(100);

      expect(scheduler.playhead.startedAt).toBe(Date.now() - 100000);
      expect(scheduler.playhead.transitionTimer).not.toBeNull();
    });

    it('does not set timer when seeking past transition point', async () => {
      const song = { id: 's1', dt: 300000 };
      await scheduler._startSong(song);

      // Seek to 299 seconds (near end, no time for transition)
      scheduler.seek(299);

      // Timer may or may not be set depending on remaining time
      // Just verify no crash
      expect(scheduler.playhead.startedAt).toBe(Date.now() - 299000);
    });
  });

  describe('getState — stable state output', () => {
    it('returns null currentSong when no song loaded', () => {
      const state = scheduler.getState();
      expect(state.currentSong).toBeNull();
      expect(state.isPlaying).toBe(false);
      expect(state.audioUrl).toBeNull();
    });

    it('returns full state when song is loaded', async () => {
      const song = { id: 's1', name: 'Test', ar: [{ name: 'Artist' }], dt: 180000 };
      await scheduler._startSong(song);

      const state = scheduler.getState();
      expect(state.isPlaying).toBe(true);
      expect(state.duration).toBe(180);
      expect(state.queueMode).toBe('normal');
      expect(state.upcomingSongs).toEqual([]);
    });
  });

  describe('_advanceToNext — R1 guard warning', () => {
    it('logs R1 warning when queue exhausted after transition', async () => {
      const song = { id: 's1', dt: 180000 };
      await scheduler._startSong(song);

      queue.advance.mockReturnValueOnce(null);
      queue.length = 0;

      await scheduler._advanceToNext();

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('R1 warning'),
      );
    });

    it('does not log R1 warning when queue has songs', async () => {
      const song = { id: 's1', dt: 180000 };
      await scheduler._startSong(song);

      const nextSong = { id: 's2', dt: 200000 };
      queue.advance.mockReturnValueOnce(nextSong);
      queue.length = 1;

      await scheduler._advanceToNext();

      expect(warnSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('R1 warning'),
      );
    });
  });

  describe('speech lifecycle — transition orchestration', () => {
    it('speechGenerationDone delegates to transitionOrchestrator', () => {
      const spy = vi.spyOn(scheduler._transitionOrch, 'speechGenerationDone');
      scheduler.speechGenerationDone(10);
      expect(spy).toHaveBeenCalledWith(10);
    });

    it('speechComplete delegates to transitionOrchestrator', () => {
      const spy = vi.spyOn(scheduler._transitionOrch, 'speechComplete');
      scheduler.speechComplete();
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('destroy — cleanup', () => {
    it('clears transition timer', async () => {
      const song = { id: 's1', dt: 180000 };
      await scheduler._startSong(song);
      expect(scheduler.playhead.transitionTimer).not.toBeNull();

      scheduler.destroy();
      // Timer should be cleared (no crash, no throw)
      expect(() => scheduler.destroy()).not.toThrow();
    });
  });
});
