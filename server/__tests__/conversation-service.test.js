import { describe, it, expect, vi } from 'vitest';
import { createConversationService } from '../application/services/ConversationService.js';

function createDeps(overrides = {}) {
  const queue = {
    future: [{ id: 'a' }],
    current: { id: 'now' },
    upcomingSongs: [{ id: 'a' }],
    mode: 'sequential',
    ...overrides.queue,
  };
  const scheduler = {
    playhead: { startedAt: 42 },
    skip: vi.fn(async () => {}),
    pause: vi.fn(),
    resume: vi.fn(),
    getState: vi.fn(() => ({ currentSong: { id: 'now' } })),
    ...overrides.scheduler,
  };
  const recommender = {
    fillQueue: vi.fn(async () => [{ id: 'fresh' }, { id: 'new' }]),
    fillQueueByPreference: vi.fn(async () => [{ id: 'pref' }]),
    setPlanBlocks: vi.fn(),
    seedPool: [{ id: 'seed-a' }, { id: 'seed-b' }],
    _planProgress: {
      autoMode: true,
      currentBlockIndex: 0,
      songsFilledInBlock: 0,
      pinned: false,
    },
    ...overrides.recommender,
  };
  const planner = {
    generatePlan: vi.fn(async () => ({ blocks: [{ id: 'fresh-plan' }] })),
    getPlan: vi.fn(() => ({ plan: { blocks: [{ id: 'block-a' }, { id: 'block-b' }] } })),
    ...overrides.planner,
  };
  const music = {
    search: vi.fn(async () => []),
    ...overrides.music,
  };
  const repositories = {
    profile: {
      get: vi.fn(() => ({ topArtists: [{ name: 'Artist' }] })),
    },
    ...overrides.repositories,
  };
  return { queue, scheduler, recommender, repositories, music, planner };
}

