import { describe, test, expect } from 'vitest';
import { RadioScheduler } from '../services/scheduler.js';

describe('M4: TransitionOrchestrator playhead reference stays in sync', () => {
  test('orchestrator playhead matches scheduler playhead after seek()', () => {
    const scheduler = new RadioScheduler({ music: null, listenHistory: null });

    // Set up a playing song
    scheduler.playhead.currentSong = { id: 'song-1', title: 'Test', duration: 180 };
    scheduler.playhead.startedAt = Date.now();
    scheduler.playhead.songDuration = 180000;
    scheduler.playhead.isPlaying = true;

    // Before seek, references should match
    expect(scheduler._transitionOrch.playhead).toBe(scheduler.playhead);

    // Seek creates a new playhead object
    scheduler.seek(60);

    // After seek, orchestrator reference should be updated
    expect(scheduler._transitionOrch.playhead).toBe(scheduler.playhead);
  });

  test('orchestrator playhead matches scheduler playhead after pause()', () => {
    const scheduler = new RadioScheduler({ music: null, listenHistory: null });

    scheduler.playhead.currentSong = { id: 'song-1', title: 'Test', duration: 180 };
    scheduler.playhead.startedAt = Date.now() - 10000;
    scheduler.playhead.songDuration = 180000;
    scheduler.playhead.isPlaying = true;

    scheduler.pause();

    expect(scheduler._transitionOrch.playhead).toBe(scheduler.playhead);
  });

  test('orchestrator playhead matches scheduler playhead after resume()', () => {
    const scheduler = new RadioScheduler({ music: null, listenHistory: null });

    scheduler.playhead.currentSong = { id: 'song-1', title: 'Test', duration: 180 };
    scheduler.playhead.startedAt = Date.now() - 10000;
    scheduler.playhead.pausedAt = Date.now() - 5000;
    scheduler.playhead.songDuration = 180000;
    scheduler.playhead.isPlaying = false;

    scheduler.resume();

    expect(scheduler._transitionOrch.playhead).toBe(scheduler.playhead);
  });
});
