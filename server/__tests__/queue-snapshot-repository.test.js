import { describe, it, expect, vi } from 'vitest';
import { createLegacyQueueSnapshotRepository } from '../infrastructure/persistence/repositories/LegacyQueueSnapshotRepository.js';

describe('QueueSnapshotRepository adapter', () => {
  it('latest_whenLegacyReturnsEmpty_returnsNull', () => {
    const repo = createLegacyQueueSnapshotRepository({
      getLatestQueueSnapshot: () => null,
      saveQueueSnapshot: vi.fn(),
    });

    expect(repo.latest()).toBeNull();
  });

  it('saveAndLatest_mapBetweenQueueStateAndLegacyJsonString', () => {
    let stored = null;
    const repo = createLegacyQueueSnapshotRepository({
      getLatestQueueSnapshot: () => stored,
      saveQueueSnapshot: (stateJson) => { stored = stateJson; },
    });
    const state = {
      past: [],
      current: { id: '1', title: 'A' },
      future: [{ id: '2', title: 'B' }],
      mode: 'shuffle',
      version: 3,
    };

    repo.save(state);

    expect(typeof stored).toBe('string');
    expect(repo.latest()).toEqual(state);
  });
});