describe('ConversationService fast NCM actions', () => {
  it('skip_skipsAndReturnsRadioState', async () => {
    const deps = createDeps();
    const service = createConversationService(deps);

    const result = await service.handleFastAction({ route: 'ncm', action: 'skip' });

    expect(deps.scheduler.skip).toHaveBeenCalledOnce();
    expect(result).toEqual({ handled: true, state: { currentSong: { id: 'now' } } });
  });

  it('pauseAndResumeReturnPlaybackEvents', async () => {
    const deps = createDeps();
    const service = createConversationService(deps);

    expect(await service.handleFastAction({ route: 'ncm', action: 'pause' })).toEqual({
      handled: true,
      pause: true,
    });
    expect(await service.handleFastAction({ route: 'ncm', action: 'resume' })).toEqual({
      handled: true,
      resume: { startedAt: 42 },
    });
    expect(deps.scheduler.pause).toHaveBeenCalledOnce();
    expect(deps.scheduler.resume).toHaveBeenCalledOnce();
  });

  it('nowPlayingReturnsCurrentRadioStateForClientOnly', async () => {
    const deps = createDeps();
    const service = createConversationService(deps);

    const result = await service.handleFastAction({ route: 'ncm', action: 'now_playing' });

    expect(result).toEqual({
      handled: true,
      toClient: { state: { currentSong: { id: 'now' } } },
    });
  });

  it('recommendSnapshotsQueueFillsRecommendationsAndReturnsToolResults', async () => {
    const deps = createDeps();
    const service = createConversationService(deps);

    const result = await service.handleFastAction({ route: 'ncm', action: 'recommend' });

    expect(result.handled).toBe(false);
    expect(result.snapshot).toEqual({
      future: [{ id: 'a' }],
      current: { id: 'now' },
    });
    expect(result.queueUpdate).toEqual({ upcomingSongs: [{ id: 'a' }], mode: 'sequential' });
    expect(result.toolResults).toContain('DJ picked 2 fresh tracks');
    expect(result.toolResults).toContain('Top artists: Artist');
  });

  it('nonFastActionPassesThrough', async () => {
    const service = createConversationService(createDeps());

    await expect(service.handleFastAction({ route: 'chat', action: 'chat' })).resolves.toEqual({
      handled: false,
      toolResults: '',
    });
  });

  it('clearSnapshotWhenMessageIsNotARecommendationRejectionAction', () => {
    const service = createConversationService(createDeps());

    expect(service.nextSnapshot({ action: 'chat' }, { future: [{ id: 'old' }], current: null })).toBeNull();
    expect(service.nextSnapshot({ action: 'reject_recommend' }, { future: [], current: null })).toEqual({
      future: [],
      current: null,
    });
  });

  it('rejectRecommendAsksUserToRollbackOrRetryWhenSnapshotExists', async () => {
    const service = createConversationService(createDeps());

    const result = await service.handleRecommendationAction({
      routing: { action: 'reject_recommend' },
      snapshot: { future: [{ id: 'old' }], current: null },
    });

    expect(result.handled).toBe(false);
    expect(result.toolResults).toContain('Listener rejected the last batch');
    expect(result.snapshot).toEqual({ future: [{ id: 'old' }], current: null });
  });

  it('rollbackRestoresSnapshotFutureAndClearsSnapshot', async () => {
    const deps = createDeps();
    const service = createConversationService(deps);

    const result = await service.handleRecommendationAction({
      routing: { action: 'recommend_rollback' },
      snapshot: { future: [{ id: 'old' }, { id: 'older' }], current: null },
    });

    expect(deps.queue.future).toEqual([{ id: 'old' }, { id: 'older' }]);
    expect(result.snapshot).toBeNull();
    expect(result.queueUpdate).toEqual({ upcomingSongs: [{ id: 'a' }], mode: 'sequential' });
    expect(result.toolResults).toContain('Restored the pre-recommendation queue (2 songs)');
  });

  it('retrySnapshotsQueueAndFillsFreshRecommendations', async () => {
    const deps = createDeps();
    const service = createConversationService(deps);

    const result = await service.handleRecommendationAction({
      routing: { action: 'recommend_retry' },
      snapshot: null,
    });

    expect(deps.recommender.fillQueue).toHaveBeenCalledWith(10);
    expect(result.snapshot).toEqual({ future: [{ id: 'a' }], current: { id: 'now' } });
    expect(result.queueUpdate).toEqual({ upcomingSongs: [{ id: 'a' }], mode: 'sequential' });
    expect(result.toolResults).toContain('Re-recommended 2 fresh tracks');
  });

  it('personalizedRecommendationSnapshotsClearsThenRestoresOldFuture', async () => {
    const deps = createDeps({
      queue: { future: [{ id: 'old' }], upcomingSongs: [{ id: 'new' }, { id: 'old' }] },
      recommender: {
        fillQueueByPreference: vi.fn(async () => {
          deps.queue.future.push({ id: 'new' });
          return [{ id: 'new' }];
        }),
      },
    });
    const service = createConversationService(deps);

    const result = await service.handlePersonalizedRecommendation({
      action: 'play_personalized',
      params: { preference: 'jazz' },
    });

    expect(deps.recommender.fillQueueByPreference).toHaveBeenCalledWith('jazz', 10);
    expect(deps.recommender.fillQueue).not.toHaveBeenCalled();
    expect(deps.queue.future).toEqual([{ id: 'new' }, { id: 'old' }]);
    expect(result.snapshot).toEqual({ future: [{ id: 'old' }], current: { id: 'now' } });
    expect(result.queueUpdate).toEqual({ upcomingSongs: [{ id: 'new' }, { id: 'old' }], mode: 'sequential' });
    expect(result.toolResults).toContain('DJ used personalized recommendation pipeline for "jazz"');
    expect(result.toolResults).toContain('Added 1 songs');
    expect(result.toolResults).toContain('Seed pool: 2 songs');
  });

  it('personalizedRecommendationFallsBackToMusicSearchWhenRecommenderAddsNothing', async () => {
    const deps = createDeps({
      queue: { future: [{ id: 'old' }], upcomingSongs: [{ id: 'fallback' }, { id: 'old' }] },
      recommender: {
        fillQueue: vi.fn(async () => []),
      },
      music: {
        search: vi.fn(async () => [{ id: 'fallback' }]),
      },
    });
    const service = createConversationService(deps);

    const result = await service.handlePersonalizedRecommendation({
      action: 'play_personalized',
      params: {},
    });

    expect(deps.recommender.fillQueue).toHaveBeenCalledWith(10);
    expect(deps.music.search).toHaveBeenCalledWith('Artist', 10);
    expect(deps.queue.future).toEqual([{ id: 'fallback' }, { id: 'old' }]);
    expect(result.snapshot).toEqual({ future: [{ id: 'old' }], current: { id: 'now' } });
    expect(result.toolResults).toContain('Added 1 songs');
  });

  it('handlePersonalizedRecommendation_musicSearchFails_restoresOldFutureWithoutThrowing', async () => {
    const deps = createDeps({
      queue: { future: [{ id: 'old' }], upcomingSongs: [{ id: 'old' }] },
      recommender: {
        fillQueue: vi.fn(async () => []),
      },
      music: {
        search: vi.fn(async () => {
          throw new Error('music source down');
        }),
      },
    });
    const service = createConversationService(deps);

    const result = await service.handlePersonalizedRecommendation({
      action: 'play_personalized',
      params: {},
    });

    expect(deps.music.search).toHaveBeenCalledWith('Artist', 10);
    expect(deps.queue.future).toEqual([{ id: 'old' }]);
    expect(result.snapshot).toEqual({ future: [{ id: 'old' }], current: { id: 'now' } });
    expect(result.toolResults).toContain('Added 0 songs');
  });

  it('handlePlanAction_planRefresh_generatesNewPlanAndRefillsQueue', async () => {
    const deps = createDeps();
    const service = createConversationService(deps);

    const result = await service.handlePlanAction({
      routing: { route: 'ncm', action: 'plan_refresh' },
      text: '换个风格',
    });

    expect(deps.planner.generatePlan).toHaveBeenCalledWith(true);
    expect(deps.recommender.setPlanBlocks).toHaveBeenCalledWith([{ id: 'fresh-plan' }]);
    expect(deps.recommender.fillQueue).toHaveBeenCalledWith(15, [{ id: 'fresh-plan' }]);
    expect(result.handled).toBe(true);
    expect(result.planUpdate).toEqual({ blocks: [{ id: 'fresh-plan' }] });
    expect(result.queueUpdate).toEqual({ upcomingSongs: [{ id: 'a' }], mode: 'sequential' });
    expect(result.toolResults).toContain('Generated a fresh listening plan');
  });

  it('handlePlanAction_planSelect_setsSelectedBlockAndRefillsFromCachedPlan', async () => {
    const deps = createDeps();
    const service = createConversationService(deps);

    const result = await service.handlePlanAction({
      routing: { route: 'ncm', action: 'plan_select' },
      text: '切换到第二个主题',
    });

    expect(deps.recommender._planProgress).toMatchObject({
      autoMode: false,
      currentBlockIndex: 1,
      songsFilledInBlock: 0,
    });
    expect(deps.recommender.fillQueue).toHaveBeenCalledWith(12, [{ id: 'block-a' }, { id: 'block-b' }]);
    expect(result.handled).toBe(true);
    expect(result.planUpdate).toEqual({
      blocks: [{ id: 'block-a' }, { id: 'block-b' }],
      activeBlockIndex: 1,
    });
    expect(result.toolResults).toBe('Switched to block #2. Acknowledge this briefly.');
  });

  it('handlePlanAction_planPin_pinsCurrentBlock', async () => {
    const deps = createDeps({
      recommender: {
        _planProgress: {
          autoMode: true,
          currentBlockIndex: 1,
          songsFilledInBlock: 3,
          pinned: false,
        },
      },
    });
    const service = createConversationService(deps);

    const result = await service.handlePlanAction({
      routing: { route: 'ncm', action: 'plan_pin' },
      text: '钉住当前风格',
    });

    expect(deps.recommender._planProgress).toMatchObject({ pinned: true, autoMode: false });
    expect(deps.recommender.fillQueue).toHaveBeenCalledWith(12, [{ id: 'block-a' }, { id: 'block-b' }]);
    expect(result.planUpdate).toEqual({
      blocks: [{ id: 'block-a' }, { id: 'block-b' }],
      activeBlockIndex: 1,
      pinnedBlockIndex: 1,
    });
    expect(result.toolResults).toBe('Pinned the current block style. Acknowledge briefly.');
  });

  it('handlePlanAction_planClear_resumesAutoModeAndClearsPinnedBlock', async () => {
    const deps = createDeps({
      recommender: {
        _planProgress: {
          autoMode: false,
          currentBlockIndex: 1,
          songsFilledInBlock: 3,
          pinned: true,
        },
      },
    });
    const service = createConversationService(deps);

    const result = await service.handlePlanAction({
      routing: { route: 'ncm', action: 'plan_clear' },
      text: '恢复自动',
    });

    expect(deps.recommender._planProgress).toMatchObject({ autoMode: true, pinned: false });
    expect(deps.recommender.fillQueue).toHaveBeenCalledWith(12, [{ id: 'block-a' }, { id: 'block-b' }]);
    expect(result.planUpdate).toEqual({
      blocks: [{ id: 'block-a' }, { id: 'block-b' }],
      activeBlockIndex: null,
      pinnedBlockIndex: null,
    });
    expect(result.toolResults).toBe('Back to auto mode. Acknowledge briefly.');
  });
});
