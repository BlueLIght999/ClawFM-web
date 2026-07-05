import { describe, it, expect, vi } from 'vitest';
import { createConversationService } from '../application/services/ConversationService.js';

function createSystemDeps() {
  const queue = {
    future: [{ id: 'old-1' }, { id: 'old-2' }],
    current: { id: 'now' },
    get upcomingSongs() {
      return this.future;
    },
    mode: 'sequential',
  };
  const scheduler = {
    playhead: { startedAt: 100 },
    skip: vi.fn(async () => {}),
    pause: vi.fn(),
    resume: vi.fn(),
    getState: vi.fn(() => ({ currentSong: queue.current })),
  };
  const recommender = {
    seedPool: [{ id: 'seed' }],
    setPlanBlocks: vi.fn(),
    _planProgress: {
      autoMode: true,
      currentBlockIndex: 0,
      songsFilledInBlock: 0,
      pinned: false,
    },
    fillQueue: vi.fn(async () => []),
    fillQueueByPreference: vi.fn(async () => {
      queue.future.push({ id: 'new-1' }, { id: 'new-2' });
      return [{ id: 'new-1' }, { id: 'new-2' }];
    }),
  };
  const repositories = {
    profile: {
      get: vi.fn(() => ({ topArtists: [{ name: 'Artist' }] })),
    },
  };
  const music = {
    search: vi.fn(async () => []),
  };
  const planner = {
    generatePlan: vi.fn(async () => ({ blocks: [{ id: 'generated-a' }, { id: 'generated-b' }] })),
    getPlan: vi.fn(() => ({ plan: { blocks: [{ id: 'cached-a' }, { id: 'cached-b' }] } })),
  };

  return { queue, scheduler, recommender, repositories, music, planner };
}

describe('ConversationService recommendation system flow', () => {
  it('recommendationFlow_personalizedRejectRollback_restoresPreRecommendationQueue', async () => {
    const deps = createSystemDeps();
    const service = createConversationService(deps);

    const personalized = await service.handlePersonalizedRecommendation({
      action: 'play_personalized',
      params: { preference: 'jazz' },
    });
    const rejected = await service.handleRecommendationAction({
      routing: { action: 'reject_recommend' },
      snapshot: personalized.snapshot,
    });
    const rolledBack = await service.handleRecommendationAction({
      routing: { action: 'recommend_rollback' },
      snapshot: rejected.snapshot,
    });

    expect(deps.recommender.fillQueueByPreference).toHaveBeenCalledWith('jazz', 10);
    expect(personalized.snapshot.future).toEqual([{ id: 'old-1' }, { id: 'old-2' }]);
    expect(rejected.snapshot).toEqual(personalized.snapshot);
    expect(rolledBack.snapshot).toBeNull();
    expect(deps.queue.future).toEqual([{ id: 'old-1' }, { id: 'old-2' }]);
    expect(rolledBack.queueUpdate).toEqual({
      upcomingSongs: [{ id: 'old-1' }, { id: 'old-2' }],
      mode: 'sequential',
    });
  });

  it('planFlow_refreshSelectPinClear_updatesPlanProgressBehindService', async () => {
    const deps = createSystemDeps();
    const service = createConversationService(deps);

    const refreshed = await service.handlePlanAction({
      routing: { route: 'ncm', action: 'plan_refresh' },
      text: '换个风格',
    });
    const selected = await service.handlePlanAction({
      routing: { route: 'ncm', action: 'plan_select' },
      text: '切换到第二个主题',
    });
    const pinned = await service.handlePlanAction({
      routing: { route: 'ncm', action: 'plan_pin' },
      text: '钉住当前主题',
    });
    const cleared = await service.handlePlanAction({
      routing: { route: 'ncm', action: 'plan_clear' },
      text: '恢复自动',
    });

    expect(refreshed.planUpdate).toEqual({ blocks: [{ id: 'generated-a' }, { id: 'generated-b' }] });
    expect(selected.planUpdate.activeBlockIndex).toBe(1);
    expect(pinned.planUpdate.pinnedBlockIndex).toBe(1);
    expect(cleared.planUpdate).toMatchObject({ activeBlockIndex: null, pinnedBlockIndex: null });
    expect(deps.recommender._planProgress).toMatchObject({
      autoMode: true,
      currentBlockIndex: 1,
      pinned: false,
    });
  });
});
