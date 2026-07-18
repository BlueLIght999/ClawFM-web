import { describe, it, expect } from 'vitest';
import { buildSchedulerState } from '../domain/playback/schedulerStateRules.js';

describe('buildSchedulerState', () => {
  const basePlayhead = {
    currentSong: { id: 's1', name: 'Test Song', ar: [{ name: 'Artist' }], dt: 180000 },
    startedAt: 1700000000000,
    songDuration: 180000,
    isPlaying: true,
  };

  const baseQueue = {
    mode: 'normal',
    upcomingSongs: [
      { id: 's2', name: 'Next Song', ar: [{ name: 'Artist2' }] },
    ],
  };

  it('returns null currentSong when playhead has no song', () => {
    const state = buildSchedulerState({
      playhead: { ...basePlayhead, currentSong: null },
      queue: baseQueue,
      audioUrl: null,
      elapsedMs: 0,
    });
    expect(state.currentSong).toBeNull();
    expect(state.audioUrl).toBeNull();
  });

  it('maps currentSong through toPlayableSong', () => {
    const state = buildSchedulerState({
      playhead: basePlayhead,
      queue: baseQueue,
      audioUrl: 'http://audio.mp3',
      elapsedMs: 5000,
    });
    expect(state.currentSong).toBeTruthy();
    expect(state.currentSong.id).toBe('s1');
  });

  it('includes playback position from elapsed', () => {
    const state = buildSchedulerState({
      playhead: basePlayhead,
      queue: baseQueue,
      audioUrl: null,
      elapsedMs: 30000,
    });
    expect(state.elapsed).toBe(30);
    expect(state.duration).toBe(180);
  });

  it('includes queue mode and upcoming songs', () => {
    const state = buildSchedulerState({
      playhead: basePlayhead,
      queue: baseQueue,
      audioUrl: null,
      elapsedMs: 0,
    });
    expect(state.queueMode).toBe('normal');
    expect(state.upcomingSongs).toHaveLength(1);
  });

  it('includes startedAt and isPlaying from playhead', () => {
    const state = buildSchedulerState({
      playhead: basePlayhead,
      queue: baseQueue,
      audioUrl: null,
      elapsedMs: 0,
    });
    expect(state.startedAt).toBe(1700000000000);
    expect(state.isPlaying).toBe(true);
  });

  it('handles null playhead gracefully', () => {
    const state = buildSchedulerState({
      playhead: null,
      queue: baseQueue,
      audioUrl: null,
      elapsedMs: 0,
    });
    expect(state.currentSong).toBeNull();
    expect(state.isPlaying).toBe(false);
    expect(state.duration).toBe(0);
    expect(state.elapsed).toBe(0);
  });

  it('handles empty upcomingSongs array', () => {
    const state = buildSchedulerState({
      playhead: basePlayhead,
      queue: { mode: 'shuffle', upcomingSongs: [] },
      audioUrl: null,
      elapsedMs: 0,
    });
    expect(state.upcomingSongs).toEqual([]);
    expect(state.queueMode).toBe('shuffle');
  });

  it('handles zero duration gracefully', () => {
    const state = buildSchedulerState({
      playhead: { ...basePlayhead, songDuration: 0 },
      queue: baseQueue,
      audioUrl: null,
      elapsedMs: 5000,
    });
    expect(state.duration).toBe(0);
    expect(state.elapsed).toBe(5);
  });

  it('does not mutate inputs', () => {
    const playheadCopy = { ...basePlayhead };
    const queueCopy = { ...baseQueue, upcomingSongs: [...baseQueue.upcomingSongs] };
    buildSchedulerState({
      playhead: basePlayhead,
      queue: baseQueue,
      audioUrl: null,
      elapsedMs: 0,
    });
    expect(basePlayhead).toEqual(playheadCopy);
    expect(baseQueue).toEqual(queueCopy);
  });
});
