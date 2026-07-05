import { describe, it, expect, vi } from 'vitest';
import { createPlaybackService } from '../application/services/PlaybackService.js';

function createDeps(overrides = {}) {
  const queue = {
    future: [{ id: 1 }, { id: 2 }, { id: 3 }],
    upcomingSongs: [{ id: 1 }, { id: 2 }, { id: 3 }],
    mode: 'sequential',
    needsMore: vi.fn(() => false),
    insertNext: vi.fn(),
    setMode: vi.fn((mode) => { queue.mode = mode; }),
    ...overrides.queue,
  };
  const scheduler = {
    isAdvancing: false,
    playhead: { startedAt: 1234 },
    skip: vi.fn(async () => {}),
    previous: vi.fn(async () => {}),
    pause: vi.fn(),
    resume: vi.fn(),
    seek: vi.fn(),
    getState: vi.fn(() => ({ currentSong: { id: 'song' } })),
    getPlaybackPosition: vi.fn(() => ({ elapsed: 30, duration: 180 })),
    ...overrides.scheduler,
  };
  const recommender = {
    fillQueue: vi.fn(async () => [{ id: 'fresh' }]),
    ...overrides.recommender,
  };
  const music = {
    search: vi.fn(async () => []),
    ...overrides.music,
  };
  return {
    queue,
    scheduler,
    recommender,
    music,
    getPlan: overrides.getPlan || vi.fn(() => ({ plan: { blocks: [{ id: 'morning' }] } })),
  };
}

describe('PlaybackService', () => {
  it('skip_returnsStateAndQueueUpdate_andStartsBackgroundRefillWhenQueueNeedsMore', async () => {
    const deps = createDeps({
      queue: { needsMore: vi.fn(() => true) },
    });
    const service = createPlaybackService(deps);

    const result = await service.skip();

    expect(deps.scheduler.skip).toHaveBeenCalledOnce();
    expect(result.state).toEqual({ currentSong: { id: 'song' } });
    expect(result.queueUpdate).toEqual({ upcomingSongs: deps.queue.upcomingSongs, mode: 'sequential' });
    await result.refill;
    expect(deps.recommender.fillQueue).toHaveBeenCalledWith(12, [{ id: 'morning' }]);
  });

  it('pause_pausesSchedulerAndReturnsAnimationState', () => {
    const deps = createDeps();
    const service = createPlaybackService(deps);

    const result = service.pause();

    expect(deps.scheduler.pause).toHaveBeenCalledOnce();
    expect(result).toEqual({ crabAnimation: { state: 'idle' } });
  });

  it('resume_resumesSchedulerAndReturnsStartedAt', () => {
    const deps = createDeps();
    const service = createPlaybackService(deps);

    const result = service.resume();

    expect(deps.scheduler.resume).toHaveBeenCalledOnce();
    expect(result).toEqual({ resume: { startedAt: 1234 } });
  });

  it('seek_updatesSchedulerAndReturnsPlaybackPosition', () => {
    const deps = createDeps();
    const service = createPlaybackService(deps);

    const result = service.seek(42);

    expect(deps.scheduler.seek).toHaveBeenCalledWith(42);
    expect(result).toEqual({ playbackPosition: { elapsed: 30, duration: 180 } });
  });

  it('skipToIndex_ignoresInvalidIndex', async () => {
    const deps = createDeps();
    const service = createPlaybackService(deps);

    const result = await service.skipToIndex(9);

    expect(result).toBeNull();
    expect(deps.scheduler.skip).not.toHaveBeenCalled();
  });

  it('skipToIndex_removesEarlierFutureSongsAndSkips', async () => {
    const deps = createDeps();
    const service = createPlaybackService(deps);

    const result = await service.skipToIndex(2);

    expect(deps.queue.future).toEqual([{ id: 3 }]);
    expect(deps.scheduler.skip).toHaveBeenCalledOnce();
    expect(result.queueUpdate).toEqual({ upcomingSongs: deps.queue.upcomingSongs, mode: 'sequential' });
  });

  it('ended_ignoresWhenSchedulerIsAlreadyAdvancing', async () => {
    const deps = createDeps({ scheduler: { isAdvancing: true } });
    const service = createPlaybackService(deps);

    const result = await service.ended();

    expect(result).toBeNull();
    expect(deps.scheduler.skip).not.toHaveBeenCalled();
  });

  it('setMode_rejectsUnsupportedMode', () => {
    const deps = createDeps();
    const service = createPlaybackService(deps);

    const result = service.setMode('chaos');

    expect(result).toBeNull();
    expect(deps.queue.setMode).not.toHaveBeenCalled();
  });

  it('requestSong_emptyQuery_returnsNull', async () => {
    const deps = createDeps();
    const service = createPlaybackService(deps);

    const result = await service.requestSong('   ');

    expect(result).toBeNull();
    expect(deps.music.search).not.toHaveBeenCalled();
    expect(deps.queue.insertNext).not.toHaveBeenCalled();
  });

  it('requestSong_searchesMusicAndQueuesFirstSong', async () => {
    const song = { id: 's1', title: 'Stable Song' };
    const deps = createDeps({
      music: { search: vi.fn(async () => [song, { id: 's2', title: 'Other' }]) },
      queue: { upcomingSongs: [song] },
    });
    const service = createPlaybackService(deps);

    const result = await service.requestSong('Stable Song');

    expect(deps.music.search).toHaveBeenCalledWith('Stable Song', 5);
    expect(deps.queue.insertNext).toHaveBeenCalledWith(song);
    expect(result).toEqual({
      queueUpdate: { upcomingSongs: deps.queue.upcomingSongs },
      djMessage: { text: 'Queued: Stable Song' },
    });
  });

  it('requestSong_noResults_returnsNull', async () => {
    const deps = createDeps({ music: { search: vi.fn(async () => []) } });
    const service = createPlaybackService(deps);

    const result = await service.requestSong('missing song');

    expect(result).toBeNull();
    expect(deps.queue.insertNext).not.toHaveBeenCalled();
  });

  it('requestSong_searchFails_returnsSearchFailedError', async () => {
    const deps = createDeps({
      music: { search: vi.fn(async () => { throw new Error('network down'); }) },
    });
    const service = createPlaybackService(deps);

    const result = await service.requestSong('unstable song');

    expect(result).toEqual({
      error: { code: 'SEARCH_FAILED', message: 'network down' },
    });
    expect(deps.queue.insertNext).not.toHaveBeenCalled();
  });
});
