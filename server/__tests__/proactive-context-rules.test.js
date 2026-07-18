import { describe, it, expect } from 'vitest';
import { buildProactiveContext, computeHourChanged } from '../domain/hosting/proactiveContextRules.js';

describe('buildProactiveContext', () => {
  const baseScheduler = {
    currentSong: { id: 's1', name: 'Test Song' },
    songsSinceLastSpeech: 3,
  };
  const baseQueue = {
    upcomingSongs: [{ id: 's2' }, { id: 's3' }, { id: 's4' }],
  };

  it('returns context with currentSong from scheduler', () => {
    const ctx = buildProactiveContext({
      scheduler: baseScheduler,
      queue: baseQueue,
      getPlan: () => null,
      timeOfDay: 'morning',
      nowMs: 1700000000000,
      lastSpeechMs: 1700000000000 - 120000,
      hourChanged: false,
    });
    expect(ctx.currentSong).toEqual({ id: 's1', name: 'Test Song' });
  });

  it('returns nextSong and secondNext from queue upcomingSongs', () => {
    const ctx = buildProactiveContext({
      scheduler: baseScheduler,
      queue: baseQueue,
      getPlan: () => null,
      timeOfDay: 'morning',
      nowMs: 1700000000000,
      lastSpeechMs: 1700000000000 - 120000,
      hourChanged: false,
    });
    expect(ctx.nextSong).toEqual({ id: 's2' });
    expect(ctx.secondNext).toEqual({ id: 's3' });
  });

  it('returns null nextSong when queue is empty', () => {
    const ctx = buildProactiveContext({
      scheduler: baseScheduler,
      queue: { upcomingSongs: [] },
      getPlan: () => null,
      timeOfDay: 'morning',
      nowMs: 1700000000000,
      lastSpeechMs: 1700000000000 - 120000,
      hourChanged: false,
    });
    expect(ctx.nextSong).toBeNull();
    expect(ctx.secondNext).toBeNull();
  });

  it('returns null nextSong when queue has no upcomingSongs', () => {
    const ctx = buildProactiveContext({
      scheduler: baseScheduler,
      queue: {},
      getPlan: () => null,
      timeOfDay: 'morning',
      nowMs: 1700000000000,
      lastSpeechMs: 1700000000000 - 120000,
      hourChanged: false,
    });
    expect(ctx.nextSong).toBeNull();
  });

  it('extracts activeBlock from plan blocks[0]', () => {
    const ctx = buildProactiveContext({
      scheduler: baseScheduler,
      queue: baseQueue,
      getPlan: () => ({ plan: { blocks: [{ id: 'b1', genreHints: ['jazz'] }] } }),
      timeOfDay: 'morning',
      nowMs: 1700000000000,
      lastSpeechMs: 1700000000000 - 120000,
      hourChanged: false,
    });
    expect(ctx.activeBlock).toEqual({ id: 'b1', genreHints: ['jazz'] });
  });

  it('returns null activeBlock when plan has no blocks', () => {
    const ctx = buildProactiveContext({
      scheduler: baseScheduler,
      queue: baseQueue,
      getPlan: () => ({ plan: { blocks: [] } }),
      timeOfDay: 'morning',
      nowMs: 1700000000000,
      lastSpeechMs: 1700000000000 - 120000,
      hourChanged: false,
    });
    expect(ctx.activeBlock).toBeNull();
  });

  it('returns null activeBlock when plan is null', () => {
    const ctx = buildProactiveContext({
      scheduler: baseScheduler,
      queue: baseQueue,
      getPlan: () => null,
      timeOfDay: 'morning',
      nowMs: 1700000000000,
      lastSpeechMs: 1700000000000 - 120000,
      hourChanged: false,
    });
    expect(ctx.activeBlock).toBeNull();
  });

  it('handles plan without plan wrapper (direct blocks)', () => {
    const ctx = buildProactiveContext({
      scheduler: baseScheduler,
      queue: baseQueue,
      getPlan: () => ({ blocks: [{ id: 'b1' }] }),
      timeOfDay: 'morning',
      nowMs: 1700000000000,
      lastSpeechMs: 1700000000000 - 120000,
      hourChanged: false,
    });
    expect(ctx.activeBlock).toEqual({ id: 'b1' });
  });

  it('computes secondsSinceLastSpeech from nowMs and lastSpeechMs', () => {
    const ctx = buildProactiveContext({
      scheduler: baseScheduler,
      queue: baseQueue,
      getPlan: () => null,
      timeOfDay: 'morning',
      nowMs: 1700000001000,
      lastSpeechMs: 1700000000000,
      hourChanged: false,
    });
    expect(ctx.secondsSinceLastSpeech).toBe(1);
  });

  it('includes songsSinceLastSpeech from scheduler', () => {
    const ctx = buildProactiveContext({
      scheduler: { ...baseScheduler, songsSinceLastSpeech: 5 },
      queue: baseQueue,
      getPlan: () => null,
      timeOfDay: 'morning',
      nowMs: 1700000000000,
      lastSpeechMs: 1700000000000 - 120000,
      hourChanged: false,
    });
    expect(ctx.songsSinceLastSpeech).toBe(5);
  });

  it('handles undefined songsSinceLastSpeech as 0', () => {
    const ctx = buildProactiveContext({
      scheduler: { currentSong: { id: 's1' }, songsSinceLastSpeech: undefined },
      queue: baseQueue,
      getPlan: () => null,
      timeOfDay: 'morning',
      nowMs: 1700000000000,
      lastSpeechMs: 1700000000000 - 120000,
      hourChanged: false,
    });
    expect(ctx.songsSinceLastSpeech).toBe(0);
  });

  it('includes timeOfDay and hourChanged', () => {
    const ctx = buildProactiveContext({
      scheduler: baseScheduler,
      queue: baseQueue,
      getPlan: () => null,
      timeOfDay: 'evening',
      nowMs: 1700000000000,
      lastSpeechMs: 1700000000000 - 120000,
      hourChanged: true,
    });
    expect(ctx.timeOfDay).toBe('evening');
    expect(ctx.hourChanged).toBe(true);
  });

  it('does not mutate inputs', () => {
    const schedCopy = { ...baseScheduler };
    const queueCopy = { ...baseQueue, upcomingSongs: [...baseQueue.upcomingSongs] };
    buildProactiveContext({
      scheduler: baseScheduler,
      queue: baseQueue,
      getPlan: () => null,
      timeOfDay: 'morning',
      nowMs: 1700000000000,
      lastSpeechMs: 1700000000000 - 120000,
      hourChanged: false,
    });
    expect(baseScheduler).toEqual(schedCopy);
    expect(baseQueue).toEqual(queueCopy);
  });
});

describe('computeHourChanged', () => {
  it('returns false when lastHour is -1 (first call)', () => {
    expect(computeHourChanged(-1, 14)).toBe(false);
  });

  it('returns false when hour has not changed', () => {
    expect(computeHourChanged(14, 14)).toBe(false);
  });

  it('returns true when hour has changed', () => {
    expect(computeHourChanged(14, 15)).toBe(true);
  });

  it('returns true when hour wrapped around midnight', () => {
    expect(computeHourChanged(23, 0)).toBe(true);
  });
});
