import { describe, it, expect, vi } from 'vitest';
import { createPlanBlockService } from '../application/services/PlanBlockService.js';

function createDeps(overrides = {}) {
  const queue = {
    upcomingSongs: [{ id: 'next' }],
    mode: 'sequential',
    ...overrides.queue,
  };
  const recommender = {
    _planProgress: {
      autoMode: true,
      pinned: false,
      currentBlockIndex: 0,
      songsFilledInBlock: 4,
    },
    fillQueue: vi.fn(async () => [{ id: 'filled' }]),
    ...overrides.recommender,
  };
  const planner = {
    getPlan: vi.fn(() => ({
      plan: { blocks: [{ id: 'a' }, { id: 'b' }], mood: 'day' },
    })),
    ...overrides.planner,
  };
  return { queue, recommender, planner };
}

describe('PlanBlockService', () => {
  it('selectBlock_withIndex_updatesProgressRefillsQueueAndReturnsEvents', async () => {
    const deps = createDeps();
    const service = createPlanBlockService(deps);

    const result = await service.selectBlock(1);

    expect(deps.recommender._planProgress).toMatchObject({
      autoMode: false,
      currentBlockIndex: 1,
      songsFilledInBlock: 0,
    });
    expect(deps.recommender.fillQueue).toHaveBeenCalledWith(12, [{ id: 'a' }, { id: 'b' }]);
    expect(result).toEqual({
      queueUpdate: { upcomingSongs: [{ id: 'next' }], mode: 'sequential' },
      planUpdate: {
        blocks: [{ id: 'a' }, { id: 'b' }],
        mood: 'day',
        activeBlockIndex: 1,
      },
    });
  });

  it('pinBlock_withNull_resumesAutoModeAndKeepsDirectEventPayloadShape', async () => {
    const deps = createDeps({
      recommender: {
        _planProgress: {
          autoMode: false,
          pinned: true,
          currentBlockIndex: 1,
          songsFilledInBlock: 3,
        },
      },
    });
    const service = createPlanBlockService(deps);

    const result = await service.pinBlock(null);

    expect(deps.recommender._planProgress).toMatchObject({ autoMode: true, pinned: false });
    expect(deps.recommender.fillQueue).toHaveBeenCalledWith(12, [{ id: 'a' }, { id: 'b' }]);
    expect(result.planUpdate).toEqual({
      blocks: [{ id: 'a' }, { id: 'b' }],
      mood: 'day',
      activeBlockIndex: null,
      pinnedBlockIndex: null,
    });
  });

  it('clearSelection_resumesAutoModeUnpinsAndRefillsFromCachedPlan', async () => {
    const deps = createDeps({
      recommender: {
        _planProgress: {
          autoMode: false,
          pinned: true,
          currentBlockIndex: 1,
          songsFilledInBlock: 2,
        },
      },
    });
    const service = createPlanBlockService(deps);

    const result = await service.clearSelection();

    expect(deps.recommender._planProgress).toMatchObject({ autoMode: true, pinned: false });
    expect(deps.recommender.fillQueue).toHaveBeenCalledWith(12, [{ id: 'a' }, { id: 'b' }]);
    expect(result).toEqual({
      queueUpdate: { upcomingSongs: [{ id: 'next' }], mode: 'sequential' },
      planUpdate: {
        blocks: [{ id: 'a' }, { id: 'b' }],
        mood: 'day',
        activeBlockIndex: null,
        pinnedBlockIndex: null,
      },
    });
  });

  it('selectBlock_withoutPlanBlocks_doesNotRefillQueueButStillEmitsPlanUpdate', async () => {
    const deps = createDeps({
      planner: {
        getPlan: vi.fn(() => ({ plan: { blocks: [] } })),
      },
    });
    const service = createPlanBlockService(deps);

    const result = await service.selectBlock(0);

    expect(deps.recommender.fillQueue).not.toHaveBeenCalled();
    expect(result).toEqual({
      queueUpdate: null,
      planUpdate: { blocks: [], activeBlockIndex: 0 },
    });
  });
});
